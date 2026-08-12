# Report Visibility Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a gym choose which of the 27 reports its Reports hub offers, via a per-report toggle in Settings.

**Architecture:** The fourth instance of an established pattern (`staffDirectory`, `automationFields`, `marketingFields`). A Zod section on the `Gym.settings` JSON blob pairs 1:1 with `REPORT_KEYS`; `ReportsService.catalog()` filters `REPORT_CATALOG` by it; the hub honours the filtered list. `ReportCatalogResponse` is unchanged.

**Tech Stack:** TypeScript, Zod, NestJS, Prisma, React Hook Form, StyleX, Vitest.

## Global Constraints

- **A toggle hides a report; it does not revoke access.** `GET /admin/reports/:report` and `/admin/reports/:report/export` must keep serving a disabled report to any caller holding `Permission.ReportView`. Task 2 pins this with a test. Do not add a permission check to those routes.
- **All 27 default `true`**, so a gym that never opens Settings sees today's hub unchanged.
- **`ReportCatalogResponse` shape is frozen:** `{ reports: ReportDefinition[] }`.
- **No read/write schema split.** The marketing section needed one because its reserved-token rule was time-varying. This section is 27 booleans with defaults — nothing saved can become invalid later. One schema.
- **Report names and descriptions come from `REPORT_DEFINITIONS`, never from i18n.** A name translated in one place and not the other is a name that can disagree with itself. New i18n keys cover only the Settings section name, the five group headings, and one empty-state string.
- **DO NOT COMMIT and do not `git add`.** The human owns commits; the repo holds ~85 files of their unrelated in-progress work. Leave everything in the working tree. Run `npx prettier --write` on what you touch, and never reformat a line you did not change.
- The API typecheck (`cd apps/api && npx tsc --noEmit`) is a required gate on every task that touches a shared type. A prior feature in this repo changed a shared shape, left the package-local suite green, and broke the API build.

---

### Task 1: The settings section

**Files:**

- Modify: `packages/types/src/gym-settings.ts`
- Create: `packages/types/src/gym-reports-settings.spec.ts`

**Interfaces:**

- Consumes: `REPORT_KEYS` from `./reports`.
- Produces: `gymReportsSettingsSchema`, `type GymReportsSettings`, `type ReportToggle`, and a `reports` section on `gymSettingsStoredSchema`, the `GymSettings` interface, and the patch schema.

Keys are the report keys verbatim (kebab-case, quoted). Do **not** camel-case them: identical keys are what let the drift test compare the two lists directly.

- [ ] **Step 1: Write the failing test**

Create `packages/types/src/gym-reports-settings.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REPORT_KEYS } from './reports';
import { gymReportsSettingsSchema, gymSettingsStoredSchema } from './gym-settings';

describe('gymReportsSettingsSchema', () => {
  // A report with no toggle is unhideable; a toggle with no report is a switch
  // for nothing. This is the test that catches a report added to the catalogue
  // without a matching toggle.
  it('matches REPORT_KEYS key for key', () => {
    const catalogue = [...REPORT_KEYS].sort();
    const toggles = Object.keys(gymReportsSettingsSchema.parse({})).sort();

    expect(toggles).toEqual(catalogue);
  });

  it('defaults every report on', () => {
    const parsed = gymReportsSettingsSchema.parse({});

    for (const key of REPORT_KEYS) {
      expect(parsed[key], `${key} should default on`).toBe(true);
    }
  });

  it('accepts a partial override and keeps the rest on', () => {
    const parsed = gymReportsSettingsSchema.parse({ 'refunds-detail': false });

    expect(parsed['refunds-detail']).toBe(false);
    expect(parsed['sales-summary']).toBe(true);
  });

  it('is part of the stored settings blob', () => {
    expect(gymSettingsStoredSchema.parse({}).reports['sales-summary']).toBe(true);
  });

  // Stored blobs written before this section existed must not break.
  it('defaults the whole section when it is absent from stored settings', () => {
    const stored = gymSettingsStoredSchema.parse({ brand: {} });

    expect(Object.keys(stored.reports)).toHaveLength(REPORT_KEYS.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/types && npx vitest run src/gym-reports-settings.spec.ts`
Expected: FAIL — `gymReportsSettingsSchema is not exported`.

- [ ] **Step 3: Add the schema**

In `packages/types/src/gym-settings.ts`, add `REPORT_KEYS` to the existing import from `./reports` if one is present, otherwise add `import { REPORT_KEYS } from './reports';` beside the other local imports.

Add this block immediately after the `MarketingFieldToggle` type:

```ts
/**
 * Which reports the Reports hub offers.
 *
 * Every key is one entry of `REPORT_KEYS`; switching it off removes that report
 * from the hub's tabs and chips. It does NOT revoke access — the preview and
 * export routes keep serving a disabled report to anyone holding
 * `Permission.ReportView`, so a bookmarked link and a scheduled export both keep
 * working. Hiding a card is housekeeping; withholding a report is a permission,
 * and a toggle that half-enforced access would be worse than one that plainly
 * does not.
 *
 * All default **on**: the catalogue is the product's own list, so a gym that
 * never opens Settings sees exactly what it saw before this existed.
 *
 * Keys are the report keys verbatim rather than camel-cased, so the drift test
 * can compare this object's keys against `REPORT_KEYS` directly.
 */
export const gymReportsSettingsSchema = z.object({
  // Sales
  'sales-summary': z.boolean().default(true),
  'sales-by-payment-method': z.boolean().default(true),
  'plan-performance': z.boolean().default(true),
  'sales-by-staff': z.boolean().default(true),
  'discounts-and-promotions': z.boolean().default(true),
  'refunds-detail': z.boolean().default(true),
  'pos-transaction-log': z.boolean().default(true),
  // Members
  'membership-movement': z.boolean().default(true),
  'retention-and-churn': z.boolean().default(true),
  'members-at-risk': z.boolean().default(true),
  'expiring-memberships': z.boolean().default(true),
  'member-roster': z.boolean().default(true),
  'member-check-in-log': z.boolean().default(true),
  'upcoming-occasions': z.boolean().default(true),
  // Revenue
  'revenue-summary': z.boolean().default(true),
  'revenue-by-channel': z.boolean().default(true),
  'revenue-by-location': z.boolean().default(true),
  'outstanding-invoices': z.boolean().default(true),
  'projected-revenue': z.boolean().default(true),
  'refunds-accounting': z.boolean().default(true),
  // Classes
  'attendance-by-class': z.boolean().default(true),
  'class-utilization': z.boolean().default(true),
  'class-cancellations': z.boolean().default(true),
  'waitlist-demand': z.boolean().default(true),
  'pt-sessions': z.boolean().default(true),
  'no-show-rate': z.boolean().default(true),
  // Staff
  'trainer-performance': z.boolean().default(true),
});

/** The report visibility config — {@link gymReportsSettingsSchema}. */
export type GymReportsSettings = z.infer<typeof gymReportsSettingsSchema>;

/** One report toggle — a key of {@link GymReportsSettings}. */
export type ReportToggle = keyof GymReportsSettings;
```

- [ ] **Step 4: Wire it into the three places `marketingFields` appears**

In `gymSettingsStoredSchema`, directly after the `marketingFields` line:

```ts
  reports: gymReportsSettingsSchema.default({}),
```

On the `GymSettings` interface, directly after its `marketingFields` line:

```ts
reports: GymReportsSettings;
```

In the patch schema, directly after its `marketingFields` line:

```ts
    reports: gymReportsSettingsSchema.partial().strict().optional(),
```

Locate each by grepping for `marketingFields` rather than by line number — this file carries unrelated uncommitted work and line numbers drift.

- [ ] **Step 5: Wire the API's settings projection**

`apps/api/src/gyms/gym-settings.service.ts` builds both `GymSettingsStored` and `GymSettings`, and both now require `reports`. Add the parallel lines beside its two `marketingFields` entries:

```ts
      reports: { ...current.reports, ...input.reports },
```

in `updateSettings`'s object literal, and

```ts
      reports: stored.reports,
```

in `toResponse`.

Omitting these is a compile error, not a silent gap — but find them now rather than discovering it at the typecheck.

- [ ] **Step 6: Run tests and the typecheck**

Run: `cd packages/types && npx vitest run`
Expected: PASS, including the five new tests.

Run: `cd apps/api && npx tsc --noEmit`
Expected: zero errors.

Run: `cd apps/api && npx vitest run src/gyms`
Expected: PASS.

- [ ] **Step 7: Prettier, no commit**

```bash
npx prettier --write packages/types/src/gym-settings.ts packages/types/src/gym-reports-settings.spec.ts apps/api/src/gyms/gym-settings.service.ts
```

Do not `git add` and do not commit.

---

### Task 2: The gym-aware catalogue

**Files:**

- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `apps/api/src/reports/reports.service.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.spec.ts` (only if it stubs `catalog`)

**Interfaces:**

- Consumes: `gymSettingsStoredSchema`, `ReportToggle` (Task 1).
- Produces: `ReportsService.catalog(): Promise<ReportCatalogResponse>`; the controller delegates to it.

The filtering belongs on the service, not the controller: `ReportsService` already injects `TenantPrismaService` and `TenantContext` (`reports.service.ts:78-82`), and the controller injects neither.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/reports/reports.service.spec.ts`, read how the file already fakes Prisma and follow that idiom exactly. Introduce a mutable gym row reset in `beforeEach` (see how `marketing.service.spec.ts` does this if the reports spec has no precedent), then add:

```ts
it('offers every report by default', async () => {
  const catalog = await service.catalog();

  expect(catalog.reports).toHaveLength(REPORT_KEYS.length);
});

it('omits a report the gym switched off', async () => {
  gymRow.settings = { reports: { 'refunds-detail': false } };

  const catalog = await service.catalog();

  expect(catalog.reports.some((r) => r.key === 'refunds-detail')).toBe(false);
  expect(catalog.reports.some((r) => r.key === 'sales-summary')).toBe(true);
});

it('returns an empty catalogue when every report is off, rather than throwing', async () => {
  gymRow.settings = {
    reports: Object.fromEntries(REPORT_KEYS.map((key) => [key, false])),
  };

  await expect(service.catalog()).resolves.toEqual({ reports: [] });
});

it('falls back to the full catalogue when the gym row is missing', async () => {
  gymRow = null;

  const catalog = await service.catalog();

  expect(catalog.reports).toHaveLength(REPORT_KEYS.length);
});
```

Add `REPORT_KEYS` to the file's `@fit/types` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/reports/reports.service.spec.ts`
Expected: FAIL — `service.catalog is not a function`.

- [ ] **Step 3: Add the service method**

In `apps/api/src/reports/reports.service.ts`, add to the `@fit/types` import list `REPORT_CATALOG`, `gymSettingsStoredSchema`, and `type ReportToggle`, plus `type ReportCatalogResponse` if not already imported. Add the method near the top of the class, above the report builders:

```ts
  /**
   * `GET /admin/reports` — the catalogue this gym offers.
   *
   * Filtered by the gym's `reports` settings, which are a DISPLAY preference: a
   * report switched off is absent from this list, but `preview` and `export`
   * still serve it to anyone holding `Permission.ReportView`. Do not add a
   * permission check to those routes on the strength of this filter — a
   * bookmarked preview link and a scheduled export are both expected to keep
   * working after a gym tidies its hub.
   */
  async catalog(): Promise<ReportCatalogResponse> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    const { reports } = gymSettingsStoredSchema.parse(gym?.settings ?? {});

    return { reports: REPORT_CATALOG.filter((report) => reports[report.key as ReportToggle]) };
  }
```

- [ ] **Step 4: Delegate from the controller**

In `apps/api/src/reports/reports.controller.ts`, replace the body of `catalog()`:

```ts
  catalog(): Promise<ReportCatalogResponse> {
    return this.reports.catalog();
  }
```

Returning the promise is enough — Nest awaits it. Remove the now-unused `REPORT_CATALOG` import from that file.

- [ ] **Step 5: Pin the display-preference boundary**

Add a test asserting the preview route still serves a disabled report. In `apps/api/src/reports/reports.service.spec.ts`, beside the catalogue cases:

```ts
// The boundary this whole feature rests on. "Hidden" is not "forbidden": a
// future contributor's natural instinct is to make these routes 403 on a
// disabled report, which would break every bookmarked link and scheduled
// export the moment a gym tidies its hub. This test is what makes that
// instinct fail loudly.
it('still previews a report the gym has switched off', async () => {
  gymRow.settings = { reports: { 'sales-summary': false } };

  await expect(service.report('sales-summary', '30d')).resolves.toBeDefined();
});
```

Check the real name and signature of the preview method on `ReportsService` before writing this — it may not be `report(key, range)`. Use whatever the controller's `:report` route calls, and if standing that call up in a unit test needs more fixture than the file already provides, assert it at the controller level instead and say so in your report.

- [ ] **Step 6: Verify**

Run: `cd apps/api && npx vitest run src/reports`
Expected: PASS.

Run: `cd apps/api && npx vitest run`
Expected: PASS — the whole suite, because `catalog()` changed shape.

Run: `cd apps/api && npx tsc --noEmit`
Expected: zero errors. If `reports.controller.spec.ts` stubs `catalog` synchronously, change the stub to `vi.fn(async () => ({ reports: [] }))`.

- [ ] **Step 7: Prettier, no commit**

```bash
npx prettier --write apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.controller.ts apps/api/src/reports/reports.service.spec.ts
```

---

### Task 3: The hub honours the filtered catalogue

**Files:**

- Modify: `apps/admin/app/(dashboard)/reports/page.tsx`
- Modify: `apps/admin/app/(dashboard)/reports/reports-view.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: the filtered `ReportCatalogResponse` (Task 2).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Make the selection depend on the filtered catalogue**

`page.tsx` currently computes `selected` from `DEFAULT_REPORT_KEY` **before** fetching, then fetches the catalogue and the preview with `Promise.all`. That cannot work once the catalogue is filtered: `DEFAULT_REPORT_KEY` is `REPORT_KEYS[0]` (`sales-summary`), and a gym that switches it off would land on a report its own hub does not list.

The two fetches therefore become sequential — catalogue first, then the preview for whichever report survives. That costs one extra round trip on a page that is already `force-dynamic` and server-rendered per request; the catalogue endpoint is a filtered in-memory constant, so the cost is a round trip, not a query.

In `ReportsBody`, replace the `Promise.all` block with:

```ts
    const catalog = await fetchReportCatalog();

    // The default has to come from the FILTERED catalogue, not from
    // `DEFAULT_REPORT_KEY`: that constant is `REPORT_KEYS[0]`, and a gym that
    // switches that one report off would otherwise land on a report its own hub
    // is not offering. A `?report=` naming a disabled report falls back the same
    // way an unrecognised one already does — the value is a view preference and
    // the gym's catalogue is the authority on it.
    const offered = catalog.reports.some((report) => report.key === requested)
      ? requested
      : (catalog.reports[0]?.key ?? null);

    if (offered === null) {
      return <ReportsView reports={[]} selected={null} range={range} preview={null} />;
    }

    const preview = await fetchReport(offered, range);
    return (
      <ReportsView reports={catalog.reports} selected={offered} range={range} preview={preview} />
    );
```

Rename the prop the page passes down from `selected` to `requested` at the `ReportsBody` boundary so the two ideas are not one name: `requested` is what the URL asked for, `offered` is what the gym actually has.

`ReportsView`'s `selected` prop must go back to `ReportKey | null`, and `preview` is already `ReportResult | null`. Update `ReportsBody`'s own prop type accordingly.

- [ ] **Step 2: Distinguish the two empty states**

`reports-view.tsx` renders one empty state whenever `shown === null` (around line 713), with the copy `t('noMatches', { query })`. With an empty catalogue that sentence is false — nothing was searched.

Split it on whether a query is active:

```tsx
      {shown === null ? (
        <Card variant="default" padding={0}>
          <EmptyState icon="search">
            {needle === '' ? (
              // Not "no matches" — nothing was searched. This is a gym that has
              // switched every report off, and the only place it can undo that
              // is Settings.
              <p {...stylex.props(styles.emptyText)}>{t('noneEnabled')}</p>
            ) : (
              <>
                <p {...stylex.props(styles.emptyText)}>
                  {t('noMatches', { query: query.trim() })}
                </p>
                <Button
                  label={t('clearSearch')}
                  variant="secondary"
                  size="sm"
                  onClick={() => setQuery('')}
                />
              </>
            )}
          </EmptyState>
        </Card>
      ) : (
```

`needle` is already computed in this component. Keep the rest of the branch exactly as it is.

- [ ] **Step 3: Handle a null selection in the view**

With `selected` back to `ReportKey | null` and `preview` possibly null, confirm the detail pane's existing `preview ? … : <EmptyState …>` branch still compiles and reads sensibly. The `reports.find((report) => report.key === selected)` call must tolerate `null`. Make the minimum change needed; do not restructure the pane.

- [ ] **Step 4: Add the copy**

In `packages/i18n/locales/en.json`, beside the existing `admin.reports.noMatches`:

```json
"noneEnabled": "No reports are switched on. Settings → Reports."
```

Mirror it into `ka.json` at the same path with real Georgian that names the action, matching how `admin.marketing.content.mergeEmpty` is phrased there. English or a placeholder in `ka.json` is a defect — this product's users are Georgian-speaking.

- [ ] **Step 5: Verify**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: zero errors.

Run: `cd /Users/data/Desktop/fit && npx eslint "apps/admin/app/(dashboard)/reports/page.tsx" "apps/admin/app/(dashboard)/reports/reports-view.tsx"`
Expected: clean.

Run: `cd packages/i18n && npx vitest run`
Expected: PASS — the parity spec catches a missing Georgian key.

Run: `cd apps/admin && npx next build --no-lint`
Expected: `✓ Compiled successfully`.

- [ ] **Step 6: Prettier, no commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/reports/page.tsx" "apps/admin/app/(dashboard)/reports/reports-view.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
```

---

### Task 4: The Settings screen

**Files:**

- Modify: `apps/admin/app/(dashboard)/settings/settings-form.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `gymReportsSettingsSchema`, `ReportToggle` (Task 1); `REPORT_SEGMENTS`, `REPORT_SEGMENT_LABEL`, `groupReportsBySegment`, `REPORT_CATALOG` from `@fit/types`.
- Produces: nothing.

- [ ] **Step 1: Add the copy**

In `packages/i18n/locales/en.json`, under `admin.settings`, beside the existing `marketing` key:

```json
"reports": {
  "groupHints": {
    "sales": "Takings, plans, discounts and refunds.",
    "members": "Joins, churn, expiry and attendance.",
    "revenue": "Where the money comes from, and what is still owed.",
    "classes": "Attendance, utilisation and no-shows.",
    "staff": "Trainer performance."
  }
}
```

Add `admin.settings.sections.reports` with the value `"Reports"` beside the other section names.

There are no group _titles_ here — the five card titles come from `REPORT_SEGMENT_LABEL`, the same source the hub's tabs use, so Settings and the hub cannot disagree about what a segment is called. Only the hints are new copy.

Mirror everything into `ka.json` with real Georgian.

- [ ] **Step 2: Register the section**

In `apps/admin/app/(dashboard)/settings/settings-form.tsx`:

Add `| 'reports'` to the section union, directly after `| 'marketing'`.

Add to the nav item list, directly after the marketing entry:

```ts
  { key: 'reports', icon: 'chart' },
```

`chart` is the icon the Reports hub already uses for its own fallback glyph — confirm it exists in `packages/ui-web/src/icon.tsx` before using it, and pick another from that file if not.

Add to the error-to-section mapping, after the `marketingFields` line:

```ts
if (errors.reports) return 'reports';
```

Extend the `BoolFieldName` union with:

```ts
  | `reports.${ReportToggle}`
```

Add `reports` to the form's `SettingsFormValues` type, its zod schema, `toFormValues`, and the submit handler — the same four wiring points `marketingFields` occupies. Find each by grepping for `marketingFields`; the file carries unrelated uncommitted work, so line numbers drift.

- [ ] **Step 3: Render the toggles**

Add directly after the `section === 'marketing'` block:

```tsx
{
  section === 'reports' ? (
    <>
      {groupReportsBySegment(REPORT_CATALOG).map((group) => (
        <SectionCard
          key={group.segment}
          title={group.label}
          description={t(`reports.groupHints.${group.segment}`)}
        >
          <div {...stylex.props(styles.switchList)}>
            {group.reports.map((report) => (
              <SwitchRow
                key={report.key}
                name={`reports.${report.key as ReportToggle}`}
                label={report.name}
                // The purpose is what a gym decides by — "Refunds detail" alone
                // does not say whether it is the one they need.
                description={report.description}
              />
            ))}
          </div>
        </SectionCard>
      ))}
    </>
  ) : null;
}
```

Add the needed imports to the file's `@fit/types` import list: `REPORT_CATALOG`, `groupReportsBySegment`, and `type ReportToggle`.

Using `groupReportsBySegment(REPORT_CATALOG)` rather than `REPORT_SEGMENTS` directly means Settings groups reports exactly as the hub does, from one function, and a segment that ever becomes empty drops out of both at once.

- [ ] **Step 4: Verify**

Run: `cd apps/admin && npx tsc --noEmit`
Expected: zero errors.

Run: `cd /Users/data/Desktop/fit && npx eslint "apps/admin/app/(dashboard)/settings/settings-form.tsx"`
Expected: clean.

Run: `cd apps/admin && npx vitest run "app/(dashboard)/settings"`
Expected: PASS.

Run: `cd packages/i18n && npx vitest run`
Expected: PASS.

Run: `cd apps/admin && npx next build --no-lint`
Expected: `✓ Compiled successfully`. StyleX has no ESLint plugin in this repo, so the build is the only check that any style change compiles.

- [ ] **Step 5: Prettier, no commit**

```bash
npx prettier --write "apps/admin/app/(dashboard)/settings/settings-form.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
```

---

## Final verification

```bash
cd packages/types && npx vitest run
cd ../i18n && npx vitest run
cd ../../apps/api && npx vitest run && npx tsc --noEmit
cd ../admin && npx tsc --noEmit && npx next build --no-lint
```

Then by hand, admin dev server on `:3001`:

1. Settings → Reports shows five cards, 27 toggles, all on.
2. Switch off Refunds detail, save, open Reports. The Sales tab reads 6, and the chip is gone.
3. Switch off every Sales report. The Sales tab disappears entirely.
4. Switch off all 27. Reports shows "No reports are switched on", not "no matches".
5. With Sales summary off, open `/reports` with no query string. It opens on the first report the gym still has, not on a blank pane.
6. With Refunds detail off, open `/reports?report=refunds-detail` directly. It falls back rather than 404ing.
7. With Refunds detail off, hit `/admin/reports/refunds-detail/export?range=30d&format=csv`. It still downloads — hiding is not forbidding.
