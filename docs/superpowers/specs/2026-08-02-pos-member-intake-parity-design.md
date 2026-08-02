# POS member intake parity — design

**Date:** 2026-08-02
**Status:** approved

## Problem

A member registered from the POS till and a member registered from the roster end up
with different data on file. The roster's Add-Member drawer collects the full profile —
date of birth, gender, national ID, address, emergency contact, medical notes. The POS
quick-create form collects three fields: name, email, phone.

The consequence is a two-tier roster. Whoever is registered at the till is permanently
thinner than whoever is registered from the members page, and nothing prompts anyone to
close the gap later. Staff who register at the till cannot record the information the
gym has decided it needs.

The goal is parity: **registering a member from the roster and registering a member from
the POS must ask for, and store, the same information.**

## What already exists

| Piece                                                                           | Where                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `MemberForm` — one component serving create + edit, rendering the full profile  | `apps/admin/app/(dashboard)/members/member-form.tsx`       |
| `AddMemberDrawer` — the roster's side sheet wrapping `MemberForm mode="create"` | `apps/admin/app/(dashboard)/members/add-member-drawer.tsx` |
| `gymMemberIntakeSettingsSchema` — per-gym field-visibility toggles              | `packages/types/src/gym-settings.ts:283`                   |
| Settings → Membership UI that edits those toggles                               | `apps/admin/app/(dashboard)/settings/settings-form.tsx`    |
| `createMemberSchema` — already accepts every profile field                      | `packages/types/src/members.ts:529`                        |
| `NewMemberForm` — the POS quick-create, hardcoded to name / email / phone       | `apps/admin/components/pos/member-lookup.tsx:409`          |
| `useSlideDrawer` — the console's shared side-sheet motion + staged close        | `apps/admin/hooks/use-slide-drawer.ts`                     |

The API is not the constraint. `createMemberSchema` already takes the whole profile;
the gap is entirely in the POS UI.

## What's missing

1. POS does not read `memberIntake` at all — its field set is hardcoded.
2. `MemberForm.onSuccess` returns `void`, so a caller cannot learn which member was
   created. POS must attach the new member to the sale in progress.
3. `createMemberAction` returns `{ id }` only — not enough to build a `PosMemberRow`.
4. `MemberForm` in create mode always offers plan / payment / status. At the till those
   duplicate the cart.
5. **`memberIntake.personalId` has no Settings control.** The field exists in the schema
   (`gym-settings.ts:295`, default `false`) but `settings-form.tsx` omits it from its zod
   object (`:895`), its field-name union (`:694`) and its toggle list (`:1375`). National
   ID can therefore never be switched on from the console — which would silently defeat
   parity for that one field.

## Design

### 1. One form, one config

Both entry points render the same `MemberForm mode="create"` with the same `memberIntake`
settings. Field visibility is decided in exactly one place — Settings → Membership — and
both surfaces obey it. A toggle flipped there changes the roster drawer and the till
together, which is what makes divergence structurally impossible rather than merely
unlikely.

The single deliberate difference: the POS drawer suppresses the membership-plan /
payment-method / status block, because at the till the enrolment _is_ the cart. Showing
it invites double-charging.

**Accepted trade-off.** Parity means POS registration takes longer than it does today
whenever a gym has many intake fields switched on. That is the gym's call to make, not
the code's: the `memberIntake` toggles are the speed control, and they now govern both
surfaces symmetrically.

### 2. Settings gains the National ID toggle

`personalId` joins the zod object, the field-name union and the rendered toggle list in
`settings-form.tsx`, with an i18n label at `membership.fields.personalId`. The schema
default stays `false` — this adds the ability to turn it on, it does not turn it on.

### 3. `MemberForm` gains two props and a richer callback

```ts
/** What a successful create hands back, enough to attach the member to a sale. */
export interface CreatedMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

type Props =
  | {
      mode: 'create';
      intake?: GymMemberIntakeSettings;
      /** Show the plan / payment / status enrolment block. Default true; POS passes false. */
      enrolment?: boolean;
      /** Overrides the submit button's label — POS says "Create & attach". */
      submitLabel?: string;
      onSuccess?: (member: CreatedMember) => void;
      onCancel?: () => void;
    }
  | { mode: 'edit' /* unchanged */ };
```

`enrolment: false` suppresses plan, payment method and status regardless of what
`memberIntake` says, because the reason to hide them at the till is structural, not
configurable.

Edit mode is untouched.

### 4. `createMemberAction` returns the created member

It currently returns `{ id }`. It returns `{ id, name, email, phone }` instead, so the POS
drawer can attach without a second round trip. `MemberForm` in edit mode ignores the extra
fields; the roster drawer's `onSuccess` ignores them too.

The 409 message moves up with it. `createPosMemberAction` has the better copy today — "A
member with that email already exists — search for them." — while the roster falls back to
a generic API message. One shared wording replaces both: **"A member with that email
already exists."** It is accurate on the roster and at the till alike; the POS-only
"search for them" is dropped rather than made conditional, because a message that changes
by caller is a second thing to keep in sync.

### 5. `PosAddMemberDrawer` — new component

`apps/admin/components/pos/pos-add-member-drawer.tsx` mirrors `AddMemberDrawer`: the same
`useSlideDrawer` + `Dialog` + `Layout` shell, so it moves like every other side sheet in
the console. It renders:

```tsx
<MemberForm
  key={drawer.contentKey}
  mode="create"
  intake={intake}
  enrolment={false}
  submitLabel={t('member.createAndAttach')}
  onSuccess={(member) => {
    drawer.requestClose();
    onCreated(member);
  }}
  onCancel={drawer.requestClose}
/>
```

`PosMemberRow` carries a `photoUrl` that `CreatedMember` does not — a member created at the
till has no photo yet. The drawer maps across with `photoUrl: null`, which is exactly what
`createPosMemberAction` does today (`pos/actions.ts:296`).

### 6. `MemberLookup` loses its inline form

`NewMemberForm` (`member-lookup.tsx:409-472`) and its dead styles (`newForm`, `newField`,
`newActions`) are deleted. The "Add new member" button opens the drawer instead of toggling
an inline form. The walk-in hint and the search behaviour are unchanged.

`createPosMemberAction` (`pos/actions.ts:270`) is deleted — `MemberForm` calls
`createMemberAction` directly.

### 7. POS page supplies the intake settings

`pos/page.tsx` fetches them exactly as the roster does (`members/page.tsx:137-140`):
kicked off before the catalogue fetch so the two overlap rather than serialise, gated on
`MemberWrite` so read-only staff skip the round trip, and falling back to schema defaults
if the settings call fails so the drawer still renders.

They thread `page → PosBoard → MemberLookup → PosAddMemberDrawer`.

## Data flow

```
POS page (server) ──fetchGymSettings()──> memberIntake
       │
       ▼
   PosBoard ──> MemberLookup ──> PosAddMemberDrawer
                                       │
                                       ▼
                    MemberForm(create, intake, enrolment=false)
                                       │
                            createMemberAction ──> POST /members
                                       │
                              onSuccess(CreatedMember)
                                       │
                     drawer closes ──> cart store attaches the member
```

## Error handling

| Case                       | Behaviour                                                                       |
| -------------------------- | ------------------------------------------------------------------------------- |
| Duplicate email (409)      | Inline message in the form; the drawer stays open so the entry is not lost      |
| Settings fetch fails       | Fall back to `gymMemberIntakeSettingsSchema` defaults; the drawer still renders |
| Caller lacks `MemberWrite` | `createMemberAction` already rejects; the trigger only renders when `canWrite`  |
| Drawer closed mid-typing   | `useSlideDrawer.contentKey` remounts the form clean — existing behaviour        |
| Validation error           | `createMemberSchema`'s first issue surfaces inline, as it does on the roster    |

## Testing

- **`packages/types`** — extend the gym-settings spec so a settings round trip carries
  `personalId`, guarding against the omission this design fixes.
- **Unit** — `MemberForm` with `enrolment={false}` renders no plan, payment or status
  control even when `memberIntake.membershipPlan` is `true`.
- **Unit** — `MemberForm` create mode honours `intake` toggles for `personalId`.
- **e2e (`apps/e2e`)** — with the full intake switched on: register a member from POS,
  assert the profile fields persisted and the member is attached to the cart; register one
  from the roster drawer and assert the same field set was offered.

## Out of scope

- The POS board layout is unchanged.
- No "incomplete profile" badges or backfill prompts for members created before this change.
- Extracting a shared `MemberProfileFields` component (a cleaner long-term boundary) is
  deliberately deferred — `member-form.tsx` was rewritten in #279 and the refactor's risk
  outweighs its benefit right now.
