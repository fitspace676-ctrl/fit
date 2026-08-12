# Marketing Merge Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the marketing composer's merge-field palette gym-configurable — a curated catalogue with a per-field Settings toggle, plus gym-defined static custom fields — and make every offered token actually resolve.

**Architecture:** Mirrors the phase-B automation pattern exactly. A catalogue constant in `@fit/types` pairs 1:1 with a Zod settings section stored on the `Gym.settings` JSON blob. The API's `catalog()` filters the catalogue by the gym's toggles and appends custom fields; the wire type `MarketingCatalogResponse` is unchanged, so both composer consumers stay untouched. `memberMergeValues` grows to fill every offered token.

**Tech Stack:** TypeScript, Zod, NestJS, Prisma, React Hook Form, StyleX, Vitest.

## Global Constraints

- **Every offered token must be fillable by `memberMergeValues`.** Enforced by a test in Task 4. This is the rule whose absence let `{{location}}`, `{{class_name}}` and `{{payment_amount}}` ship as dead chips.
- **Retiring a token never un-knows it.** A retired token stays in `KNOWN_MERGE_KEYS` so old bodies get it blanked, never delivered as literal braces.
- **Existing token spellings are frozen.** `first_name`, `last_name`, `email`, `phone`, `plan_name`, `expiry_date`, `business_name` keep their exact spelling. Saved campaign and template bodies must keep working.
- **`MarketingCatalogResponse` shape is frozen:** `{ channels, mergeFields: readonly { token, label }[] }`. `marketing/template-form-dialog.tsx` and `marketing/campaign-wizard.tsx` are modified in **Task 7 only**, and only to handle an empty palette. Tasks 1–6 must not touch them.
- **Marketing and automation catalogues stay separate.** Do not merge them, do not rename a marketing token to be unique against an automation one. Shared spellings (`business_name`, `member_status`, `payment_amount`) are intentional.
- **No campaign send work.** `sendCampaign` does not dispatch email and this plan does not change that.
- All new files carry the repo's explanatory comment style — say why, not what.
- Run `npx prettier --write <files>` before every commit; the pre-commit hook rejects unformatted files.

---

### Task 1: The catalogue

**Files:**

- Create: `packages/types/src/marketing-merge-fields.ts`
- Create: `packages/types/src/marketing-merge-fields.spec.ts`
- Modify: `packages/types/index.ts` (add the export line)

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `MARKETING_MERGE_GROUPS: readonly ['member','membership','business']`
  - `type MarketingMergeGroup = (typeof MARKETING_MERGE_GROUPS)[number]`
  - `interface MarketingMergeFieldDef { key: string; token: string; label: string; group: MarketingMergeGroup }`
  - `MARKETING_MERGE_FIELD_DEFS: readonly MarketingMergeFieldDef[]` — 18 entries
  - `RETIRED_MARKETING_TOKENS: readonly string[]` — `['location','class_name']`
  - `MARKETING_MERGE_TOKEN_NAMES: readonly string[]` — bare names, offered + retired

The type is named `MarketingMergeFieldDef`, **not** `MarketingMergeField` — the latter already exists in `marketing.ts` as the `{ token, label }` wire type and must keep that meaning.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/marketing-merge-fields.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MARKETING_MERGE_FIELD_DEFS,
  MARKETING_MERGE_GROUPS,
  MARKETING_MERGE_TOKEN_NAMES,
  RETIRED_MARKETING_TOKENS,
} from './marketing-merge-fields';

describe('MARKETING_MERGE_FIELD_DEFS', () => {
  it('has unique keys and unique tokens', () => {
    const keys = MARKETING_MERGE_FIELD_DEFS.map((f) => f.key);
    const tokens = MARKETING_MERGE_FIELD_DEFS.map((f) => f.token);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('places every field in a known group', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(MARKETING_MERGE_GROUPS).toContain(field.group);
    }
  });

  it('writes every token as a braced snake_case placeholder', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(field.token).toMatch(/^\{\{[a-z0-9_]+\}\}$/);
    }
  });

  it('gives every field a non-empty label', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(field.label.length).toBeGreaterThan(0);
    }
  });

  it('never offers a token it has also retired', () => {
    const offered = MARKETING_MERGE_FIELD_DEFS.map((f) => f.token.replace(/[{}]/g, ''));
    for (const retired of RETIRED_MARKETING_TOKENS) {
      expect(offered).not.toContain(retired);
    }
  });

  // The seven tokens the composer offered before this change and the resolver
  // already filled. Re-spelling any of them silently breaks every saved
  // campaign and template body that uses it.
  it('preserves the spelling of every token that already shipped', () => {
    const offered = MARKETING_MERGE_FIELD_DEFS.map((f) => f.token);
    for (const token of [
      '{{first_name}}',
      '{{last_name}}',
      '{{email}}',
      '{{phone}}',
      '{{plan_name}}',
      '{{expiry_date}}',
      '{{business_name}}',
    ]) {
      expect(offered).toContain(token);
    }
  });

  it('lists both offered and retired names in MARKETING_MERGE_TOKEN_NAMES', () => {
    expect(MARKETING_MERGE_TOKEN_NAMES).toContain('first_name');
    expect(MARKETING_MERGE_TOKEN_NAMES).toContain('class_name');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/types && npx vitest run src/marketing-merge-fields.spec.ts`
Expected: FAIL — `Failed to resolve import "./marketing-merge-fields"`.

- [ ] **Step 3: Write the catalogue**

Create `packages/types/src/marketing-merge-fields.ts`:

```ts
/**
 * The merge fields a marketing template or campaign may insert.
 *
 * The marketing twin of `./automation-merge-fields`, governed by the same two
 * rules, and deliberately NOT merged with it: the two vocabularies spell the same
 * facts differently (`{{first_name}}` here, `{{member_first_name}}` there) and
 * unifying them would invalidate every campaign and template body already saved.
 *
 * 1. **Every field must be fillable.** A token the resolver cannot fill is not a
 *    feature — `interpolateMergeFields` blanks known tokens, so an unfillable
 *    chip does not fail loudly, it silently delivers an empty string. `location`
 *    and `class_name` did exactly that and are retired below.
 * 2. **Retiring a field does not un-know its token.** See
 *    {@link RETIRED_MARKETING_TOKENS}.
 *
 * "Fillable" means fillable by `MembersService.memberMergeValues` — the member
 * email drawer is the only path that actually delivers marketing copy today.
 * `sendCampaign` flips a status and sends nothing.
 */

/** The catalogue's grouping, in the order the composer and Settings show them. */
export const MARKETING_MERGE_GROUPS = ['member', 'membership', 'business'] as const;

/** One merge-field group — a member of {@link MARKETING_MERGE_GROUPS}. */
export type MarketingMergeGroup = (typeof MARKETING_MERGE_GROUPS)[number];

/**
 * One catalogue entry.
 *
 * Distinct from `MarketingMergeField` in `./marketing`, which is the WIRE shape
 * (`{ token, label }`) the composer renders. This is the fuller internal record:
 * the `key` is what the settings toggle hangs off, the `group` is what Settings
 * sorts by, and only `token` + `label` cross the wire.
 */
export interface MarketingMergeFieldDef {
  key: string;
  token: string;
  label: string;
  group: MarketingMergeGroup;
}

/** Every merge field a marketing message may insert. */
export const MARKETING_MERGE_FIELD_DEFS: readonly MarketingMergeFieldDef[] = [
  // -- The person --
  { key: 'firstName', token: '{{first_name}}', label: 'First name', group: 'member' },
  { key: 'lastName', token: '{{last_name}}', label: 'Last name', group: 'member' },
  { key: 'fullName', token: '{{full_name}}', label: 'Full name', group: 'member' },
  { key: 'email', token: '{{email}}', label: 'Email', group: 'member' },
  { key: 'phone', token: '{{phone}}', label: 'Phone', group: 'member' },
  { key: 'joinDate', token: '{{join_date}}', label: 'Join date', group: 'member' },
  { key: 'birthday', token: '{{birthday}}', label: 'Birthday', group: 'member' },
  { key: 'memberStatus', token: '{{member_status}}', label: 'Status', group: 'member' },
  // -- Their membership --
  { key: 'planName', token: '{{plan_name}}', label: 'Plan name', group: 'membership' },
  { key: 'expiryDate', token: '{{expiry_date}}', label: 'Expiry date', group: 'membership' },
  {
    key: 'daysUntilExpiry',
    token: '{{days_until_expiry}}',
    label: 'Days until expiry',
    group: 'membership',
  },
  {
    key: 'paymentAmount',
    token: '{{payment_amount}}',
    label: 'Payment amount',
    group: 'membership',
  },
  { key: 'renewalDate', token: '{{renewal_date}}', label: 'Renewal date', group: 'membership' },
  // -- The gym --
  { key: 'businessName', token: '{{business_name}}', label: 'Business name', group: 'business' },
  { key: 'businessPhone', token: '{{business_phone}}', label: 'Business phone', group: 'business' },
  { key: 'businessEmail', token: '{{business_email}}', label: 'Business email', group: 'business' },
  {
    key: 'businessAddress',
    token: '{{business_address}}',
    label: 'Business address',
    group: 'business',
  },
  {
    key: 'businessWebsite',
    token: '{{business_website}}',
    label: 'Business website',
    group: 'business',
  },
];

/**
 * Tokens the composer no longer offers but that saved bodies may still contain.
 *
 * `location` has no member column to resolve from; `class_name` has no class in a
 * campaign's context. Both were offered and filled by nothing, so both reached
 * members as empty string. They stay *known* so the blanking pass keeps handling
 * them. Additions here are permanent; this list only ever grows.
 */
export const RETIRED_MARKETING_TOKENS: readonly string[] = ['location', 'class_name'];

/** The bare name of every marketing token — offered and retired alike. */
export const MARKETING_MERGE_TOKEN_NAMES: readonly string[] = [
  ...MARKETING_MERGE_FIELD_DEFS.map((field) => field.token.replace(/[{}]/g, '')),
  ...RETIRED_MARKETING_TOKENS,
];
```

- [ ] **Step 4: Export from the package barrel**

In `packages/types/index.ts`, add beside the other `src/*` exports:

```ts
export * from './src/marketing-merge-fields';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/types && npx vitest run src/marketing-merge-fields.spec.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/types/src/marketing-merge-fields.ts packages/types/src/marketing-merge-fields.spec.ts packages/types/index.ts
git add packages/types/src/marketing-merge-fields.ts packages/types/src/marketing-merge-fields.spec.ts packages/types/index.ts
git commit -m "feat(types): add the marketing merge-field catalogue"
```

---

### Task 2: The settings section

**Files:**

- Modify: `packages/types/src/gym-settings.ts`
- Create: `packages/types/src/gym-marketing-fields.spec.ts`

**Interfaces:**

- Consumes: `MARKETING_MERGE_FIELD_DEFS`, `RETIRED_MARKETING_TOKENS` (Task 1).
- Produces:
  - `gymMarketingCustomFieldSchema` — `{ token: string; label: string; value: string }`
  - `gymMarketingFieldsSettingsSchema` — 18 booleans (all `.default(true)`) + `customFields`
  - `type GymMarketingFieldsSettings`
  - `type MarketingFieldToggle = keyof Omit<GymMarketingFieldsSettings, 'customFields'>`
  - `marketingFields` present on `gymSettingsStoredSchema`, on the `GymSettings` interface, and on the patch schema.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/gym-marketing-fields.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MARKETING_MERGE_FIELD_DEFS } from './marketing-merge-fields';
import { gymMarketingFieldsSettingsSchema, gymSettingsStoredSchema } from './gym-settings';

describe('gymMarketingFieldsSettingsSchema', () => {
  // A field in the catalogue with no toggle is unhideable; a toggle with no field
  // is a switch for nothing.
  it('matches the catalogue key for key', () => {
    const catalogue = MARKETING_MERGE_FIELD_DEFS.map((f) => f.key).sort();
    const parsed = gymMarketingFieldsSettingsSchema.parse({});
    const toggles = Object.keys(parsed)
      .filter((k) => k !== 'customFields')
      .sort();

    expect(toggles).toEqual(catalogue);
  });

  it('defaults every field on and custom fields empty', () => {
    const parsed = gymMarketingFieldsSettingsSchema.parse({});

    expect(parsed.customFields).toEqual([]);
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(parsed[field.key as keyof typeof parsed]).toBe(true);
    }
  });

  it('accepts a well-formed custom field', () => {
    const parsed = gymMarketingFieldsSettingsSchema.parse({
      customFields: [{ token: 'promo_code', label: 'Promo code', value: 'SUMMER25' }],
    });

    expect(parsed.customFields).toHaveLength(1);
  });

  // Shadowing a built-in would replace the member's real name in every send.
  it('rejects a custom token that collides with a built-in', () => {
    const result = gymMarketingFieldsSettingsSchema.safeParse({
      customFields: [{ token: 'first_name', label: 'Nope', value: 'x' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a custom token that collides with a retired token', () => {
    const result = gymMarketingFieldsSettingsSchema.safeParse({
      customFields: [{ token: 'class_name', label: 'Nope', value: 'x' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a malformed token slug', () => {
    const result = gymMarketingFieldsSettingsSchema.safeParse({
      customFields: [{ token: 'Promo Code', label: 'Nope', value: 'x' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects two custom fields sharing one token', () => {
    const result = gymMarketingFieldsSettingsSchema.safeParse({
      customFields: [
        { token: 'promo_code', label: 'A', value: '1' },
        { token: 'promo_code', label: 'B', value: '2' },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than twelve custom fields', () => {
    const rows = Array.from({ length: 13 }, (_, i) => ({
      token: `custom_${i}`,
      label: `Custom ${i}`,
      value: 'x',
    }));

    expect(gymMarketingFieldsSettingsSchema.safeParse({ customFields: rows }).success).toBe(false);
  });

  it('is part of the stored settings blob', () => {
    const stored = gymSettingsStoredSchema.parse({});

    expect(stored.marketingFields.firstName).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/types && npx vitest run src/gym-marketing-fields.spec.ts`
Expected: FAIL — `gymMarketingFieldsSettingsSchema is not exported`.

- [ ] **Step 3: Add the schema**

In `packages/types/src/gym-settings.ts`, add the import at the top beside the other local imports:

```ts
import { MARKETING_MERGE_FIELD_DEFS, RETIRED_MARKETING_TOKENS } from './marketing-merge-fields';
```

Then add this block immediately after `gymAutomationFieldsSettingsSchema`'s `AutomationFieldToggle` type:

```ts
/**
 * The token names a gym's custom merge field may not take: every built-in and
 * every retired one. Shadowing `first_name` would replace the member's real name
 * in every send, and the schema is where that gets stopped — a resolver that has
 * to guess which of two `first_name`s wins is a resolver with a bug in it.
 */
const RESERVED_MARKETING_TOKENS = new Set<string>([
  ...MARKETING_MERGE_FIELD_DEFS.map((field) => field.token.replace(/[{}]/g, '')),
  ...RETIRED_MARKETING_TOKENS,
]);

/**
 * One gym-defined merge field: a label, a token, and the static text it expands
 * to. Static rather than per-member on purpose — a value stored beside its token
 * is fillable by construction, which is what keeps the catalogue's "every field
 * must be fillable" rule true as gyms extend it.
 */
export const gymMarketingCustomFieldSchema = z.object({
  token: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'Use lowercase letters, numbers and underscores only')
    .max(40)
    .refine((token) => !RESERVED_MARKETING_TOKENS.has(token), 'That token is already in use'),
  label: z.string().min(1).max(60),
  value: z.string().max(500),
});

/** One gym-defined merge field — {@link gymMarketingCustomFieldSchema}. */
export type GymMarketingCustomField = z.infer<typeof gymMarketingCustomFieldSchema>;

/**
 * Which merge fields the marketing composer offers, plus the gym's own.
 *
 * Every boolean key is one entry of `MARKETING_MERGE_FIELD_DEFS`; switching it off
 * removes that chip from the picker. Saved templates and campaigns are untouched —
 * a token already in a body still expands, because hiding a chip is a statement
 * about what staff are offered next time, not a retroactive edit.
 *
 * All default **on**: the catalogue is curated to fields the resolver can fill, so
 * there is nothing here a gym needs protecting from.
 */
export const gymMarketingFieldsSettingsSchema = z.object({
  // -- The person --
  firstName: z.boolean().default(true),
  lastName: z.boolean().default(true),
  fullName: z.boolean().default(true),
  email: z.boolean().default(true),
  phone: z.boolean().default(true),
  joinDate: z.boolean().default(true),
  birthday: z.boolean().default(true),
  memberStatus: z.boolean().default(true),
  // -- Their membership --
  planName: z.boolean().default(true),
  expiryDate: z.boolean().default(true),
  daysUntilExpiry: z.boolean().default(true),
  paymentAmount: z.boolean().default(true),
  renewalDate: z.boolean().default(true),
  // -- The gym --
  businessName: z.boolean().default(true),
  businessPhone: z.boolean().default(true),
  businessEmail: z.boolean().default(true),
  businessAddress: z.boolean().default(true),
  businessWebsite: z.boolean().default(true),
  // -- The gym's own --
  customFields: z
    .array(gymMarketingCustomFieldSchema)
    .max(12)
    .default([])
    .refine(
      (rows) => new Set(rows.map((row) => row.token)).size === rows.length,
      'Two custom fields cannot share a token',
    ),
});

/** The marketing merge-field palette config — {@link gymMarketingFieldsSettingsSchema}. */
export type GymMarketingFieldsSettings = z.infer<typeof gymMarketingFieldsSettingsSchema>;

/** One marketing merge-field toggle — a boolean key of {@link GymMarketingFieldsSettings}. */
export type MarketingFieldToggle = keyof Omit<GymMarketingFieldsSettings, 'customFields'>;
```

- [ ] **Step 4: Wire it into the three places `automationFields` appears**

In `gymSettingsStoredSchema` (around line 577), directly after the `automationFields` line:

```ts
  marketingFields: gymMarketingFieldsSettingsSchema.default({}),
```

On the `GymSettings` interface (around line 612), directly after the `automationFields` line:

```ts
marketingFields: GymMarketingFieldsSettings;
```

In the patch schema (around line 671), directly after the `automationFields` line:

```ts
    marketingFields: gymMarketingFieldsSettingsSchema.partial().strict().optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/types && npx vitest run`
Expected: PASS — the new file's 9 tests plus every existing types test.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/types/src/gym-settings.ts packages/types/src/gym-marketing-fields.spec.ts
git add packages/types/src/gym-settings.ts packages/types/src/gym-marketing-fields.spec.ts
git commit -m "feat(types): add the marketing merge-field settings section"
```

---

### Task 3: Retire the dead tokens in the interpolator

**Files:**

- Modify: `packages/types/src/marketing.ts`
- Modify: `packages/types/src/marketing-merge-fields.spec.ts`
- Modify: `apps/api/src/marketing/marketing.service.ts` (import only)

`MARKETING_MERGE_FIELDS` — the old ten-entry `{ token, label }` constant — is deleted here. Task 5 replaces its one runtime use.

**Interfaces:**

- Consumes: `MARKETING_MERGE_TOKEN_NAMES` (Task 1).
- Produces: `KNOWN_MERGE_KEYS` covering offered + retired marketing tokens + all automation tokens. `MarketingMergeField` (the `{ token, label }` wire type) is unchanged and still exported.

- [ ] **Step 1: Write the failing test**

Append to `packages/types/src/marketing-merge-fields.spec.ts`:

```ts
import { interpolateMergeFields } from './marketing';

describe('marketing tokens and the interpolator', () => {
  it('blanks every offered token when no value is supplied', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(interpolateMergeFields(`x ${field.token} y`, {})).toBe('x  y');
    }
  });

  // A campaign body saved before a token was retired must not start leaking braces.
  it('blanks a retired token too', () => {
    for (const token of RETIRED_MARKETING_TOKENS) {
      expect(interpolateMergeFields(`x {{${token}}} y`, {})).toBe('x  y');
    }
  });

  it('still leaves a genuinely unknown token alone', () => {
    expect(interpolateMergeFields('hi {{not_a_field}}', {})).toBe('hi {{not_a_field}}');
  });
});
```

Move the `import { interpolateMergeFields } from './marketing';` line up to join the other imports at the top of the file rather than leaving it mid-file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/types && npx vitest run src/marketing-merge-fields.spec.ts`
Expected: FAIL on "blanks every offered token" — the new tokens (`full_name`, `join_date`, `birthday`, `member_status`, `days_until_expiry`, `renewal_date`, `business_phone`, `business_email`, `business_address`, `business_website`) are not in `KNOWN_MERGE_KEYS`, so they pass through as literal braces.

- [ ] **Step 3: Rebuild `KNOWN_MERGE_KEYS` and delete the old constant**

In `packages/types/src/marketing.ts`:

Add to the existing import from `./automation-merge-fields` a second import line:

```ts
import { MARKETING_MERGE_TOKEN_NAMES } from './marketing-merge-fields';
```

Replace the `KNOWN_MERGE_KEYS` definition with:

```ts
const KNOWN_MERGE_KEYS = new Set([...MARKETING_MERGE_TOKEN_NAMES, ...AUTOMATION_MERGE_KEYS]);
```

Delete the whole `MARKETING_MERGE_FIELDS` constant (the ten-entry array). Keep the `MarketingMergeField` interface and `MarketingCatalogResponse` exactly as they are — both are still the wire contract.

- [ ] **Step 4: Fix the now-broken import**

In `apps/api/src/marketing/marketing.service.ts`, remove `MARKETING_MERGE_FIELDS,` from the `@fit/types` import list. `catalog()` will not compile yet — that is expected and Task 5 fixes it. To keep this task's commit green, change line 95 to:

```ts
  catalog(): MarketingCatalogResponse {
    return { channels: MARKETING_CHANNEL_CATALOG, mergeFields: [] };
  }
```

with a comment on the line above:

```ts
// Filled from the gym's settings in the next task; an empty palette is the
// honest interim, not a silent fallback to a hardcoded list.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/types && npx vitest run`
Expected: PASS.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/api && npx vitest run src/marketing`
Expected: PASS. `marketing.service.spec.ts:99` asserts the catalog contains `{{first_name}}` — it will now fail. Update that assertion to expect an empty `mergeFields` array, and add a `// restored in the settings-driven catalog test` comment; Task 5 replaces it properly.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/types/src/marketing.ts packages/types/src/marketing-merge-fields.spec.ts apps/api/src/marketing/marketing.service.ts apps/api/src/marketing/marketing.service.spec.ts
git add packages/types/src/marketing.ts packages/types/src/marketing-merge-fields.spec.ts apps/api/src/marketing/marketing.service.ts apps/api/src/marketing/marketing.service.spec.ts
git commit -m "fix(marketing): retire the two merge tokens nothing could fill"
```

---

### Task 4: Fill every offered token

**Files:**

- Modify: `apps/api/src/members/members.service.ts`
- Create: `apps/api/src/members/member-merge-values.spec.ts`

**Interfaces:**

- Consumes: `MARKETING_MERGE_FIELD_DEFS` (Task 1), `GymMarketingFieldsSettings` (Task 2).
- Produces: exported pure function

  ```ts
  export function buildMemberMergeValues(input: {
    member: MemberMergeSource;
    gymName: string;
    settings: GymMarketingFieldsSettings;
    business: { phone: string; email: string; address: string; website: string };
    today: Date;
  }): MergeValues;
  ```

  and the exported source type

  ```ts
  export interface MemberMergeSource {
    status: string;
    joinedAt: Date;
    dateOfBirth: Date | null;
    user: { name: string | null; email: string; phone: string | null };
    subscriptions: {
      currentPeriodEnd: Date | null;
      plan: { name: string; priceAmount: number; currency: string } | null;
    }[];
  }
  ```

Extracting it as a free function is the point: the private method cannot be unit-tested without standing up Nest and Prisma, and this is the function the "every offered token is fillable" rule has to be checked against.

`SubscriptionPlan.priceAmount` is an `Int` in minor units and `SubscriptionPlan.currency` is a `String` (`schema.prisma:1701`). `{{payment_amount}}` renders both — `GEL 120.00`. A money figure in an outbound email without its currency is a defect, and "amount" in the token name is not a licence to ship a bare number.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/members/member-merge-values.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MARKETING_MERGE_FIELD_DEFS, gymMarketingFieldsSettingsSchema } from '@fit/types';
import { buildMemberMergeValues, type MemberMergeSource } from './member-merge-values';

const member: MemberMergeSource = {
  status: 'ACTIVE',
  joinedAt: new Date('2025-03-04T00:00:00Z'),
  dateOfBirth: new Date('1990-07-19T00:00:00Z'),
  user: { name: 'Nino Beridze', email: 'nino@example.com', phone: '+995 555 10 20 30' },
  subscriptions: [
    {
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      plan: { name: 'Unlimited', priceAmount: 12000, currency: 'GEL' },
    },
  ],
};

const business = {
  phone: '+995 322 00 00 00',
  email: 'hello@fitspace.ge',
  address: '12 Rustaveli Ave, Tbilisi',
  website: 'https://fitspace.ge',
};

function build(overrides?: Partial<Parameters<typeof buildMemberMergeValues>[0]>) {
  return buildMemberMergeValues({
    member,
    gymName: 'FitSpace',
    settings: gymMarketingFieldsSettingsSchema.parse({}),
    business,
    today: new Date('2026-08-12T00:00:00Z'),
    ...overrides,
  });
}

describe('buildMemberMergeValues', () => {
  // Rule 1 of the catalogue, as an executable check. This is the test that would
  // have caught {{location}}, {{class_name}} and {{payment_amount}} shipping dead.
  it('fills every token the catalogue offers', () => {
    const values = build();

    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      const name = field.token.replace(/[{}]/g, '');
      expect(values[name], `${field.token} is offered but never filled`).toBeDefined();
    }
  });

  it('splits the display name into first and last', () => {
    const values = build();

    expect(values.first_name).toBe('Nino');
    expect(values.last_name).toBe('Beridze');
    expect(values.full_name).toBe('Nino Beridze');
  });

  it('formats dates as YYYY-MM-DD', () => {
    const values = build();

    expect(values.join_date).toBe('2025-03-04');
    expect(values.birthday).toBe('1990-07-19');
    expect(values.expiry_date).toBe('2026-09-01');
    expect(values.renewal_date).toBe('2026-09-01');
  });

  it('counts whole days until expiry from today', () => {
    expect(build().days_until_expiry).toBe('20');
  });

  it('renders the plan price in major units', () => {
    expect(build().payment_amount).toBe('GEL 120.00');
  });

  it('carries the gym contact details', () => {
    const values = build();

    expect(values.business_name).toBe('FitSpace');
    expect(values.business_website).toBe('https://fitspace.ge');
  });

  // A blank is a fine value; an undefined is not. Undefined means the token falls
  // through to the blanking pass, which is the failure mode this whole change is
  // about.
  it('fills every token with an empty string when the member has no subscription', () => {
    const values = build({ member: { ...member, subscriptions: [], dateOfBirth: null } });

    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(values[field.token.replace(/[{}]/g, '')]).toBeDefined();
    }
    expect(values.plan_name).toBe('');
    expect(values.birthday).toBe('');
  });

  it('fills a custom field from its stored value', () => {
    const values = build({
      settings: gymMarketingFieldsSettingsSchema.parse({
        customFields: [{ token: 'promo_code', label: 'Promo code', value: 'SUMMER25' }],
      }),
    });

    expect(values.promo_code).toBe('SUMMER25');
  });

  // Hiding a chip is about the picker, never about stored bodies.
  it('still fills a token whose toggle is off', () => {
    const values = build({
      settings: gymMarketingFieldsSettingsSchema.parse({ phone: false }),
    });

    expect(values.phone).toBe('+995 555 10 20 30');
  });

  it('keeps the automation aliases so either vocabulary personalizes', () => {
    const values = build();

    expect(values.member_first_name).toBe('Nino');
    expect(values.member_plan_name).toBe('Unlimited');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/members/member-merge-values.spec.ts`
Expected: FAIL — `Failed to resolve import "./member-merge-values"`.

- [ ] **Step 3: Write the value builder**

Create `apps/api/src/members/member-merge-values.ts`:

```ts
import type { GymMarketingFieldsSettings, MergeValues } from '@fit/types';

/** Milliseconds in a day, for the days-until-expiry count. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** The member columns a merge-field expansion reads. */
export interface MemberMergeSource {
  status: string;
  joinedAt: Date;
  dateOfBirth: Date | null;
  user: { name: string | null; email: string; phone: string | null };
  subscriptions: {
    currentPeriodEnd: Date | null;
    plan: { name: string; priceAmount: number; currency: string } | null;
  }[];
}

/** `YYYY-MM-DD`, or an empty string for a null date. */
function isoDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

/**
 * Every merge value a marketing or automation message can expand, for one member.
 *
 * A free function rather than a service method so the catalogue's "every offered
 * field must be fillable" rule can be checked in a unit test without standing up
 * Nest and Prisma. That test is the whole reason this file exists.
 *
 * EVERY offered token gets a key, even when the underlying datum is missing — an
 * absent key falls through to `interpolateMergeFields`'s blanking pass, which is
 * indistinguishable from the bug this change fixes. A member with no subscription
 * gets `plan_name: ''`, deliberately, not `plan_name: undefined`.
 */
export function buildMemberMergeValues(input: {
  member: MemberMergeSource;
  gymName: string;
  settings: GymMarketingFieldsSettings;
  business: { phone: string; email: string; address: string; website: string };
  today: Date;
}): MergeValues {
  const { member, gymName, settings, business, today } = input;

  const fullName = (member.user.name ?? '').trim();
  const [firstName, ...rest] = fullName.length > 0 ? fullName.split(/\s+/) : [''];
  const first = firstName ?? '';
  const last = rest.join(' ');
  const phone = member.user.phone ?? '';

  const sub = member.subscriptions[0];
  const planName = sub?.plan?.name ?? '';
  const expiry = sub?.currentPeriodEnd ?? null;
  const price = sub?.plan?.priceAmount;
  const currency = sub?.plan?.currency ?? '';

  const daysLeft = expiry
    ? String(Math.max(0, Math.ceil((expiry.getTime() - today.getTime()) / DAY_MS)))
    : '';

  const values: MergeValues = {
    // -- Marketing vocabulary --
    first_name: first,
    last_name: last,
    full_name: fullName,
    email: member.user.email,
    phone,
    join_date: isoDate(member.joinedAt),
    birthday: isoDate(member.dateOfBirth),
    member_status: member.status,
    plan_name: planName,
    expiry_date: isoDate(expiry),
    days_until_expiry: daysLeft,
    payment_amount: price === undefined ? '' : `${currency} ${(price / 100).toFixed(2)}`.trim(),
    // The renewal date IS the period end — the day the current term stops is the
    // day the next one is charged. Two tokens for one date because gyms word it
    // both ways ("expires on" / "renews on") and a template should not have to
    // pick the wrong noun.
    renewal_date: isoDate(expiry),
    business_name: gymName,
    business_phone: business.phone,
    business_email: business.email,
    business_address: business.address,
    business_website: business.website,
    // -- Automation aliases, so a body from either store personalizes --
    member_first_name: first,
    member_last_name: last,
    member_email: member.user.email,
    member_phone: phone,
    member_plan_name: planName,
    member_expiry_date: isoDate(expiry),
  };

  // The gym's own fields last: the schema already refuses a token that collides
  // with a built-in, so this cannot shadow anything above it.
  for (const custom of settings.customFields) {
    values[custom.token] = custom.value;
  }

  return values;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/members/member-merge-values.spec.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Call it from the service**

In `apps/api/src/members/members.service.ts`:

Delete the private `memberMergeValues` method (around line 738) entirely and import the new function:

```ts
import { buildMemberMergeValues } from './member-merge-values';
```

Widen the member select in the email method (around line 685) so the new columns are loaded:

```ts
      select: {
        status: true,
        joinedAt: true,
        dateOfBirth: true,
        user: { select: { name: true, email: true, phone: true } },
        subscriptions: {
          select: {
            currentPeriodEnd: true,
            plan: { select: { name: true, priceAmount: true, currency: true } },
          },
        },
      },
```

Keep whatever `where`/`take`/`orderBy` the existing select already carries on `subscriptions`.

Replace `resolveGymName` with a loader that returns the settings too, since both are now needed:

```ts
  /** The gym's name, marketing-field settings and contact details, for a send. */
  private async resolveGymMergeContext(): Promise<{
    gymName: string;
    settings: GymMarketingFieldsSettings;
    business: { phone: string; email: string; address: string; website: string };
  }> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { name: true, settings: true },
    });
    const stored = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    return {
      gymName: gym?.name ?? 'Your gym',
      settings: stored.marketingFields,
      business: {
        phone: stored.business.phone ?? '',
        email: stored.business.email ?? '',
        address: stored.business.address ?? '',
        website: stored.business.website ?? '',
      },
    };
  }
```

Before writing that method, run `grep -n "phone\|email\|address\|website" packages/types/src/gym-settings.ts | sed -n '1,40p'` and read `gymBusinessSettingsSchema` to confirm the four business field names and whether they are optional. Use the real names; drop `?? ''` on any that are already required with a default.

Then at the call site (around line 707):

```ts
const { gymName, settings, business } = await this.resolveGymMergeContext();
const values = buildMemberMergeValues({
  member,
  gymName,
  settings,
  business,
  today: new Date(),
});
```

The `renderBrandedEmail({ senderName: gymName, … })` call below is unchanged.

- [ ] **Step 6: Run the members tests**

Run: `cd apps/api && npx vitest run src/members`
Expected: PASS. If a members spec stubbed the old `resolveGymName`, point the stub at `resolveGymMergeContext` and give it the three-key return shape above.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
npx prettier --write apps/api/src/members/member-merge-values.ts apps/api/src/members/member-merge-values.spec.ts apps/api/src/members/members.service.ts
git add apps/api/src/members/member-merge-values.ts apps/api/src/members/member-merge-values.spec.ts apps/api/src/members/members.service.ts
git commit -m "feat(members): fill every offered marketing merge token"
```

---

### Task 5: Serve the catalogue from the gym's settings

**Files:**

- Modify: `apps/api/src/marketing/marketing.service.ts`
- Modify: `apps/api/src/marketing/marketing.service.spec.ts`

**Interfaces:**

- Consumes: `MARKETING_MERGE_FIELD_DEFS` (Task 1), `gymSettingsStoredSchema` + `MarketingFieldToggle` (Task 2).
- Produces: `catalog()` becomes `async catalog(): Promise<MarketingCatalogResponse>`. The controller must be awaited accordingly.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/marketing/marketing.service.spec.ts`, replace the existing catalog assertion (line 99) with:

```ts
  it('offers every built-in field by default', async () => {
    const catalog = await service.catalog();

    expect(catalog.mergeFields.some((m) => m.token === '{{first_name}}')).toBe(true);
    expect(catalog.mergeFields).toHaveLength(MARKETING_MERGE_FIELD_DEFS.length);
  });

  it('omits a field the gym switched off', async () => {
    gymRow.settings = { marketingFields: { phone: false } };

    const catalog = await service.catalog();

    expect(catalog.mergeFields.some((m) => m.token === '{{phone}}')).toBe(false);
    expect(catalog.mergeFields.some((m) => m.token === '{{email}}')).toBe(true);
  });

  it('appends the gym's own custom fields', async () => {
    gymRow.settings = {
      marketingFields: {
        customFields: [{ token: 'promo_code', label: 'Promo code', value: 'SUMMER25' }],
      },
    };

    const catalog = await service.catalog();

    expect(catalog.mergeFields).toContainEqual({ token: '{{promo_code}}', label: 'Promo code' });
  });

  // A retired token must never come back through the picker.
  it('never offers a retired token', async () => {
    const catalog = await service.catalog();

    expect(catalog.mergeFields.some((m) => m.token === '{{class_name}}')).toBe(false);
    expect(catalog.mergeFields.some((m) => m.token === '{{location}}')).toBe(false);
  });
```

Add to that file's imports:

```ts
import { MARKETING_MERGE_FIELD_DEFS } from '@fit/types';
```

Read the top of `marketing.service.spec.ts` to see how it fakes Prisma. Introduce a mutable `gymRow` object (`let gymRow: { name: string; settings: unknown }`) reset in `beforeEach` to `{ name: 'FitSpace', settings: {} }`, and make the fake `gym.findFirst` resolve it. Follow the file's existing mocking style rather than introducing a new one.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/marketing/marketing.service.spec.ts`
Expected: FAIL — `catalog()` returns `mergeFields: []` from Task 3.

- [ ] **Step 3: Make `catalog()` gym-aware**

In `apps/api/src/marketing/marketing.service.ts`, add to the `@fit/types` import list:

```ts
  MARKETING_MERGE_FIELD_DEFS,
  gymSettingsStoredSchema,
  type MarketingFieldToggle,
```

Replace the `catalog()` method with:

```ts
  /**
   * The channel + merge-field catalogs the composer (T12.8) renders from.
   *
   * The merge-field half is per gym: the built-ins the gym has left switched on,
   * then its own custom fields. The response shape is unchanged, which is what
   * lets the template dialog and the campaign wizard stay untouched — they were
   * already rendering whatever this returns.
   */
  async catalog(): Promise<MarketingCatalogResponse> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    const { marketingFields } = gymSettingsStoredSchema.parse(gym?.settings ?? {});

    const builtIns = MARKETING_MERGE_FIELD_DEFS.filter(
      (field) => marketingFields[field.key as MarketingFieldToggle],
    ).map((field) => ({ token: field.token, label: field.label }));

    const custom = marketingFields.customFields.map((field) => ({
      token: `{{${field.token}}}`,
      label: field.label,
    }));

    return { channels: MARKETING_CHANNEL_CATALOG, mergeFields: [...builtIns, ...custom] };
  }
```

- [ ] **Step 4: Await it in the controller**

In `apps/api/src/marketing/marketing.controller.ts` line 70:

```ts
  catalog(): Promise<MarketingCatalogResponse> {
    return this.marketing.catalog();
  }
```

Returning the promise is enough — Nest awaits it. Only the return type annotation changes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx vitest run src/marketing`
Expected: PASS.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. If `marketing.controller.spec.ts:12` stubs `catalog` synchronously, change the stub to `vi.fn(async () => ({ channels: [], mergeFields: [] }))`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write apps/api/src/marketing/marketing.service.ts apps/api/src/marketing/marketing.service.spec.ts apps/api/src/marketing/marketing.controller.ts apps/api/src/marketing/marketing.controller.spec.ts
git add apps/api/src/marketing
git commit -m "feat(marketing): serve the merge-field catalogue from gym settings"
```

---

### Task 6: The Settings screen

**Files:**

- Modify: `apps/admin/app/(dashboard)/settings/settings-form.tsx`
- Modify: `packages/i18n/locales/en.json`
- Modify: `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `MARKETING_MERGE_GROUPS`, `MARKETING_MERGE_FIELD_DEFS` (Task 1), `MarketingFieldToggle` (Task 2).
- Produces: nothing other tasks depend on. This is the last task.

- [ ] **Step 1: Add the i18n copy**

In `packages/i18n/locales/en.json`, under `admin.settings`, add a `marketing` key beside the existing `automation` one:

```json
"marketing": {
  "groups": {
    "member": "Member fields",
    "membership": "Membership fields",
    "business": "Gym fields"
  },
  "groupHints": {
    "member": "Details about the person the message is going to.",
    "membership": "Their plan, its price and when it runs out.",
    "business": "Your gym's own name and contact details."
  },
  "custom": {
    "title": "Your own fields",
    "subtitle": "Text you reuse across messages — a promo code, a booking link, an offer deadline.",
    "add": "Add field",
    "remove": "Remove",
    "labelLabel": "Label",
    "labelPlaceholder": "Promo code",
    "tokenLabel": "Token",
    "tokenPlaceholder": "promo_code",
    "valueLabel": "Value",
    "valuePlaceholder": "SUMMER25",
    "empty": "No fields of your own yet."
  }
}
```

Add `admin.settings.sections.marketing` with the value `"Marketing fields"` beside the other section names.

Mirror all of it into `packages/i18n/locales/ka.json` with Georgian copy at the same key paths. There is no field-label block here — the chips' labels come from the catalogue, which is the same source the composer renders, so Settings and the composer can never disagree about what a field is called.

- [ ] **Step 2: Register the section**

In `apps/admin/app/(dashboard)/settings/settings-form.tsx`:

Add `| 'marketing'` to the section union (around line 749), directly after `| 'automation'`.

Add to the nav item list (around line 765), directly after the automation entry:

```ts
  { key: 'marketing', icon: 'mail' },
```

`mail` is the icon — verified present in `packages/ui-web/src/icon.tsx`. There is no `megaphone`; do not invent one.

Add to the error-to-section mapping (around line 782), directly after the `automationFields` line:

```ts
if (errors.marketingFields) return 'marketing';
```

- [ ] **Step 3: Render the toggles**

Add this block directly after the `section === 'automation'` block (which ends around line 1168):

```tsx
{
  section === 'marketing' ? (
    <>
      {MARKETING_MERGE_GROUPS.map((group) => (
        <SectionCard
          key={group}
          title={t(`marketing.groups.${group}`)}
          description={t(`marketing.groupHints.${group}`)}
        >
          <div {...stylex.props(styles.switchList)}>
            {MARKETING_MERGE_FIELD_DEFS.filter((field) => field.group === group).map((field) => (
              <SwitchRow
                key={field.key}
                name={`marketingFields.${field.key as MarketingFieldToggle}`}
                label={field.label}
                // The token is the point of the row — staff paste it, and
                // seeing it here is how they learn the spelling.
                description={field.token}
              />
            ))}
          </div>
        </SectionCard>
      ))}
      <CustomMergeFields />
    </>
  ) : null;
}
```

Add the imports at the top of the file:

```ts
  MARKETING_MERGE_FIELD_DEFS,
  MARKETING_MERGE_GROUPS,
  type MarketingFieldToggle,
```

Extend the `BoolFieldName` union (around line 710) with the marketing keys so `SwitchRow`'s `name` prop typechecks:

```ts
  | `marketingFields.${MarketingFieldToggle}`
```

- [ ] **Step 4: Write the custom-field editor**

`settings-form.tsx` has no `useFieldArray` yet, so this is the file's first one. Add the component at the bottom of the file, beside `SwitchRow`:

```tsx
/**
 * The gym's own merge fields: a label, a token and the text it expands to.
 *
 * A field array rather than a fixed set of inputs, because the row count is the
 * gym's to choose. Removal is the only "off" — a disabled custom field would be a
 * row that does nothing, and two ways to remove one thing is one too many.
 */
function CustomMergeFields() {
  const t = useTranslations('admin.settings');
  const { control, formState } = useFormContext<SettingsFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'marketingFields.customFields',
  });
  const errors = formState.errors.marketingFields?.customFields;

  return (
    <SectionCard title={t('marketing.custom.title')} description={t('marketing.custom.subtitle')}>
      <div {...stylex.props(styles.switchList)}>
        {fields.length === 0 ? (
          <p {...stylex.props(styles.switchDesc)}>{t('marketing.custom.empty')}</p>
        ) : null}
        {fields.map((field, index) => (
          <div key={field.id}>
            <div {...stylex.props(styles.customRow)}>
              <CustomFieldInput
                index={index}
                part="label"
                placeholderKey="marketing.custom.labelPlaceholder"
                ariaKey="marketing.custom.labelLabel"
              />
              <CustomFieldInput
                index={index}
                part="token"
                placeholderKey="marketing.custom.tokenPlaceholder"
                ariaKey="marketing.custom.tokenLabel"
              />
              <CustomFieldInput
                index={index}
                part="value"
                placeholderKey="marketing.custom.valuePlaceholder"
                ariaKey="marketing.custom.valueLabel"
              />
              <Button
                label={t('marketing.custom.remove')}
                variant="secondary"
                size="sm"
                onClick={() => remove(index)}
              />
            </div>
            {errors?.[index]?.token?.message ? (
              <p role="alert" {...stylex.props(styles.locationError)}>
                {errors[index]?.token?.message}
              </p>
            ) : null}
          </div>
        ))}
        <Button
          label={t('marketing.custom.add')}
          variant="secondary"
          size="sm"
          isDisabled={fields.length >= 12}
          onClick={() => append({ token: '', label: '', value: '' })}
        />
      </div>
    </SectionCard>
  );
}

/** One text cell of a custom merge-field row, on the file's own raw-input pattern. */
function CustomFieldInput({
  index,
  part,
  placeholderKey,
  ariaKey,
}: {
  index: number;
  part: 'label' | 'token' | 'value';
  placeholderKey: string;
  ariaKey: string;
}) {
  const t = useTranslations('admin.settings');
  const { control } = useFormContext<SettingsFormValues>();
  return (
    <Controller
      control={control}
      name={`marketingFields.customFields.${index}.${part}`}
      render={({ field }) => (
        <input
          type="text"
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          placeholder={t(placeholderKey)}
          aria-label={t(ariaKey)}
          {...stylex.props(styles.locationInput)}
        />
      )}
    />
  );
}
```

Add `useFieldArray` to the `react-hook-form` import. `Controller` and `useFormContext` are already imported for `SwitchRow`.

Add a `customRow` entry to the file's `stylex.create` block, beside `switchRow`:

```ts
  customRow: {
    display: 'grid',
    alignItems: 'end',
    gap: '0.75rem',
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      '@media (min-width: 768px)': 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr) auto',
    },
    paddingBlock: '0.5rem',
  },
```

**Why `CustomFieldInput` wraps a raw `<input>` rather than a design-system field.** `settings-form.tsx` does not import Astryx's `TextInput`, and that component would not fit here anyway: it takes a required `value`/`onChange` pair and exposes no `error` prop, so a spread `register()` result would not compile against it. The file's own text-field pattern is a raw `<input type="text">` carrying `styles.locationInput` — see `LocationNames` at line 1796 — and the error line below the row reuses `styles.locationError` from the same component. Both styles already exist; do not add new ones for them.

- [ ] **Step 5: Verify**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: no errors.

Run: `cd /Users/data/Desktop/fit && npx eslint "apps/admin/app/(dashboard)/settings/settings-form.tsx"`
Expected: clean.

Run: `cd apps/admin && npx vitest run app/\(dashboard\)/settings`
Expected: PASS. `settings-i18n.spec.ts` checks the en/ka key trees match — a missing Georgian key fails here, which is the point.

Run: `cd apps/admin && npx next build --no-lint`
Expected: `✓ Compiled successfully`. StyleX has no ESLint plugin in this repo, so a build is the only check that the new `customRow` rule compiles.

- [ ] **Step 6: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/settings/settings-form.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git add "apps/admin/app/(dashboard)/settings/settings-form.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(settings): let a gym curate the marketing merge-field palette"
```

---

### Task 7: The empty palette

**Files:**

- Modify: `apps/admin/app/(dashboard)/marketing/template-form-dialog.tsx:273`
- Modify: `apps/admin/app/(dashboard)/marketing/campaign-wizard.tsx:993`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `catalog.mergeFields` (Task 5) — which can now be empty.
- Produces: nothing.

Before this task, switching every toggle off leaves both composers rendering the "Click to insert a merge field:" hint above nothing at all. A label introducing an empty space is worse than no label; this is the only reason these two files are in the plan.

- [ ] **Step 1: Add the copy**

In `packages/i18n/locales/en.json`, beside the existing `mergeHint` at `admin.marketing.content` and at `admin.automation.form`, add a sibling:

```json
"mergeEmpty": "No merge fields are switched on. Settings → Marketing fields."
```

Only `admin.marketing.content` needs it — the automation form has its own always-populated catalogue. Mirror the key into `ka.json` with Georgian copy.

- [ ] **Step 2: Guard both composers**

In each file, wrap the hint and the chip strip so the hint only renders when there is something to introduce. In `template-form-dialog.tsx` around line 273 and `campaign-wizard.tsx` around line 993, the shape is:

```tsx
{catalog.mergeFields.length === 0 ? (
  <span {...stylex.props(/* the file's existing hint style */)}>{t('content.mergeEmpty')}</span>
) : (
  <>
    <span {...stylex.props(/* the file's existing hint style */)}>{t('content.mergeHint')}</span>
    {catalog.mergeFields.map((field) => (
      /* the file's existing chip JSX, unchanged */
    ))}
  </>
)}
```

Read each file's existing hint + chip markup first and keep it byte-identical inside the `else` branch. The translation namespace differs per file — `campaign-wizard.tsx` may already scope `t` to `admin.marketing`, in which case the key is `content.mergeEmpty`; match whatever the neighbouring `mergeHint` call uses.

- [ ] **Step 3: Verify**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: no errors.

Run: `cd apps/admin && npx vitest run app/\(dashboard\)/settings`
Expected: PASS — `settings-i18n.spec.ts` catches a missing Georgian key.

Run: `cd apps/admin && npx next build --no-lint`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/marketing/template-form-dialog.tsx" "apps/admin/app/(dashboard)/marketing/campaign-wizard.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git add "apps/admin/app/(dashboard)/marketing" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(marketing): say so when the merge palette is empty"
```

---

## Final verification

After Task 7, run the full suite from the repo root:

```bash
cd packages/types && npx vitest run
cd ../../apps/api && npx vitest run && npx tsc --noEmit
cd ../admin && npx tsc --noEmit && npx next build --no-lint
```

Then confirm by hand, with the admin dev server on `:3001`:

1. Settings → Marketing fields shows three groups of toggles and an empty custom-field card.
2. Switch off Phone, save, open Marketing → a template. The Phone chip is gone.
3. Add a custom field `promo_code` / `Promo code` / `SUMMER25`, save, reopen the composer. The chip is there.
4. Try to add a custom field with the token `first_name`. The save is refused with an inline error under the token input.
5. Open a member → Email. Insert `{{promo_code}}` and `{{days_until_expiry}}`, send to a test address, and confirm both expand.
