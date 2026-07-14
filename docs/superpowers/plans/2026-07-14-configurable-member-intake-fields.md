# Configurable member-intake fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a gym admin choose, in Settings → Membership, exactly which inputs appear in the Add-Member drawer (fully config-driven), while removing the unused grace-period setting.

**Architecture:** Gym settings live in the `Gym.settings` JSON column, parsed/merged generically by the API — so a new `memberIntake` boolean-per-field section needs only Zod schema changes (no migration, no API service change). The admin Settings form gains a toggle card; the Members page server-loads the config and the Add-Member form renders only enabled fields.

**Tech Stack:** TypeScript, Zod, Next.js (App Router, React Server + Client Components), next-intl, StyleX, Vitest.

## Global Constraints

- Package manager: `pnpm` (workspace filters, e.g. `pnpm --filter @fit/admin`, `pnpm --filter @fit/types`).
- A husky pre-commit hook runs `prettier --check` on staged files — run `npx prettier --write <files>` before every commit or it will reject.
- All user-facing strings are i18n keys present in **both** `packages/i18n/locales/en.json` and `ka.json` — never hardcode copy.
- `name` and `email` are required by the API `createMemberSchema`; they stay toggleable but default **on**.
- `startDate` is removed from the Add-Member drawer entirely (API defaults enrolment start to today).
- Only the **create** Add-Member drawer is governed by the config; the member **edit** form renders all fields as before.
- Commit after each task with a `feat:`/`refactor:` message ending:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- `packages/types/src/gym-settings.ts` — remove `gymMembershipSettingsSchema`; add `gymMemberIntakeSettingsSchema` + wiring (Task 1).
- `packages/types/src/gym-settings.spec.ts` — **new**; defaults + partial-merge tests (Task 1).
- `apps/admin/app/(dashboard)/settings/settings-form.tsx` — replace grace card with the 12-switch intake card (Task 2).
- `packages/i18n/locales/en.json`, `ka.json` — remove `membership.gracePeriod*`; add `memberIntake.*` keys (Task 2).
- `apps/admin/lib/member-intake.ts` — **new**; `composeName` helper (Task 3).
- `apps/admin/lib/member-intake.spec.ts` — **new**; `composeName` tests (Task 3).
- `apps/admin/app/(dashboard)/members/member-form.tsx` — `intake` prop, conditional fields, surname, name composition, remove `startDate` (Task 3).
- `apps/admin/app/(dashboard)/members/add-member-drawer.tsx` — thread `intake` prop (Task 3).
- `apps/admin/app/(dashboard)/members/page.tsx` — server-load settings, pass `memberIntake` (Task 3).

---

## Task 1: Types — remove grace period, add `memberIntake` section

**Files:**

- Modify: `packages/types/src/gym-settings.ts` (lines 280–285 membership schema; 383–401 stored; 425–436 GymSettings interface; ~484 update schema)
- Create: `packages/types/src/gym-settings.spec.ts`

**Interfaces:**

- Produces: `gymMemberIntakeSettingsSchema` (Zod), `GymMemberIntakeSettings = { name, surname, email, phone, gender, dateOfBirth, address, emergencyContact, membershipPlan, paymentMethod, medicalNotes, tags: boolean }`, and `GymSettings.memberIntake: GymMemberIntakeSettings`.
- Removes: `gymMembershipSettingsSchema`, `GymMembershipSettings`, `GymSettings.membership`.

- [ ] **Step 1: Write the failing test** — create `packages/types/src/gym-settings.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  gymMemberIntakeSettingsSchema,
  gymSettingsStoredSchema,
  updateGymSettingsSchema,
} from './gym-settings';

describe('gymMemberIntakeSettingsSchema', () => {
  it('defaults name/email/phone/plan on and the rest off', () => {
    expect(gymMemberIntakeSettingsSchema.parse({})).toEqual({
      name: true,
      surname: false,
      email: true,
      phone: true,
      gender: false,
      dateOfBirth: false,
      address: false,
      emergencyContact: false,
      membershipPlan: true,
      paymentMethod: false,
      medicalNotes: false,
      tags: false,
    });
  });

  it('is part of stored settings and defaults from a bare object', () => {
    const stored = gymSettingsStoredSchema.parse({});
    expect(stored.memberIntake.name).toBe(true);
    expect(stored.memberIntake.gender).toBe(false);
    // grace-period membership section is gone
    expect('membership' in stored).toBe(false);
  });

  it('accepts a partial memberIntake update and rejects unknown keys', () => {
    expect(updateGymSettingsSchema.parse({ memberIntake: { gender: true } })).toEqual({
      memberIntake: { gender: true },
    });
    expect(updateGymSettingsSchema.safeParse({ memberIntake: { nope: true } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @fit/types test -- gym-settings.spec.ts`
Expected: FAIL — `gymMemberIntakeSettingsSchema` is not exported / `memberIntake` undefined.

- [ ] **Step 3: Implement — replace the membership schema.** In `packages/types/src/gym-settings.ts`, replace the `gymMembershipSettingsSchema` block (currently lines 280–285):

```ts
/**
 * Which inputs the admin-console Add-Member drawer shows. Every field is a
 * visibility toggle; `name`/`email` are required by `createMemberSchema` so they
 * default on (the Settings UI warns when they are turned off). `surname` is a
 * UI-only split joined onto `name`; `startDate` is intentionally absent (removed
 * from the drawer — the API defaults enrolment to today).
 */
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

/** The Add-Member drawer field-visibility config — {@link gymMemberIntakeSettingsSchema}. */
export type GymMemberIntakeSettings = z.infer<typeof gymMemberIntakeSettingsSchema>;
```

- [ ] **Step 4: Implement — wire into the composite schemas + interface.**
  - In `gymSettingsStoredSchema`, replace the line `membership: gymMembershipSettingsSchema.default({}),` with:
    `memberIntake: gymMemberIntakeSettingsSchema.default({}),`
  - In the `GymSettings` interface, replace `membership: GymMembershipSettings;` with:
    `memberIntake: GymMemberIntakeSettings;`
  - In `updateGymSettingsSchema`, replace `membership: gymMembershipSettingsSchema.partial().strict().optional(),` with:
    `memberIntake: gymMemberIntakeSettingsSchema.partial().strict().optional(),`

- [ ] **Step 5: Confirm nothing else references the removed symbols**

Run: `grep -rn "gymMembershipSettingsSchema\|GymMembershipSettings\|gracePeriodDays\|\.membership\b" packages/ apps/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: only hits are in `apps/admin/.../settings-form.tsx` (fixed in Task 2). If any `apps/api` spec references `membership`/`gracePeriodDays`, update it here (none expected).

- [ ] **Step 6: Run tests + typecheck to verify pass**

Run: `pnpm --filter @fit/types test -- gym-settings.spec.ts && pnpm --filter @fit/types typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/types/src/gym-settings.ts packages/types/src/gym-settings.spec.ts
git add packages/types/src/gym-settings.ts packages/types/src/gym-settings.spec.ts
git commit -m "feat(types): member-intake settings section; drop unused grace period

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Settings form — replace grace card with the intake toggle card

**Files:**

- Modify: `apps/admin/app/(dashboard)/settings/settings-form.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`
- Test: `apps/admin/app/(dashboard)/settings/settings-i18n.spec.ts` (new)

**Interfaces:**

- Consumes: `GymMemberIntakeSettings`, `gymMemberIntakeSettingsSchema` from `@fit/types` (Task 1).
- Produces: a `memberIntake` slice on `SettingsFormValues` + the saved patch, rendered under `section === 'membership'`.

- [ ] **Step 1: Add the i18n keys.** In `packages/i18n/locales/en.json`, under `admin.settings`, **remove** the `membership.gracePeriodLabel` / `membership.gracePeriodHint` keys and set the `membership` group to:

```json
"membership": {
  "title": "Add-member form",
  "subtitle": "Choose which inputs staff see when adding a new member.",
  "requiredWarning": "Members can't be created without this field.",
  "fields": {
    "name": "Name",
    "surname": "Surname",
    "email": "Email",
    "phone": "Phone",
    "gender": "Gender",
    "dateOfBirth": "Date of birth",
    "address": "Address",
    "emergencyContact": "Emergency contact",
    "membershipPlan": "Membership plan",
    "paymentMethod": "Payment method",
    "medicalNotes": "Medical notes",
    "tags": "Tags"
  }
}
```

Mirror the same structure in `packages/i18n/locales/ka.json` with Georgian copy:

```json
"membership": {
  "title": "ახალი წევრის ფორმა",
  "subtitle": "აირჩიე რომელი ველები დაინახოს პერსონალმა ახალი წევრის დამატებისას.",
  "requiredWarning": "ამ ველის გარეშე წევრი ვერ იქმნება.",
  "fields": {
    "name": "სახელი",
    "surname": "გვარი",
    "email": "ელფოსტა",
    "phone": "ტელეფონი",
    "gender": "სქესი",
    "dateOfBirth": "დაბადების თარიღი",
    "address": "მისამართი",
    "emergencyContact": "საგანგებო კონტაქტი",
    "membershipPlan": "წევრობის გეგმა",
    "paymentMethod": "გადახდის მეთოდი",
    "medicalNotes": "სამედიცინო ჩანაწერები",
    "tags": "თეგები"
  }
}
```

- [ ] **Step 2: Write the failing i18n test** — create `apps/admin/app/(dashboard)/settings/settings-i18n.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';

const FIELD_KEYS = [
  'name',
  'surname',
  'email',
  'phone',
  'gender',
  'dateOfBirth',
  'address',
  'emergencyContact',
  'membershipPlan',
  'paymentMethod',
  'medicalNotes',
  'tags',
] as const;

describe('member-intake settings i18n', () => {
  for (const locale of [en, ka] as const) {
    const m = (locale as any).admin.settings.membership;
    it('has title/subtitle/requiredWarning + every field label', () => {
      expect(typeof m.title).toBe('string');
      expect(typeof m.subtitle).toBe('string');
      expect(typeof m.requiredWarning).toBe('string');
      for (const key of FIELD_KEYS) expect(typeof m.fields[key]).toBe('string');
    });
    it('no longer has grace-period keys', () => {
      expect('gracePeriodLabel' in m).toBe(false);
    });
  }
});
```

Run: `pnpm --filter @fit/admin test -- settings-i18n.spec.ts`
Expected: FAIL until Step 1's JSON is in place (then it passes — run again to confirm before moving on).

- [ ] **Step 3: Remove grace from the form scaffolding.** In `apps/admin/app/(dashboard)/settings/settings-form.tsx`:
  - In `SettingsFormValues` (line ~648) replace `membership: { gracePeriodDays: number };` with:
    ```ts
    memberIntake: {
      name: boolean;
      surname: boolean;
      email: boolean;
      phone: boolean;
      gender: boolean;
      dateOfBirth: boolean;
      address: boolean;
      emergencyContact: boolean;
      membershipPlan: boolean;
      paymentMethod: boolean;
      medicalNotes: boolean;
      tags: boolean;
    }
    ```
  - In the `BoolFieldName` union (line ~669) add the twelve paths:
    ```ts
    | 'memberIntake.name' | 'memberIntake.surname' | 'memberIntake.email'
    | 'memberIntake.phone' | 'memberIntake.gender' | 'memberIntake.dateOfBirth'
    | 'memberIntake.address' | 'memberIntake.emergencyContact'
    | 'memberIntake.membershipPlan' | 'memberIntake.paymentMethod'
    | 'memberIntake.medicalNotes' | 'memberIntake.tags'
    ```
  - In the zod `schema` (line ~872) replace the `membership: z.object({ gracePeriodDays: ... })` block with:
    ```ts
    memberIntake: z.object({
      name: z.boolean(), surname: z.boolean(), email: z.boolean(), phone: z.boolean(),
      gender: z.boolean(), dateOfBirth: z.boolean(), address: z.boolean(),
      emergencyContact: z.boolean(), membershipPlan: z.boolean(),
      paymentMethod: z.boolean(), medicalNotes: z.boolean(), tags: z.boolean(),
    }),
    ```
  - In `sectionForErrors` (line ~733) replace `if (errors.membership) return 'membership';` with:
    `if (errors.memberIntake) return 'membership';`
  - In `handleSubmit`'s `input` object (line ~946) replace `membership: values.membership,` with:
    `memberIntake: values.memberIntake,`
  - In `toFormValues` (line ~1641) replace `membership: { gracePeriodDays: settings.membership.gracePeriodDays },` with:
    ```ts
    memberIntake: {
      name: settings.memberIntake.name,
      surname: settings.memberIntake.surname,
      email: settings.memberIntake.email,
      phone: settings.memberIntake.phone,
      gender: settings.memberIntake.gender,
      dateOfBirth: settings.memberIntake.dateOfBirth,
      address: settings.memberIntake.address,
      emergencyContact: settings.memberIntake.emergencyContact,
      membershipPlan: settings.memberIntake.membershipPlan,
      paymentMethod: settings.memberIntake.paymentMethod,
      medicalNotes: settings.memberIntake.medicalNotes,
      tags: settings.memberIntake.tags,
    },
    ```

- [ ] **Step 4: Replace the rendered card.** In the `section === 'membership'` block (line ~1336), replace the whole `<SectionCard>…</SectionCard>` (the grace-period `NumberField`) with:

```tsx
<SectionCard title={t('membership.title')} description={t('membership.subtitle')}>
  <div {...stylex.props(styles.switchList)}>
    {(
      [
        'name',
        'surname',
        'email',
        'phone',
        'gender',
        'dateOfBirth',
        'address',
        'emergencyContact',
        'membershipPlan',
        'paymentMethod',
        'medicalNotes',
        'tags',
      ] as const
    ).map((field) => (
      <SwitchRow
        key={field}
        name={`memberIntake.${field}` as BoolFieldName}
        label={t(`membership.fields.${field}`)}
        description={
          field === 'name' || field === 'email' ? t('membership.requiredWarning') : undefined
        }
      />
    ))}
  </div>
</SectionCard>
```

Note: confirm `SwitchRow`'s `description` prop is optional; it is used with a value elsewhere (e.g. `payments.acceptCash`), so passing `undefined` for non-required rows renders no description.

- [ ] **Step 5: Typecheck + run the i18n test**

Run: `pnpm --filter @fit/admin typecheck && pnpm --filter @fit/admin test -- settings-i18n.spec.ts`
Expected: PASS (no references to `membership.gracePeriodDays` remain; i18n keys present).

- [ ] **Step 6: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/settings/settings-form.tsx" "apps/admin/app/(dashboard)/settings/settings-i18n.spec.ts" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git add "apps/admin/app/(dashboard)/settings/settings-form.tsx" "apps/admin/app/(dashboard)/settings/settings-i18n.spec.ts" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(admin): member-intake toggle card in Settings → Membership

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add-Member drawer — render only enabled fields

**Files:**

- Create: `apps/admin/lib/member-intake.ts`, `apps/admin/lib/member-intake.spec.ts`
- Modify: `apps/admin/app/(dashboard)/members/member-form.tsx`
- Modify: `apps/admin/app/(dashboard)/members/add-member-drawer.tsx`
- Modify: `apps/admin/app/(dashboard)/members/page.tsx`

**Interfaces:**

- Consumes: `GymMemberIntakeSettings`, `gymMemberIntakeSettingsSchema` (Task 1); `fetchGymSettings` from `@/lib/api`.
- Produces: `composeName(name: string, surname: string): string`; `MemberForm` and `AddMemberDrawer` accept `intake?: GymMemberIntakeSettings`.

- [ ] **Step 1: Write the failing helper test** — create `apps/admin/lib/member-intake.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { composeName } from './member-intake';

describe('composeName', () => {
  it('joins name and surname with a single space', () => {
    expect(composeName('Ana', 'Beridze')).toBe('Ana Beridze');
  });
  it('trims and drops an empty surname', () => {
    expect(composeName('  Ana  ', '')).toBe('Ana');
    expect(composeName('Ana', '   ')).toBe('Ana');
  });
  it('drops an empty first name', () => {
    expect(composeName('', 'Beridze')).toBe('Beridze');
  });
});
```

Run: `pnpm --filter @fit/admin test -- member-intake.spec.ts`
Expected: FAIL — `composeName` not found.

- [ ] **Step 2: Implement the helper** — create `apps/admin/lib/member-intake.ts`:

```ts
// @fit/admin — Add-Member drawer helpers.

/**
 * Compose the single `name` the API stores from the drawer's first-name and
 * (optional, UI-only) surname inputs. Both are trimmed; empty parts are dropped
 * so `("Ana", "")` → `"Ana"` and `("Ana", "Beridze")` → `"Ana Beridze"`.
 */
export function composeName(name: string, surname: string): string {
  return [name.trim(), surname.trim()].filter(Boolean).join(' ');
}
```

Run: `pnpm --filter @fit/admin test -- member-intake.spec.ts`
Expected: PASS.

- [ ] **Step 3: Add the `intake` prop + surname state to `MemberForm`.** In `member-form.tsx`:
  - Add imports: `import type { GymMemberIntakeSettings } from '@fit/types';` and `import { composeName } from '@/lib/member-intake';`
  - Extend both `Props` variants (line ~184) with `intake?: GymMemberIntakeSettings;` (add to the `create` and `edit` objects).
  - After the `name` state (line 253) add: `const [surname, setSurname] = useState('');`
  - After `const seed = ...` add a visibility helper:
    ```ts
    // In edit mode every field shows (config governs the create drawer only).
    const show = (field: keyof GymMemberIntakeSettings): boolean =>
      isEdit || props.intake?.[field] !== false;
    ```
  - Remove the `startDate` state (line 268: `const [startDate, setStartDate] = useState('');`).

- [ ] **Step 4: Compose name + drop startDate on submit.** In `onSubmit` (lines 297–309):
  - Replace `const result = isEdit` block's `createMemberAction({ name, email, phone, ... startDate: startDate || undefined, ... })` so it uses the composed name and no `startDate`:
    ```ts
    startTransition(async () => {
      const composedName = composeName(name, surname);
      const result = isEdit
        ? await updateMemberAction(props.memberId, { name: composedName, phone, ...profile })
        : await createMemberAction({
            name: composedName,
            email,
            phone,
            status,
            ...profile,
            planId: planId || undefined,
            paymentMethod: paymentMethod || undefined,
          });
    ```
    (Note: `startDate` key is dropped from the payload; `createMemberSchema.startDate` is optional and the API defaults enrolment start to today.)

- [ ] **Step 5: Gate the fields in the JSX.** Wrap each field in its `show(...)` guard and add the surname input. Apply, in `member-form.tsx`'s form body:
  - **Name** (label `form.name`, ~line 335): wrap in `{show('name') && ( … )}`.
  - **Surname** — immediately after the name field, add:
    ```tsx
    {
      show('surname') && !isEdit ? (
        <TextField
          label={t('form.surname')}
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          startIcon={<Icon name="user" {...stylex.props(styles.sectionIcon)} />}
        />
      ) : null;
    }
    ```
    (Match the sibling `TextField` prop shape used by the name field; copy its `startIcon`/class props.)
  - **Email** (~348): wrap in `{show('email') && ( … )}`.
  - **Phone** (~363): wrap in `{show('phone') && ( … )}`.
  - **Date of birth** (~376): wrap in `{show('dateOfBirth') && ( … )}`.
  - **Gender** (~389): wrap in `{show('gender') && ( … )}`.
  - **Address** (~405): wrap in `{show('address') && ( … )}`.
  - **Emergency contact** name+phone pair (~426–450): wrap the whole pair in `{show('emergencyContact') && ( … )}`.
  - **Plan** selector (~465): wrap in `{show('membershipPlan') && ( … )}`.
  - **Start date** (~482): **delete** this field's JSX entirely.
  - **Payment method** (~497): wrap in `{show('paymentMethod') && ( … )}`.
  - **Medical notes** (~538): wrap in `{show('medicalNotes') && ( … )}`.
  - **Tags** (~553): wrap in `{show('tags') && ( … )}`.
  - Add the i18n key `admin.members.form.surname` = `"Surname"` (en) / `"გვარი"` (ka) in both locale files.

- [ ] **Step 6: Thread `intake` through the drawer.** In `add-member-drawer.tsx`:
  - Add `import type { GymMemberIntakeSettings } from '@fit/types';`
  - Change the component signature to `export function AddMemberDrawer({ intake }: { intake: GymMemberIntakeSettings })`.
  - Pass it to the form: `<MemberForm mode="create" intake={intake} onSuccess={…} onCancel={…} />`.

- [ ] **Step 7: Server-load the config in the Members page.** In `members/page.tsx`:
  - Extend the api import: `import { ApiError, fetchMembers, fetchGymSettings } from '@/lib/api';`
  - Add `import { gymMemberIntakeSettingsSchema } from '@fit/types';`
  - Before rendering, resolve the config with a safe fallback:
    ```tsx
    const memberIntake = await fetchGymSettings()
      .then((s) => s.memberIntake)
      .catch(() => gymMemberIntakeSettingsSchema.parse({}));
    ```
  - Update the render (line ~190): `{canWrite ? <AddMemberDrawer intake={memberIntake} /> : null}`.

- [ ] **Step 8: Typecheck + run the member tests**

Run: `pnpm --filter @fit/admin typecheck && pnpm --filter @fit/admin test -- member-intake.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npx prettier --write apps/admin/lib/member-intake.ts apps/admin/lib/member-intake.spec.ts "apps/admin/app/(dashboard)/members/member-form.tsx" "apps/admin/app/(dashboard)/members/add-member-drawer.tsx" "apps/admin/app/(dashboard)/members/page.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git add apps/admin/lib/member-intake.ts apps/admin/lib/member-intake.spec.ts "apps/admin/app/(dashboard)/members/member-form.tsx" "apps/admin/app/(dashboard)/members/add-member-drawer.tsx" "apps/admin/app/(dashboard)/members/page.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(admin): config-driven Add-Member drawer fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] Run the full admin + types test suites: `pnpm --filter @fit/types test && pnpm --filter @fit/admin test`
- [ ] Build the admin app: `pnpm --filter @fit/admin build`
- [ ] Manual: open Settings → Membership, toggle a few fields off (leave a required-field warning visible when `name`/`email` off), Save; reopen the Add-Member drawer on the Members page and confirm only the enabled fields render, surname (when on) appears, there is no start-date input, and creating a member with a plan succeeds (enrolment dated today).

## Notes on coverage vs spec

- Grace-period removal → Task 1 (types) + Task 2 (form/i18n).
- `memberIntake` schema + persistence → Task 1 (JSON, generic API merge; no migration/API change).
- Settings toggle card + required-field warning → Task 2.
- Config-driven drawer + surname composition + startDate removal + settings fetch/fallback → Task 3.
- Out of scope (unchanged): member edit form, member/public portal sign-up, per-field required/optional, real `surname` column.
