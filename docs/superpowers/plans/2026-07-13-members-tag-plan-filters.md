# Members Roster — Plan + Tag Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Plan filter and a Tag filter to fit's Members roster (gym-admin parity), reusing the existing `planId` filter + `planMix` options and adding real tag filtering.

**Architecture:** Additive. `GET /members` gains an optional `tag` query and returns the gym's distinct `availableTags`; the service filters by `tags.has` and computes tags via a gym-scoped raw distinct-unnest. The roster's Filter panel gains two `<select>`s writing `planId` / `tag` URL params (server re-fetches).

**Tech Stack:** TypeScript, Zod (`@fit/types`), NestJS + Prisma (`apps/api`), Next.js RSC + StyleX + `@astryxdesign/core` + next-intl (`apps/admin`), Vitest.

## Global Constraints

- URL search params (`planId`, `tag`) are the single source of truth; the server page re-fetches. Every filter change resets to page 1.
- No fabricated data: `availableTags` is the gym's real distinct `GymMember.tags`; Plan options come from the real `planMix.plans`.
- Frontend stays StyleX + Astryx only — the `apps/admin/app/(dashboard)/members` dir is Tailwind-guardrailed. No Tailwind utilities.
- i18n: every new string is a key in BOTH `packages/i18n/locales/en.json` and `ka.json` under `admin.members.filters`.
- Raw SQL is gym-scoped explicitly via `this.tenant.gymId` (it bypasses the Prisma tenant extension). `GymMember` columns are unmapped camelCase → quote them: `"tags"`, `"gymId"`, `"role"`; table is `gym_members`.

## File Structure

- `packages/types/src/members.ts` — **modify**: `listMembersQuerySchema` += `tag`; `ListMembersResponse` += `availableTags`.
- `apps/api/src/members/members.service.ts` — **modify**: `buildWhere` tag branch; `availableTags()` raw query; include in `listMembers`.
- `apps/api/src/members/members.service.spec.ts` — **modify**: mock `$queryRaw`; test the tag filter + `availableTags`.
- `apps/admin/app/(dashboard)/members/page.tsx` — **modify**: pass `planId` / `tag` / `availableTags`.
- `apps/admin/app/(dashboard)/members/members-table.tsx` — **modify**: thread the new props into `<MembersFilters>`.
- `apps/admin/app/(dashboard)/members/members-filters.tsx` — **modify**: Plan + Tag selects.
- `packages/i18n/locales/en.json` + `ka.json` — **modify**: `admin.members.filters` keys.

---

### Task 1: Backend — `tag` filter + `availableTags`

**Files:**

- Modify: `packages/types/src/members.ts`, `apps/api/src/members/members.service.ts`
- Test: `apps/api/src/members/members.service.spec.ts`

**Interfaces:**

- Produces: `listMembersQuerySchema.tag?: string`; `ListMembersResponse.availableTags: string[]`; `MembersService.availableTags(): Promise<string[]>` (private).

- [ ] **Step 1: Extend the contract**

In `packages/types/src/members.ts`, add `tag` to the query schema (after the `planId` line):

```ts
  planId: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
```

And add `availableTags` to `ListMembersResponse` (after the `counts` field):

```ts
  /** Gym-wide member counts per segment (independent of the page's filters). */
  counts: MemberTabCounts;
  /** The gym's distinct member tags, sorted — the Tag filter's options. */
  availableTags: string[];
```

- [ ] **Step 2: Write the failing test**

In `apps/api/src/members/members.service.spec.ts`, add an `availableTagRows` field to the `setup` `overrides` object type:

```ts
  taskFindFirst?: { id: string } | null;
  availableTagRows?: { tag: string }[];
```

Add a `$queryRaw` mock to the `client` in `setup` (place it next to the `client.$transaction` line):

```ts
const queryRaw = vi.fn<(...args: unknown[]) => Promise<{ tag: string }[]>>(() =>
  Promise.resolve(overrides?.availableTagRows ?? []),
);
client.$queryRaw = queryRaw;
```

Then add tests inside `describe('listMembers', …)`:

```ts
it('narrows by tag with a scalar-list `has` filter', async () => {
  const { service, findMany } = setup();
  await service.listMembers({ ...query(), tag: 'VIP' });
  const where = (findMany.mock.calls[0]?.[0] as { where: { tags?: unknown } }).where;
  expect(where.tags).toEqual({ has: 'VIP' });
});

it('returns the gym distinct tags as availableTags', async () => {
  const { service } = setup({ availableTagRows: [{ tag: 'At Risk' }, { tag: 'VIP' }] });
  const result = await service.listMembers(query());
  expect(result.availableTags).toEqual(['At Risk', 'VIP']);
});

it('omits the tag filter when none is given', async () => {
  const { service, findMany } = setup();
  await service.listMembers(query());
  const where = (findMany.mock.calls[0]?.[0] as { where: { tags?: unknown } }).where;
  expect(where.tags).toBeUndefined();
});
```

> If `setup(...)` does not already return `findMany`, add it to the returned object. If `query()` does not accept overrides, spread it as shown (`{ ...query(), tag: 'VIP' }`).

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && pnpm test members.service`
Expected: FAIL — `where.tags` is undefined for the tag case and `result.availableTags` is undefined.

- [ ] **Step 4: Implement**

In `apps/api/src/members/members.service.ts`, in `buildWhere`, after the `planId` block and before `return where;`:

```ts
// Narrow to members carrying the given tag (scalar-list membership).
if (query.tag) {
  where.tags = { has: query.tag };
}
```

Add the `availableTags` method (place it right after `buildWhere`):

```ts
  /**
   * The gym's distinct member tags, sorted — the roster Tag filter's options.
   * A gym-scoped raw `unnest` DISTINCT so the whole tag set is resolved in the
   * database (never the roster loaded into memory). Raw SQL bypasses the tenant
   * extension, so the gym is pinned explicitly via {@link TenantContext.gymId}.
   */
  private async availableTags(): Promise<string[]> {
    const rows = await this.prisma.client.$queryRaw<Array<{ tag: string }>>(
      Prisma.sql`SELECT DISTINCT unnest("tags") AS tag FROM gym_members WHERE "gymId" = ${this.tenant.gymId} AND "role"::text = 'MEMBER' ORDER BY tag ASC`,
    );
    return rows.map((row) => row.tag);
  }
```

Wire it into `listMembers` — add to the `Promise.all` destructure and array, and the returned object:

```ts
const [rows, total, planMix, counts, availableTags] = await Promise.all([
  this.prisma.client.gymMember.findMany({
    /* unchanged */
  }),
  this.prisma.client.gymMember.count({ where }),
  this.planMix(),
  this.tabCounts(),
  this.availableTags(),
]);

return {
  data: rows.map((row) => this.toRow(row)),
  total,
  page: query.page,
  limit: query.limit,
  planMix,
  counts,
  availableTags,
};
```

(`Prisma` is already imported in this file.)

- [ ] **Step 5: Run the tests + typecheck**

Run: `cd apps/api && pnpm test members.service && pnpm type-check`
Expected: PASS. If a pre-existing `listMembers` test asserts the whole response object with `toEqual`, add `availableTags: []` to its expected value.

- [ ] **Step 6: Run the types package tests**

Run: `cd packages/types && pnpm test members`
Expected: PASS (the additive schema/type changes don't break existing parse tests).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/members.ts apps/api/src/members/members.service.ts apps/api/src/members/members.service.spec.ts
git commit -m "feat(api): members tag filter + availableTags"
```

(Pre-commit runs `prettier --check` + `eslint --max-warnings 0` on staged files — run `npx prettier --write` on changed files and ensure lint is clean first. Do NOT use `--no-verify`. Append the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.)

---

### Task 2: Frontend — Plan + Tag filter UI

**Files:**

- Modify: `apps/admin/app/(dashboard)/members/page.tsx`, `members-table.tsx`, `members-filters.tsx`
- Modify: `packages/i18n/locales/en.json`, `packages/i18n/locales/ka.json`

**Interfaces:**

- Consumes: `ListMembersResponse.availableTags` + `planMix.plans` (Task 1 / existing); `MemberPlanSlice` (`planId` + `name`).

- [ ] **Step 1: i18n keys**

In `packages/i18n/locales/en.json`, under `admin.members.filters`, add:

```json
"planLabel": "Plan",
"allPlans": "All plans",
"tagLabel": "Tag",
"allTags": "All tags"
```

In `packages/i18n/locales/ka.json`, under `admin.members.filters`, add the mirror:

```json
"planLabel": "გეგმა",
"allPlans": "ყველა გეგმა",
"tagLabel": "თეგი",
"allTags": "ყველა თეგი"
```

- [ ] **Step 2: Pass the new data from the page**

In `apps/admin/app/(dashboard)/members/page.tsx`, extend the `<MembersTable … />` props (next to the existing `status={query.status ?? ''}`):

```tsx
        planId={query.planId ?? ''}
        tag={query.tag ?? ''}
        availableTags={result.availableTags}
```

- [ ] **Step 3: Thread props through the table**

In `apps/admin/app/(dashboard)/members/members-table.tsx`, add the three props to the destructure and the type:

```tsx
  search,
  status,
  planId,
  tag,
  availableTags,
  canWrite,
}: {
  // …existing…
  search: string;
  status: string;
  planId: string;
  tag: string;
  availableTags: string[];
  canWrite: boolean;
}) {
```

Update the `<MembersFilters>` render (line ~730):

```tsx
<MembersFilters
  search={search}
  status={status}
  planId={planId}
  tag={tag}
  plans={planMix.plans}
  availableTags={availableTags}
/>
```

- [ ] **Step 4: Add the Plan + Tag selects**

In `apps/admin/app/(dashboard)/members/members-filters.tsx`:

Import the plan-slice type at the top (extend the existing `@fit/types` import):

```ts
import type { MemberStatus, MemberPlanSlice } from '@fit/types';
```

Change the component signature + props:

```tsx
export function MembersFilters({
  search,
  status,
  planId,
  tag,
  plans,
  availableTags,
}: {
  search: string;
  status: string;
  planId: string;
  tag: string;
  plans: MemberPlanSlice[];
  availableTags: string[];
}) {
```

Update the Filter button's active state to reflect any active filter:

```tsx
<Btn
  v={status || planId || tag || filtersOpen ? 'primary' : 'outline'}
  size="md"
  icon="filter"
  aria-expanded={filtersOpen}
  onClick={() => setFiltersOpen((open) => !open)}
>
  {status || planId || tag ? t('filters.filterActive') : t('filters.filter')}
</Btn>
```

Inside the `{filtersOpen ? ( <div …statusRow> … </div> ) : null}` panel, after the existing Status `<select>` block, add Plan and Tag selects (reuse `styles.label` / `styles.select` and the existing `commit`):

```tsx
          <label htmlFor="member-plan" {...stylex.props(styles.label)}>
            {t('filters.planLabel')}
          </label>
          <select
            id="member-plan"
            value={planId}
            onChange={(event) => commit('planId', event.target.value)}
            {...stylex.props(styles.select)}
          >
            <option value="">{t('filters.allPlans')}</option>
            {plans
              .filter((plan) => plan.planId !== null)
              .map((plan) => (
                <option key={plan.planId} value={plan.planId as string}>
                  {plan.name}
                </option>
              ))}
          </select>

          <label htmlFor="member-tag" {...stylex.props(styles.label)}>
            {t('filters.tagLabel')}
          </label>
          <select
            id="member-tag"
            value={tag}
            onChange={(event) => commit('tag', event.target.value)}
            {...stylex.props(styles.select)}
          >
            <option value="">{t('filters.allTags')}</option>
            {availableTags.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
```

- [ ] **Step 5: Verify**

Run: `cd apps/admin && pnpm type-check`
Expected: PASS (new props typed; `MemberPlanSlice.planId` is `string | null`, narrowed before use).

Run: `node -e "require('./packages/i18n/locales/en.json'); require('./packages/i18n/locales/ka.json'); console.log('json ok')"` (from repo root)
Expected: `json ok`.

Run: `cd apps/admin && pnpm build`
Expected: build succeeds (members route compiles).

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/app/(dashboard)/members/page.tsx" "apps/admin/app/(dashboard)/members/members-table.tsx" "apps/admin/app/(dashboard)/members/members-filters.tsx" packages/i18n/locales/en.json packages/i18n/locales/ka.json
git commit -m "feat(admin): members plan + tag filters"
```

(Same pre-commit + trailer rules as Task 1.)

---

### Task 3: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Tests + typechecks**

```bash
cd packages/types && pnpm test members && pnpm type-check
cd ../../apps/api && pnpm test members.service && pnpm type-check
cd ../admin && pnpm type-check
```

Expected: all green.

- [ ] **Step 2: Build**

Run: `cd apps/admin && pnpm build`
Expected: succeeds.

- [ ] **Step 3: Drive the page by hand**

Start the dev servers (or use the running ones), open the Members roster, click **Filter** to expand the panel, and confirm:

- The **Plan** select lists the gym's live plans; picking one narrows the roster and the URL gains `?planId=…`.
- The **Tag** select lists the gym's distinct member tags; picking one narrows the roster and the URL gains `?tag=…`.
- Both combine with the Status select and the search box; the Filter button shows its active state; changing any resets to page 1.
- Switch locale to `ka` — the new labels are translated.

## Self-Review notes

- **Spec coverage:** `tag` query + filter → Task 1 (`buildWhere`). `availableTags` → Task 1 (`availableTags()`). Plan select (from `planMix.plans`) + Tag select (from `availableTags`) → Task 2. i18n EN/KA → Task 2.
- **Type consistency:** `availableTags: string[]` and `tag?: string` names match across types (Task 1), service return (Task 1), page/table/filters props (Task 2). `plans` typed as `MemberPlanSlice[]`, `planId` narrowed from `string | null` before use.
- **No new fetch:** Plan options reuse the response's existing `planMix.plans`; `membersQueryString` already serialises `tag` generically.
