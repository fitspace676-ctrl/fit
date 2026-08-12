# Settings → Marketing: which merge fields the composer offers

## Problem

The marketing composer's merge-field palette is a hardcoded constant. Ten chips,
English labels baked into the type package, identical for every gym:

```ts
// packages/types/src/marketing.ts
export const MARKETING_MERGE_FIELDS: readonly MarketingMergeField[] = [
  { token: '{{first_name}}', label: 'First name' },
  …
];
```

`marketing.service.ts:95` returns that constant verbatim from `catalog()`. No gym
can trim it, extend it, or reach it at all.

Three concrete symptoms:

- **Three of the ten chips deliver nothing.** `{{location}}`, `{{class_name}}`
  and `{{payment_amount}}` are offered by the palette but filled by no resolver.
  Because `interpolateMergeFields` blanks tokens it _recognises_
  (`packages/types/src/marketing.ts`, `KNOWN_MERGE_KEYS`), they do not survive as
  visible `{{…}}` that staff would notice — they silently become empty string in
  the delivered mail. A staff member inserts "Your {{class_name}} class" and the
  member receives "Your class".

- **A gym cannot add a fact of its own.** A promo code, a booking URL, an offer
  deadline — the things a marketing email is actually about — have to be retyped
  into every template and every campaign.

- **The palette is not curated per gym.** A studio that runs no classes still
  sees a Class name chip; a single-site gym still sees Location.

The Automation side already solved this shape of problem in phase B
(`packages/types/src/automation-merge-fields.ts`): a curated catalogue, a
per-field Settings toggle (`gymAutomationFieldsSettingsSchema`), and a retirement
list so removing a chip cannot break saved bodies. This applies the same pattern
to Marketing.

## What actually sends

Stated plainly, because it bounds every "the send will fill it" claim below.

**`sendCampaign` does not send email.** It flips `status` to `sent`, snapshots
`audienceSize`, stamps `sentAt`, and returns (`marketing.service.ts:495`). The
marketing module contains no mail dispatch of any kind. Campaigns and scheduled
campaigns deliver nothing today.

The marketing token vocabulary is therefore expanded on exactly two paths:

1. **The member email drawer** — `members.service.ts:708` builds values via
   `memberMergeValues` and interpolates subject and body. This is the only path
   where a marketing token reaches a real recipient.
2. **Client-side preview** — the composer's live preview, with
   `blankMissing: false` so unresolved tokens stay visible to staff.

So "every offered field must be fillable" means **fillable by
`memberMergeValues`**. That method is where the resolver work in this spec lands.
When campaign sending is eventually built, it inherits the same value builder;
this spec does not build it.

## Scope

**In scope:** the marketing merge-field catalogue, a per-field on/off toggle in
Settings, gym-defined custom fields, and the resolver work to make every offered
token fillable.

**Out of scope:**

- Campaign email dispatch. Named above so nothing here reads as a promise that
  campaigns start delivering.
- Unifying the marketing and automation vocabularies. They stay separate
  catalogues with separate spellings (`{{first_name}}` vs
  `{{member_first_name}}`) — decided deliberately. Unifying would invalidate
  saved campaign and template bodies.
- Custom fields in Automation. A promo code would be useful in a rule email too,
  but offering a token there obliges the executor to fill it, which is separate
  work. The extension point is noted in the catalogue file.

## Semantics

A toggle that is **on** offers the chip in the composer; **off** removes it from
the picker. Switching a field off never edits a saved template or campaign — a
token already in a body still expands. Hiding a chip is a statement about what
staff are offered next time, not a retroactive edit.

All built-ins default **on**, so a gym that never opens Settings sees the palette
it has today minus the two retired chips.

### The catalogue

New file `packages/types/src/marketing-merge-fields.ts`, mirroring
`automation-merge-fields.ts` in shape and governed by its two rules:

1. Every offered field must be fillable by `memberMergeValues`.
2. Retiring a field does not un-know its token.

| Group      | Key               | Token                   |
| ---------- | ----------------- | ----------------------- |
| member     | `firstName`       | `{{first_name}}`        |
| member     | `lastName`        | `{{last_name}}`         |
| member     | `fullName`        | `{{full_name}}`         |
| member     | `email`           | `{{email}}`             |
| member     | `phone`           | `{{phone}}`             |
| member     | `joinDate`        | `{{join_date}}`         |
| member     | `birthday`        | `{{birthday}}`          |
| member     | `memberStatus`    | `{{member_status}}`     |
| membership | `planName`        | `{{plan_name}}`         |
| membership | `expiryDate`      | `{{expiry_date}}`       |
| membership | `daysUntilExpiry` | `{{days_until_expiry}}` |
| membership | `paymentAmount`   | `{{payment_amount}}`    |
| membership | `renewalDate`     | `{{renewal_date}}`      |
| business   | `businessName`    | `{{business_name}}`     |
| business   | `businessPhone`   | `{{business_phone}}`    |
| business   | `businessEmail`   | `{{business_email}}`    |
| business   | `businessAddress` | `{{business_address}}`  |
| business   | `businessWebsite` | `{{business_website}}`  |

Existing token spellings are preserved exactly. The seven tokens the composer
offers today and `memberMergeValues` already fills — `first_name`, `last_name`,
`email`, `phone`, `plan_name`, `expiry_date`, `business_name` — keep their
spelling, so every saved template and campaign body keeps working unchanged.

**Shared spellings are fine.** `{{business_name}}` already appears in both
catalogues, and `{{member_status}}` and `{{payment_amount}}` will too. Two
catalogues naming the same fact the same way is not the drift this spec is
guarding against — that is a token meaning _different_ things on the two sides.
Both resolve from one values map, so an implementer should leave these alone
rather than renaming for uniqueness.

**Deliberately excluded.** `GymMember` also carries `personalId`, `medicalNotes`,
`emergencyContactName`, `emergencyContactPhone`, `gender` and `address`. All are
resolvable and none are offered. A marketing email is the wrong surface to merge
a national ID or a medical note into, and "we could fill it" is not the test.

### Retirements

```ts
export const RETIRED_MARKETING_TOKENS: readonly string[] = ['location', 'class_name'];
```

Both drop out of the picker and stay in `KNOWN_MERGE_KEYS`, so a body saved
before this change still gets them blanked on send rather than delivering literal
braces. This list only ever grows.

`class_name` goes because a campaign has no class context. `location` goes
because a member has no home location to resolve — the same two reasons the
automation catalogue retired `class_name`/`member_location` in phase B.

`payment_amount` is the third dead chip and it is **not** retired. It is
resolvable — the subscription's plan price — so instead the resolver learns to
fill it.

### Custom fields

A gym-defined static snippet: a label, a token, and a value.

```ts
customFields: z.array(
  z.object({
    token: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .max(40),
    label: z.string().min(1).max(60),
    value: z.string().max(500),
  }),
)
  .max(12)
  .default([]);
```

Static text, not a per-member value. A per-member custom field would need a new
table, a migration, and an editor in the member form — a different piece of work.
Static covers what marketing copy actually needs: `{{promo_code}}`,
`{{booking_url}}`, `{{offer_ends}}`.

Because the value is stored beside the token, a custom field is fillable by
construction, which is what keeps rule 1 true as the palette grows.

**Collision is a validation error, not a resolver decision.** A `token` equal to
any built-in or retired token is rejected by the schema. Letting a gym define
`first_name` would silently shadow the member's real name in every send; the
schema is where that gets stopped.

Custom fields have no on/off toggle. Deleting the row is the off switch — a
disabled custom field is a row that does nothing, and two ways to remove one
thing is one too many.

### Settings storage

Follows the existing pattern exactly — a section on the `Gym.settings` JSON blob,
validated by `gymSettingsStoredSchema`:

```ts
export const gymMarketingFieldsSettingsSchema = z.object({
  firstName: z.boolean().default(true),
  …                                    // one per built-in key, all default true
  customFields: /* as above */,
});
```

Added to `gymSettingsStoredSchema` as `marketingFields`, and to the patch schema
as `gymMarketingFieldsSettingsSchema.partial().strict().optional()`, matching
`automationFields` on both lines.

## Design

### Catalogue → API

`marketing.service.ts:catalog()` stops returning a constant and becomes
gym-aware:

1. Read `marketingFields` from the gym's settings.
2. Filter `MARKETING_MERGE_FIELDS` to the keys toggled on.
3. Append each custom field as `{ token: '{{…}}', label }`.

The response type `MarketingCatalogResponse` is unchanged, which is what keeps
the two consumers untouched.

### Resolver

`memberMergeValues` (`members.service.ts:738`) gains the tokens it does not yet
fill: `full_name`, `join_date`, `birthday`, `member_status`,
`days_until_expiry`, `payment_amount`, `renewal_date`, and the four new
`business_*` values, plus every enabled custom field's value.

It needs two inputs it does not currently take: the gym's settings (for
`business_*` and the custom values) and a wider member select (`joinedAt`,
`dateOfBirth`, `status`, and the subscription's plan price). Both are already
loaded elsewhere in that service.

The existing `{{member_*}}` automation aliases stay in the returned map. They are
what lets a template written on either side personalize on the shared send-time
pass.

### Admin UI

Settings grows a `marketing` section beside the existing `automation` one, built
from the same pieces: a `SectionCard` per group, a `SwitchRow` per field with the
token as its description (staff learn the spelling by reading it there).

Below the groups, a custom-field editor: a list of `{ label, token, value }` rows
with add and remove. Token input is slugified as typed; a collision or a
malformed slug shows an inline error under the field, per the repo's form
convention.

`marketing/template-form-dialog.tsx:273` and `marketing/campaign-wizard.tsx:993`
both already render from `catalog.mergeFields`. **Neither changes.**

## Error handling

- **Collision or bad slug** — rejected by the schema; the form shows it inline
  under the offending row. The save is not attempted.
- **A gym toggles every field off** — allowed. The composer shows the "no merge
  fields" empty state rather than an empty strip; that state is new copy.
- **A saved body references a now-hidden built-in** — expands as before. Hiding
  is about the picker, never about stored text.
- **A saved body references a deleted custom field** — it is left visible rather
  than blanked. `KNOWN_MERGE_KEYS` is a static set built from the two catalogues;
  a custom token is per-gym and never enters it, so a custom token is only ever
  filled by having a value. Delete the row and the token stops being filled and
  falls through as raw `{{promo_code}}`. That is the correct fallback and matches
  the rule `interpolateMergeFields` already documents: an unknown token is a
  likely typo staff can still see and fix.

  This is the one asymmetry with built-ins, and it is deliberate. A built-in is
  retired centrally and blanked forever; a custom field belongs to one gym, and
  showing that gym its own dangling token is more useful than silently swallowing
  it.

## Testing

Mirroring `packages/types/src/automation-merge-fields.spec.ts`:

- Every catalogue key has a settings-schema key, and every settings key that is
  not `customFields` has a catalogue entry — the two lists cannot drift.
- No duplicate keys, no duplicate tokens.
- No offered token appears in `RETIRED_MARKETING_TOKENS`.
- Every offered token is present in the map `memberMergeValues` returns. This is
  rule 1 as an executable check, and it is the test that would have caught the
  three dead chips.
- Retired tokens remain in `KNOWN_MERGE_KEYS`.

Schema tests: a custom token colliding with a built-in is rejected; one colliding
with a retired token is rejected; a malformed slug is rejected; more than twelve
rows is rejected.

Service tests: `catalog()` omits a toggled-off field; `catalog()` includes a
custom field; `memberMergeValues` fills a custom field's value.

## Migration

None. `marketingFields` defaults to all-on with no custom fields, so an untouched
gym gets today's palette minus `location` and `class_name` — two chips that
produced empty string, removed on purpose.
