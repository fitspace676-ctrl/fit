# Configurable member-intake fields — design

**Date:** 2026-07-14
**Status:** Approved (brainstorming)
**Area:** `apps/admin` (Settings + Members), `@fit/types`

## Problem

The Add-Member drawer (Members page) renders a fixed set of inputs. Gyms differ
in what they collect at sign-up — some want only name/email/phone, others want
gender, date of birth, address, emergency contact, etc. Staff currently cannot
tailor the form.

## Goal

Let a gym admin choose, in **Settings → Membership**, which optional inputs
appear in the Add-Member drawer. The choice is gym-wide, persisted, and applied
the next time any staff member opens the "Add new member" drawer.

Scope is **visibility only** — the admin ticks which fields show. There is no
per-field "required vs optional" control in this iteration.

## Field decisions

| Field                                   | Behaviour                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, `email`                         | Always shown — required by the API's `createMemberSchema`; not toggleable.                                                                                                                                    |
| `surname`                               | Toggleable. **UI-only**: a separate "Surname" input that is joined onto `name` on submit (`[firstName, surname].filter(Boolean).join(' ')`). No data-model change.                                            |
| `phone`                                 | Toggleable.                                                                                                                                                                                                   |
| `gender`                                | Toggleable.                                                                                                                                                                                                   |
| `dateOfBirth`                           | Toggleable.                                                                                                                                                                                                   |
| `address`                               | Toggleable.                                                                                                                                                                                                   |
| `emergencyContact`                      | Toggleable — one switch governs the emergency name **and** phone pair.                                                                                                                                        |
| `membershipPlan`                        | Toggleable — the plan selector (`planId`).                                                                                                                                                                    |
| `startDate`                             | **Removed entirely** from the drawer. When a plan is enrolled the API already defaults the start to today (`members.service.ts:287` — `startDate ? new Date(startDate) : new Date()`), so no input is needed. |
| `paymentMethod`, `medicalNotes`, `tags` | Unchanged — remain always shown, outside this feature.                                                                                                                                                        |

### Defaults

New/unconfigured gyms default to: `phone` and `membershipPlan` **on**; `surname`,
`gender`, `dateOfBirth`, `address`, `emergencyContact` **off**. This keeps the
drawer close to a sensible minimum (name + email + phone + plan) out of the box.

## Architecture

Settings already live in the `Gym.settings` **JSON column** and are read/written
generically by `gym-settings.service.ts` (parse stored → merge partial → write
JSON). Adding a new section therefore needs **no database migration and no API
service/controller change** — only new Zod schema fields, which the existing
generic merge persists automatically. This mirrors the T12.17 depth-settings
pattern (business / policies / payments / tax / invoicing / auto-renewal).

### Layer 1 — `@fit/types/gym-settings.ts`

Add a new section schema and wire it into the two composite schemas:

```ts
export const gymMemberIntakeSettingsSchema = z.object({
  surname: z.boolean().default(false),
  phone: z.boolean().default(true),
  gender: z.boolean().default(false),
  dateOfBirth: z.boolean().default(false),
  address: z.boolean().default(false),
  emergencyContact: z.boolean().default(false),
  membershipPlan: z.boolean().default(true),
});
export type GymMemberIntakeSettings = z.infer<typeof gymMemberIntakeSettingsSchema>;
```

- `gymSettingsStoredSchema`: add `memberIntake: gymMemberIntakeSettingsSchema.default({})`.
- `updateGymSettingsSchema`: add `memberIntake: gymMemberIntakeSettingsSchema.partial().strict().optional()`.
- Note: `name` and `email` are intentionally absent from the schema — they are
  always shown and never configurable.

A `gym-settings.spec.ts` case asserts the section defaults and that a partial
update merges without clobbering other sections.

### Layer 2 — Settings → Membership UI (`settings-form.tsx`)

Under the existing Membership grace-period card, add a second card **"Add-member
form"** with one labelled switch per toggleable field (7 switches). Bind the
switches into the form's existing values object and the existing
`updateGymSettingsAction` save flow (which already sends a partial settings
patch — `memberIntake` is added to the patch it builds). No new save mechanism.

The section stays under the `membership` `SectionKey` (the user asked for it in
the Membership section); it is a second card within that section's panel, not a
new rail entry.

### Layer 3 — Add-Member drawer (`members/page.tsx` + `member-form.tsx`)

- `members/page.tsx` (server) additionally calls `fetchGymSettings()` and passes
  the resolved `memberIntake` config into the drawer / `MemberForm`. On a
  settings-load failure it falls back to the schema defaults so the drawer always
  works.
- `member-form.tsx` receives `intake: GymMemberIntakeSettings` and conditionally
  renders each toggleable field:
  - `surname`: when on, render a "Surname" input beside the name input; on
    submit, `name` is composed from first name + surname.
  - `phone`, `gender`, `dateOfBirth`, `address`: render only when their flag is on.
  - `emergencyContact`: render the name + phone pair only when on.
  - `membershipPlan`: render the plan selector only when on.
  - `startDate`: input removed unconditionally.
- Hidden fields submit no value (`undefined`), so the API leaves those columns
  untouched — consistent with `editableText`'s "omitted = leave alone" semantics.

### Layer 4 — i18n

Add label + helper keys for the new Settings card and the 7 switches, plus the
"Surname" field label, to both `packages/i18n/locales/en.json` and `ka.json`.

## Data flow

```
Admin toggles switches (Settings → Membership)
  → updateGymSettingsAction({ memberIntake: {...} })
  → PATCH /gyms/settings  (generic merge into Gym.settings JSON)

Staff opens Members page
  → page.tsx server-loads gym settings → memberIntake config
  → <MemberForm intake={memberIntake} />
  → drawer renders only enabled fields
  → submit composes name (+surname) and posts createMemberSchema payload
```

## Edge cases

- **Settings fetch fails on the Members page** → use `gymMemberIntakeSettingsSchema`
  defaults so the drawer still renders a working minimal form.
- **Plan enabled, no start date** → API defaults enrolment start to today; nothing
  to handle client-side.
- **All optional fields off** → drawer shows name + email (+ the unchanged
  payment/medical/tags block); still a valid create.
- **Surname toggled off after entering data** → not applicable at create time
  (single-shot drawer); no persisted surname to reconcile.

## Testing

- `@fit/types`: `gym-settings.spec.ts` — new section defaults + partial-merge.
- `member-form`: name composition (first + surname → `name`); a hidden field
  submits `undefined`; an enabled field submits its value.
- Manual: toggle each switch in Settings, save, reopen Add-Member drawer, confirm
  the field set matches; create a member with a plan and no start-date input →
  enrolment dated today.

## Out of scope

- Per-field required/optional configuration.
- Making `paymentMethod` / `medicalNotes` / `tags` toggleable.
- A real `surname` column on the member model.
- Applying the config to the member **edit** form or the public/member portal
  sign-up — this iteration governs the admin Add-Member drawer only.
