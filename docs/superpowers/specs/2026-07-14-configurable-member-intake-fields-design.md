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

Let a gym admin choose, in **Settings → Membership**, exactly which inputs appear
in the Add-Member drawer. The drawer is **fully config-driven: only the fields
the admin ticks are shown** — there are no always-on fields. The choice is
gym-wide, persisted, and applied the next time any staff member opens the "Add
new member" drawer.

Scope is **visibility only** — the admin ticks which fields show. There is no
per-field "required vs optional" control in this iteration.

## Field decisions

Every drawer field is a toggle. `startDate` is the only field removed outright.

| Field              | Default | Notes                                                                                                                                                                          |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`             | on      | API-required to create a member (see warning below).                                                                                                                           |
| `surname`          | off     | **UI-only**: a separate "Surname" input joined onto `name` on submit (`[name, surname].filter(Boolean).join(' ')`). No data-model change.                                      |
| `email`            | on      | API-required to create a member.                                                                                                                                               |
| `phone`            | on      |                                                                                                                                                                                |
| `gender`           | off     |                                                                                                                                                                                |
| `dateOfBirth`      | off     |                                                                                                                                                                                |
| `address`          | off     |                                                                                                                                                                                |
| `emergencyContact` | off     | One switch governs the emergency name **and** phone pair.                                                                                                                      |
| `membershipPlan`   | on      | The plan selector (`planId`).                                                                                                                                                  |
| `paymentMethod`    | off     |                                                                                                                                                                                |
| `medicalNotes`     | off     |                                                                                                                                                                                |
| `tags`             | off     |                                                                                                                                                                                |
| `startDate`        | —       | **Removed entirely** from the drawer. When a plan is enrolled the API defaults the start to today (`members.service.ts:287` — `startDate ? new Date(startDate) : new Date()`). |

### Required-field guard (`name`, `email`)

`name` and `email` are required by the API's `createMemberSchema`, so hiding them
produces a drawer that cannot create a member. Per the decision to keep the form
fully config-driven, they stay toggleable — but:

- Their default is **on**.
- The Settings card shows a **non-blocking warning** next to the `name` / `email`
  switches when either is turned off ("Members can't be created without this
  field"), so the admin makes the choice knowingly.
- If a required field is nonetheless hidden and a create is attempted, the API
  returns its normal validation error, which the drawer already surfaces. No
  special client handling beyond the warning.

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
  name: z.boolean().default(true),
  surname: z.boolean().default(false),
  email: z.boolean().default(true),
  phone: z.boolean().default(true),
  gender: z.boolean().default(false),
  dateOfBirth: z.boolean().default(false),
  address: z.boolean().default(false),
  emergencyContact: z.boolean().default(false),
  membershipPlan: z.boolean().default(true),
  paymentMethod: z.boolean().default(false),
  medicalNotes: z.boolean().default(false),
  tags: z.boolean().default(false),
});
export type GymMemberIntakeSettings = z.infer<typeof gymMemberIntakeSettingsSchema>;
```

- `gymSettingsStoredSchema`: add `memberIntake: gymMemberIntakeSettingsSchema.default({})`.
- `updateGymSettingsSchema`: add `memberIntake: gymMemberIntakeSettingsSchema.partial().strict().optional()`.

A `gym-settings.spec.ts` case asserts the section defaults and that a partial
update merges without clobbering other sections.

### Layer 2 — Settings → Membership UI (`settings-form.tsx`)

Under the existing Membership grace-period card, add a second card **"Add-member
form"** with one labelled switch per field (12 switches, in the field-table
order). Bind the switches into the form's existing values object and the existing
`updateGymSettingsAction` save flow (which already sends a partial settings
patch — `memberIntake` is added to the patch it builds). No new save mechanism.

The `name` and `email` switches show the required-field warning when off. The
section stays under the `membership` `SectionKey` (the user asked for it in the
Membership section); it is a second card within that section's panel, not a new
rail entry.

### Layer 3 — Add-Member drawer (`members/page.tsx` + `member-form.tsx`)

- `members/page.tsx` (server) additionally calls `fetchGymSettings()` and passes
  the resolved `memberIntake` config into the drawer / `MemberForm`. On a
  settings-load failure it falls back to the schema defaults so the drawer always
  works.
- `member-form.tsx` receives `intake: GymMemberIntakeSettings` and conditionally
  renders each field:
  - `name`: render the name input when on.
  - `surname`: when on, render a "Surname" input beside the name input; on submit
    `name` is composed from name + surname.
  - `email`, `phone`, `gender`, `dateOfBirth`, `address`: render only when on.
  - `emergencyContact`: render the name + phone pair only when on.
  - `membershipPlan`: render the plan selector only when on.
  - `paymentMethod`, `medicalNotes`, `tags`: render only when on.
  - `startDate`: input removed unconditionally.
- Hidden fields submit no value (`undefined`), so the API leaves those columns
  untouched — consistent with `editableText`'s "omitted = leave alone" semantics.

### Layer 4 — i18n

Add label + helper keys for the new Settings card, the 12 switches, the
required-field warning, and the "Surname" field label, to both
`packages/i18n/locales/en.json` and `ka.json`.

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
  defaults so the drawer still renders a working form.
- **`name` or `email` hidden** → drawer can't create a member; the API returns its
  normal validation error and the Settings warning had already flagged it. No
  extra handling.
- **`name` off but `surname` on** → `name` is composed from the surname value
  alone; functional but discouraged (covered by the required-field warning).
- **Plan enabled, no start date** → API defaults enrolment start to today; nothing
  to handle client-side.
- **All fields off** → an empty drawer that cannot create; the warning covers the
  required-field part. Not otherwise special-cased.

## Testing

- `@fit/types`: `gym-settings.spec.ts` — new section defaults + partial-merge.
- `member-form`: name composition (name + surname → `name`); a hidden field
  submits `undefined`; an enabled field submits its value; the required-field
  warning renders when `name`/`email` are off.
- Manual: toggle each switch in Settings, save, reopen Add-Member drawer, confirm
  the field set matches; create a member with a plan (no start-date input) →
  enrolment dated today.

## Out of scope

- Per-field required/optional configuration.
- A real `surname` column on the member model.
- Applying the config to the member **edit** form or the public/member portal
  sign-up — this iteration governs the admin Add-Member drawer only.
