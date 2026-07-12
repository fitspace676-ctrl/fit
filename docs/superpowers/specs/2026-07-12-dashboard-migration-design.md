# Design — gym-admin → fit migration (Dashboard first)

Date: 2026-07-12
Status: Approved (design), pending spec review

## Goal

Bring the **feature set / content list** ("ჩამონათვალი") of the standalone
`sss/gym-admin` prototype into the real `sss/fit` monorepo, **page by page**, while
keeping fit's **visual system** and fit's **real backend**. The first page is the
**Dashboard**.

- `gym-admin` — a v0/shadcn Next.js prototype. Tailwind + shadcn UI, rich feature
  set, but **mock data / local React contexts**, no backend.
- `fit` — pnpm + turbo monorepo. `apps/admin` (Next.js, **StyleX + Astryx**,
  next-intl, role permissions) backed by `apps/api` (**NestJS + Prisma**,
  tenant-scoped, real aggregations) and shared contracts in `packages/types`.

"Visual = fit, backend = fit, content list = gym-admin."

## Scope

Migrated page-by-page (each page is its own sub-project: spec → plan → build):
**Dashboard, Members, Classes (+schedule/bookings/pt-calendar), Payments, POS,
Reports, Settings, Staff, Bookings.**

**Out of scope — already done in fit, do not redo:** CRM, Marketing, Automation.

## Repeatable per-page method

1. **Source** — read the gym-admin page; enumerate its full content list
   (sections, cards, tabs, tables, forms, filters, actions).
2. **Gap analysis** — diff against fit's existing page; what exists vs. what's missing.
3. **Frontend** — build the missing pieces in **fit's stack**: StyleX + Astryx
   (`@astryxdesign/core`) components, next-intl messages, brand tokens
   (`var(--color-*)`). Do **not** copy gym-admin's Tailwind/shadcn markup — translate it.
4. **Backend** — where new data is needed, add to `apps/api` (NestJS + Prisma) a real
   aggregation/endpoint, a contract in `packages/types` (zod schema + inferred type),
   and a fetch in `apps/admin/lib/api.ts`. Every figure is a real aggregation — no mock.
5. **Permissions / i18n** — preserve fit's role gating and translation conventions.
6. **Verify** — typecheck + build + drive the page by hand.

**Merge, not replace:** fit's existing working features are kept unless we agree
otherwise for a specific page.

---

## Dashboard page (first)

### gym-admin content list

- Top **date-filter bar**: Today / This Week / This Month / Custom (+ page title).
- **Location filter**: All Locations / Club 1 / Club 2 / Club 3.
- **8 stat cards**: Active Members, Revenue This Month, New Members, Overdue Payments,
  Classes Today, Check-ins Today, Expiring Soon, Renewals Due.
- **Recent Members** table (name/email, plan, status badge, expiry, row actions).

### fit already has

In-Gym-Now occupancy (donut + per-area bars) · 3 KPI cards (Today's Revenue,
Check-ins Today, New Members 7d) · Revenue area chart (range 7d/30d/12w) · Plan-mix
stacked bar · Today's Schedule · Alerts · Recent Check-ins · Pinned reports.

Implemented in `apps/admin/app/(dashboard)/page.tsx` (server) + `dashboard-view.tsx`
(client), fed by `GET /dashboard/overview` and `GET /dashboard/stats`.

### Decision: **MERGE** (keep fit's sections, add gym-admin's missing items)

#### A. New KPI cards (fit `KpiCard` styling, beside the existing 3)

| Card               | Backend source                                                                               | Notes                                                             |
| ------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Active Members     | `gymMember.count({ role: MEMBER, status: ACTIVE })`                                          | already computed in `getStats`                                    |
| Revenue This Month | `payment.aggregate(SUM amount, status=CAPTURED, createdAt ≥ monthStart)`                     | distinct from existing Today's Revenue                            |
| Overdue Payments   | count of `Subscription` in `PAST_DUE` (grace) **and/or** `Payment` `FAILED/PENDING` past due | exact rule confirmed at build (no `PaymentStatus.OVERDUE` exists) |
| Classes Today      | count of today's `ClassInstance` (already resolved for Today's Schedule)                     |                                                                   |
| Expiring Soon      | `Subscription` with current period end ≤ 7 days                                              | uses Subscription period end field, confirmed at build            |
| Renewals Due       | `Subscription` with renewal due this month                                                   |                                                                   |

New Members (gym-admin) overlaps fit's New Members 7d — keep fit's, do not duplicate.

#### B. Location filter

- Top control-bar dropdown: All + one entry per active `Location`.
- Writes `?locationId=` (URL is source of truth; server re-fetches).
- `GET /dashboard/overview` gains an **optional** `locationId` query; aggregations that
  carry `locationId` filter by it: occupancy, check-ins, classes, revenue (via
  `payment.locationId` / `checkIn.locationId` / `classInstance.locationId`).
- Member-scoped figures with no location column stay tenant-wide; the UI notes this
  where relevant rather than faking per-location numbers.

#### C. Recent Members table

- New endpoint `GET /dashboard/recent-members` → `gymMember.findMany` ordered by
  `joinedAt desc`, returning name, email, plan (subscription plan name), status, expiry.
- Rendered with Astryx table next to / below Recent Check-ins.
- Row actions (View / Edit / Email) link into existing member routes where they exist.

#### D. Date filter (reconcile with existing range control)

- Today / This Week / This Month / Custom becomes the **top-level** control and drives
  the whole overview (including the revenue chart), replacing the revenue-only
  7d/30d/12w control. Custom opens a date-range picker.
- Server maps the selection to the window used by revenue/KPIs. `?range=` (or explicit
  `?from=&to=` for Custom) stays the source of truth.

### Backend changes (all real, tenant-scoped)

- `packages/types/src/dashboard.ts` — extend the overview schema with the 5 new KPIs;
  add a `recentMembers` shape and the `locationId` / custom-range query params.
- `apps/api/src/dashboard/dashboard.service.ts` — new Prisma aggregations for the KPIs +
  recent members; thread `locationId` and the resolved window through existing queries.
- `apps/api/src/dashboard/dashboard.controller.ts` — accept the new query params.
- `apps/admin/lib/api.ts` — pass the params through; add the recent-members fetch.

### Frontend changes

- `apps/admin/app/(dashboard)/page.tsx` — parse `locationId` + custom range; fetch.
- `apps/admin/app/(dashboard)/dashboard-view.tsx` — top control bar (date + location),
  5 new KPI cards, Recent Members card. StyleX + Astryx only.
- `apps/admin/messages/*` (next-intl) — new keys for cards, filters, table headers.

### Permissions

Unchanged: the dashboard overview stays gated on `Permission.ReportView`; the new
metrics ride the same endpoint and gate. Recent-members endpoint uses the equivalent
member-read gate.

### Out of scope for the Dashboard page

Real per-location member counts (no member↔location column); wiring the row actions to
brand-new routes (they link to existing routes only).

## Open items resolved at implementation time

- Exact "Overdue Payments" rule (Subscription `PAST_DUE` vs. failed/pending payments).
- Exact Subscription period-end field names for Expiring / Renewals.
- Custom date-range param shape (`range` presets vs. explicit `from`/`to`).

## Verification

`pnpm -w typecheck` + admin/api build; then drive the dashboard by hand across
locations and date filters, confirming every figure is real (cross-check a couple
against direct DB counts).
