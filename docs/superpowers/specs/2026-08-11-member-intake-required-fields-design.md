# Settings → Membership drives which member-intake fields are required

## Problem

`Settings → Membership → Add-member form` presents twelve toggles
(`gymMemberIntakeSettingsSchema`, `packages/types/src/gym-settings.ts:294`). Today a
toggle only controls **visibility**: the admin add-member form hides the field when the
toggle is off, but when it is on the field still renders optional. Staff can leave every
one of them blank, so a gym that deliberately switched `personalId` or `emergencyContact`
on still gets members with those fields empty — which is the state the setting exists to
prevent.

The settings copy — _"Choose which inputs staff see when adding a new member"_ — describes
the current behaviour accurately and the intended behaviour not at all.

## Scope

**In scope:** the admin add-member form only — the roster drawer
(`add-member-drawer.tsx`), the full page (`members/new/page.tsx`), and the POS till
(`pos-add-member-drawer.tsx`). All three already receive `intake` and share
`member-form.tsx`.

**Out of scope:** the public join wizard (`apps/web/src/components/checkout/StepDetails.tsx`,
which hardcodes its own required set) and public `/member/register`. Both remain
independent of `memberIntake`.

## Semantics

A toggle that is **on** means the field is **shown and required**. A toggle that is
**off** means the field is not shown at all. Enforced client-side and server-side.

### Field-by-field

| Field                                                     | Behaviour                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`, `email`                                           | Already required by `createMemberSchema`. No change.                                                 |
| `phone`, `gender`, `dateOfBirth`, `personalId`, `address` | Required both sides when on.                                                                         |
| `emergencyContact`                                        | Requires **both** `emergencyContactName` and `emergencyContactPhone`.                                |
| `medicalNotes`                                            | Required when on. Defaults off, so switching it on is the gym's explicit decision about health data. |
| `surname`                                                 | Required **client-side only**.                                                                       |
| `membershipPlan`, `paymentMethod`                         | Visibility only — **never required**.                                                                |

### Why `surname` is client-only

`surname` is a UI-only split: the form joins it onto `name` via `composeName` before the
request leaves the browser (`member-form.tsx:308`), so the server receives one `name` and
has nothing separate to validate. Enforcing it in the browser is the only place the
distinction still exists.

### Why `membershipPlan` / `paymentMethod` are exempt

Both live in the enrolment block, which the POS till hides structurally
(`enrolment={false}`, `pos-add-member-drawer.tsx:129`) because at the till the enrolment
_is_ the cart — offering it in the form would invite charging the member twice. Requiring
a field the operator cannot see would make creating a member at the till impossible.
"No plan yet" is also a legitimate state for a walk-in.

### Why `edit` mode is unaffected

`member-form.tsx` serves both create and edit, and `show()` already returns `true` for
every field in edit mode. Requiredness follows the same rule: **create only**. A member
created while `address` was toggled off has no address, and blocking their next profile
edit until a staffer invents one would punish the gym for having changed its own setting.

## Design

### 1. One rule, two callers

A helper beside the schema in `packages/types/src/gym-settings.ts`:

```ts
/** The intake keys a create must supply, given the gym's toggles. */
export function requiredIntakeFields(intake: GymMemberIntakeSettings): IntakeFieldKey[];
```

It encodes the table above once — including the `membershipPlan` / `paymentMethod`
exemption. The admin form and the API both call it; neither restates the policy.

### 2. Server enforcement

A new `GymMemberIntakeService` (`apps/api/src/gyms/gym-member-intake.service.ts`), built
to the same shape as the existing `GymLocaleService` (`gym-locale.service.ts:48`): a thin
reader that pins the row to `tenant.gymId` (the `Gym` model is the tenant _root_ and sits
outside the Prisma tenant extension's scoped set), parses through
`gymSettingsStoredSchema` so a `null` blob still yields defaults, and returns
`memberIntake`.

Provided and exported by `GymsModule`; `MembersModule` imports it.

`MembersService.createMember` reads the intake before opening its transaction and rejects
a create that omits a required field with `400 MEMBER_INTAKE_REQUIRED`, naming the missing
fields so the console can surface something better than "invalid request".

### 3. Client enforcement

`member-form.tsx` derives the same set from its existing `intake` prop and marks the
inputs required — `isRequired` on the Astryx `TextInput`s, the native `required` attribute
on the plain `input` / `select` / `textarea` fields, and the `optional` label suffix
dropped for those fields. Create mode only.

### 4. Settings copy

The section description changes from "which inputs staff see" to wording that states
enabled fields are shown **and** required, in `en.json` and `ka.json`.

## Testing

- `packages/types/src/gym-settings.spec.ts` — `requiredIntakeFields` for the defaults, for
  an all-on gym, for an all-off gym, and that `membershipPlan` / `paymentMethod` never
  appear.
- `apps/api/src/members/members.service.spec.ts` — a create missing a required field is
  rejected with `MEMBER_INTAKE_REQUIRED`; the same create succeeds when the toggle is off;
  a complete create is unaffected.
- Existing `settings-i18n.spec.ts` covers the copy keys staying in sync across locales.
