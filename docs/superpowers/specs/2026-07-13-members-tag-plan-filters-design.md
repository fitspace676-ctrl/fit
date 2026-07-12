# Design — Members roster: Plan + Tag filters

Date: 2026-07-13
Status: Approved (design)

## Goal

Close the two small remaining gaps between gym-admin's Members page and fit's
(already near-parity) Members roster: add a **Plan filter** and a **Tag filter** to
the list, matching gym-admin's `planFilter` / `tagFilter` dropdowns. Everything else
(tags display, all detail tabs, Add-member form, medical notes, access log, notes &
tasks) already exists in fit. Custom Fields (the third gap) is explicitly out of scope
here.

## Context

- `GET /members` (NestJS + Prisma, tenant-scoped) already filters by `status`,
  `search`, and **`planId`** (members holding a live subscription on that plan), and
  already returns a gym-wide `planMix` (plans with `planId` + `name`) — so the **Plan
  filter's options are already in the response**; only the UI select is missing.
- The API does **not** yet filter by tag, and the gym's distinct tag set is not
  computed anywhere — both are needed for the Tag filter.
- `GymMember.tags` is a `String[]` column (unmapped → camelCase, quoted in raw SQL);
  table `gym_members`.

Decision (approved): Plan dropdown options come from the existing `planMix.plans`
(plans that have members) — not a separate all-plans fetch.

## Backend (`packages/types` + `apps/api`)

- **`packages/types/src/members.ts`**
  - `listMembersQuerySchema` += `tag: z.string().min(1).optional()`.
  - `ListMembersResponse` += `availableTags: string[]` (gym-wide distinct tags, for
    the Tag dropdown; independent of the page's filters, like `planMix`/`counts`).
- **`apps/api/src/members/members.service.ts`**
  - `buildWhere` += `if (query.tag) where.tags = { has: query.tag };` (Prisma scalar-
    list `has`).
  - `availableTags()` — gym-scoped raw distinct-unnest (scales past in-memory):
    `SELECT DISTINCT unnest("tags") AS tag FROM gym_members WHERE "gymId" = ${gymId}
AND "role"::text = 'MEMBER' ORDER BY tag ASC`, mapped to `string[]`. `gymId` from
    `this.tenant.gymId` (raw SQL bypasses the tenant extension, so scope explicitly).
  - Add `availableTags` to the `listMembers` `Promise.all` + response object.
- **Controller / `lib/api.ts`**: no change — the query is parsed by the schema and
  `membersQueryString` iterates all query keys generically, so `tag` flows through
  automatically once it is on the type.

## Frontend (`apps/admin`)

- **`members/page.tsx`** — pass `planId={query.planId ?? ''}`, `tag={query.tag ?? ''}`,
  and `availableTags={result.availableTags}` to `MembersTable`.
- **`members-table.tsx`** — thread `planId`, `tag`, `availableTags` through props and
  into `<MembersFilters …>` alongside `search`/`status`; pass `plans={planMix.plans}`.
- **`members-filters.tsx`** — in the expandable filter panel, beside the Status
  select, add:
  - **Plan** `<select>` — options from `plans` (`planId` + `name`; skip `planId === null`),
    writes the `planId` URL param via the existing `commit(key, value)`.
  - **Tag** `<select>` — options from `availableTags`, writes the `tag` URL param.
  - The "Filter" button's active state + count reflect status/plan/tag being set.
- **i18n** (`packages/i18n/locales/en.json` + `ka.json`, `admin.members.filters`):
  `planLabel`, `allPlans`, `tagLabel`, `allTags`; keep `filterActive` accurate.

URL params (`planId`, `tag`) are the source of truth; the server page re-fetches. All
UI stays StyleX/Astryx (the `members` dir is Tailwind-guardrailed).

## Tests / verification

- `apps/api` members.service: unit-test `buildWhere` tag branch (`where.tags = { has }`)
  and `availableTags()` mapping (mock `$queryRaw`); confirm `listMembers` includes it.
- `packages/types`: parse test for `tag` in the query + `availableTags` in the response.
- `apps/admin` `tsc` + `build`; manual: open Members, expand Filter, pick a plan and a
  tag, confirm the roster narrows and the URL carries `planId`/`tag`.

## Out of scope

Custom Fields (separate, larger effort); an all-plans (incl. member-less) dropdown.
