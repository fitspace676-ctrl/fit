# Dashboard Sales tab — hand-built sales analytics — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for planning
**Follows:** [`2026-08-07-dashboard-overview-redesign-design.md`](./2026-08-07-dashboard-overview-redesign-design.md)

## Problem

The Sales tab is the generic widget grid: three static `ReportSectionCard`s
(`sales.payment-method`, `sales.top-products`, `sales.top-plans`) pulled from the
Reports drill-down catalogue via `DASHBOARD_WIDGET_CATALOG`. Each one is a single
frozen aggregation over the tab's `?range=` window.

That framework cannot express what the Sales tab actually needs:

- **No granularity control.** The series bucket (day / week / month) is implied by
  `?range=` and nothing else. A user cannot ask "show me this monthly" without
  changing the window for every other tab at the same time.
- **No product-type filter.** There is no way to see revenue from memberships
  separately from retail — the `revenue-by-plan` breakdown lists individual plan
  names, which is a different question.
- **No sales-vs-refunds view.** Refunds appear only as a total in a KPI tile and
  a column in the monthly table. There is no trend, so a gym cannot see refunds
  rising against sales.
- **No shared reading frame.** Three cards of identical weight, no KPI headline,
  no visual hierarchy — the same problem the Overview redesign just solved for
  the landing tab, unsolved one tab across.

Widening the widget framework to carry per-widget parameters would make every
segment pay for a control surface only Sales uses.

## Scope

### In scope

- A hand-built `SalesView`, replacing the widget grid for the `sales` tab only,
  laid out on the Overview's own grid (`overview-view.tsx`'s main column +
  sticky rail).
- Two tab-wide controls — **granularity** (daily / weekly / monthly) and
  **product type** (all / memberships / session packs / retail) — that recompute
  every card on the tab.
- One new API route + service producing the whole tab in one round trip.
- A four-tile KPI strip, a revenue trend, a sales-vs-refunds trend, a payment
  method breakdown, and a ranked top-sellers list.
- Removing `sales` from the configurable segments (and its three catalogue
  entries), so the "Add widget" picker no longer offers it.

### Out of scope

- **Design-token changes.** Everything uses existing `var(--color-*)` /
  `var(--font-family-*)` values. `@fit/astryx-theme` is untouched.
- **Schema migrations.** No new columns. Every figure is derived from rows that
  exist today.
- **The other four segments.** `members`, `revenue`, `classes` and `staff` keep
  the widget grid and the picker, unchanged.
- **Splitting classes from PT sessions.** See "Known data limits" below.

## Known data limits

These are stated up front because they shape the contract, and because this
codebase's honesty rule — a figure is a real aggregation or it is an empty state,
never a fabricated zero — means the UI must not offer a filter the data cannot
answer.

**"Classes" and "PT sessions" cannot be separated.** Both are sold as the same
artefact: a `CreditPack` minted from a finite-`sessionCount` `PackagePlan`
(`credit-packs.service.ts`). `PackagePlan` carries no kind discriminator, and
`PtSession` has no price, order or payment of its own — a PT session is scheduled,
not sold. The four categories the request asked for therefore collapse to three
real ones, and the third (`session-packs`) is labelled to say so.

**Subscription revenue is not in `Payment`.** Recurring memberships raise
`Invoice` rows (`subscription-billing.service.ts`), not payments. Everything on
this tab is captured-payment revenue, consistent with the existing `revenue` and
`pos` drill-downs, whose own doc comments already say "subscriptions raise no
payments in the MVP". The KPI strip's caption names what it counts so the number
is not read as total gym revenue.

**`Payment.refundedAmount` has no date.** It is a running total mutated in place,
so bucketing a refund by it would place the refund in the _sale's_ bucket. The
refunds series therefore reads `Refund` rows, which carry their own `createdAt`.

The refunds _KPI_ still sums `refundedAmount` over the window's payments, matching
the existing drill-downs. **The two figures can legitimately differ**: a sale made
inside the window and refunded after it counts in the KPI but not the trend, and a
refund inside the window against an older sale counts in the trend but not the KPI.
Neither is wrong — they answer different questions ("how much of this window's
revenue came back?" vs "when did money go out?"). The KPI tile and the trend card
each carry a caption saying which, so the difference reads as intended rather than
as a bug. Resolving them to one number would mean either dating a refund by its
sale (wrong buckets) or restating a past window's KPI as refunds arrive (a moving
historical figure) — both worse than two clearly-labelled honest numbers.

## Architecture

### 1. Contract — `packages/types/src/dashboard-sales.ts` (new)

Two query axes, both scoping the entire tab.

**Granularity** picks the window and the bucket as one value, so the two can
never be set to a nonsensical pair (monthly buckets over seven days):

| Value     | Window         | Bucket | Delegates to           |
| --------- | -------------- | ------ | ---------------------- |
| `daily`   | last 30 days   | day    | `resolveWindow('30d')` |
| `weekly`  | last 12 weeks  | week   | `resolveWindow('12w')` |
| `monthly` | last 12 months | month  | `resolveWindow('12m')` |

Mapping onto the existing `ReportRange` vocabulary means no new window or bucket
math is written; `report-window.util.ts` stays the single source of truth for
where a bucket starts.

**Product type** is derived from the order's shape at read time — no stored
column, no backfill:

```ts
order.creditPack !== null  → 'session-packs'  // class / PT session pass
order.packageId  !== null  → 'memberships'    // package plan purchase
otherwise                  → 'retail'         // POS till sale + online shop
```

`all` skips the filter entirely.

Schemas:

```ts
export const salesGranularitySchema = z.enum(['daily', 'weekly', 'monthly']);
export const salesProductTypeSchema = z.enum(['all', 'memberships', 'session-packs', 'retail']);

export const dashboardSalesQuerySchema = z.object({
  granularity: salesGranularitySchema.default('daily'),
  productType: salesProductTypeSchema.default('all'),
});

/** One bucket of the sales-vs-refunds trend. Money is MINOR units. */
export const salesComparisonPointSchema = z.object({
  label: z.string(), // bucket start, YYYY-MM-DD
  sales: z.number(),
  refunds: z.number(),
});

/** One bar of the payment breakdown — a real channel × method combination. */
export const salesMethodSliceSchema = z.object({
  channel: z.enum(['pos', 'online']),
  method: z.enum(['cash', 'card', 'member-account']),
  value: z.number(),
});

/** One row of the ranked top-sellers list. */
export const salesTopSellerSchema = z.object({
  label: z.string(), // OrderItem.label, snapshotted at sale time
  orders: z.number(),
  value: z.number(),
});

export const dashboardSalesResponseSchema = z.object({
  granularity: salesGranularitySchema,
  productType: salesProductTypeSchema,
  currency: z.string(),
  kpis: z.object({
    grossSales: z.number(),
    netSales: z.number(),
    refunded: z.number(),
    avgSale: z.number(),
  }),
  revenueOverTime: z.array(reportSeriesPointSchema),
  salesVsRefunds: z.array(salesComparisonPointSchema),
  byPaymentMethod: z.array(salesMethodSliceSchema),
  topSellers: z.array(salesTopSellerSchema),
});
```

`reportSeriesPointSchema` is reused from `reports-drilldown.ts` rather than
redeclared. All money is MINOR units, matching every other admin contract.

Display labels for `channel` / `method` / `productType` are **not** on the wire —
they are i18n keys resolved client-side, so the API stays locale-free like the
segment contracts around it.

### 2. API — `apps/api/src/dashboard/dashboard-sales.service.ts` (new)

One route on the existing `DashboardController`:

```
GET /dashboard/sales?granularity=&productType=
@RequirePermissions(Permission.ReportView)
```

Guarded by `TenantGuard` + `PermissionsGuard` like its siblings; the tenant Prisma
extension scopes every read, so no handler passes or trusts a `gymId`. The query is
parsed with `dashboardSalesQuerySchema` — a hand-edited or unknown value lands on
the default rather than a 400, the same forgiving rule
`dashboard-segments.controller.ts` applies to `?range=`.

Two Prisma reads, both over the resolved window:

```ts
// Sales side — captured payments, joined for classification and line items.
payment.findMany({
  where: { status: CAPTURED, createdAt: { gte: win.start, lt: win.end } },
  select: {
    amount, refundedAmount, currency, method, provider, createdAt,
    order: {
      select: {
        packageId: true,
        creditPack: { select: { id: true } },
        items: { select: { label: true, amount: true } },
      },
    },
  },
  orderBy: { createdAt: 'asc' },
})

// Refunds side — own timestamps, so a refund lands in the bucket it happened in.
refund.findMany({
  where: { createdAt: { gte: win.start, lt: win.end } },
  select: { amount: true, createdAt: true, payment: { select: { order: { … } } } },
})
```

The refund read joins through to the order so the product-type filter applies to
refunds too — a `memberships` view must not show retail refunds against
membership sales.

A single pass over each result set builds all five outputs:

- `revenueOverTime` — net (`amount − refundedAmount`) per bucket, over
  `emptyBuckets(win)` so the series is dense and a quiet week reads as a real zero.
- `salesVsRefunds` — `amount` per bucket from payments, `Refund.amount` per bucket
  from refunds, zipped over the same dense bucket map.
- `byPaymentMethod` — grouped by `(provider === 'pos' ? 'pos' : 'online', method)`,
  net value, descending. Only combinations that actually occurred are emitted.
- `topSellers` — positive `OrderItem` lines grouped by `label`, carrying a distinct
  order count, descending by value, capped at 8 rows.
- `kpis` — gross, net, refunded (summed `refundedAmount`), and avg sale
  (`net / transactions`, `0` when there are none).

Currency resolves the way the drill-downs do: the last payment's `currency`, or
the gym's configured currency when the window is empty.

The `pos → POS / else → ONLINE` channel rule is not invented here — it is the same
rule the admin order roster already keys off (`orders.service.ts`), and `provider`
is set explicitly at both sources (`'pos'` in `orders.service.ts`, `'stub'` in
`checkout.service.ts` and `credit-packs.service.ts`).

### 3. Admin UI — `apps/admin/app/(dashboard)/sales/` (new)

Mirrors the Overview's file split so the two tabs stay legible side by side:

| File                        | Role                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| `sales-view.tsx`            | The tab. Owns the two controls + fetch; renders the work-area grid.     |
| `sales-kpi-strip.tsx`       | Four-tile bordered strip, `metric-strip.tsx`'s treatment.               |
| `sales-trend-card.tsx`      | `AreaChart` + the granularity `SegmentedControl` + product-type select. |
| `sales-vs-refunds-card.tsx` | `DualAreaChart` + legend.                                               |
| `payment-method-card.tsx`   | `BarChart` over channel × method, with a POS/Online share caption.      |
| `top-sellers-card.tsx`      | Ranked list — rank, label, order count, value.                          |
| `actions.ts`                | `loadSalesAction()`, on `segments/actions.ts`'s `ActionResult` shape.   |

Layout is `overview-view.tsx`'s `workArea` grid verbatim: `minmax(0, 2.2fr)
minmax(280px, 1fr)` above 1024px, collapsing to one column below; the rail sticks
at `top: 5rem` above 1280px with the same `maxHeight` / `overflowY` guard. Main
column holds the two trends, the rail holds payment method and top sellers.

Controls live in the trend card's header (`revenueHead`'s flex row) but are lifted
state in `SalesView`, since both scope the whole tab. Each card's caption names the
active window and filter ("Last 30 days · Memberships"), so no number on screen is
ambiguous about what produced it.

Fetching follows `segment-panel.tsx`: a `useRef` cache keyed `granularity:productType`
so returning to a visited combination is instant, `loadSalesAction` returning a
discriminated result rather than throwing across the boundary, an inline retry on
failure, and a skeleton on first load. The controls disable while a fetch is in
flight — the affordance `DashboardHeader` already uses.

Every card degrades to `EmptyState` when its own source is empty, independently.

**Chart primitive.** `charts.tsx` gains `DualAreaChart` — two overlaid series with a
legend, built from `AreaChart`'s existing path/gradient machinery, positive tone for
sales and negative for refunds. `AreaChart` and `BarChart` are reused as-is.

### 4. Shell changes

- `segmented-dashboard.tsx` renders `<SalesView/>` when `active === 'sales'`,
  beside the existing `active === 'overview'` branch. The lazily-mounted
  `SegmentPanel` keeps serving the remaining four segments unchanged.
- The "Add widget" button's condition widens from `active !== 'overview'` to also
  exclude `sales`.
- `dashboard-segments.ts` drops `'sales'` from `CONFIGURABLE_DASHBOARD_SEGMENTS`
  and removes the three `sales.*` catalogue entries. `DASHBOARD_SEGMENTS` keeps
  `sales` in display order, so the tab bar is unchanged.
- Stored `DashboardWidget` rows naming `sales.*` keys are left in place. They are
  plain strings the catalogue no longer resolves, and `findDashboardWidget` already
  returns `undefined` for an unknown key — the documented "omitted rather than
  returned broken" path. No migration.
- i18n: `admin.dashboard.sales.*` added to **both** `packages/i18n/locales/en.json`
  and `ka.json`.

## Data flow

```
SalesView (client)
  │  granularity + productType (lifted state, cached by composite key)
  ▼
loadSalesAction (server action — re-asserts ReportView)
  ▼
GET /dashboard/sales   ← TenantGuard + PermissionsGuard(ReportView)
  ▼
DashboardSalesService
  ├─ resolveWindow(granularity)            → report-window.util.ts
  ├─ payment.findMany  (+ order join)      → classify, bucket, group
  ├─ refund.findMany   (+ order join)      → bucket
  └─ one pass → { kpis, revenueOverTime, salesVsRefunds,
                  byPaymentMethod, topSellers }
```

## Error handling

- **Permission.** The API guard is authoritative. `loadSalesAction` re-checks
  `ReportView` before calling out — defence in depth, since a Server Action is a
  POST endpoint in its own right. Staff without it never reach the dashboard page
  at all (`page.tsx` renders `Welcome`).
- **Fetch failure.** `ActionResult` carries the message back; the view shows an
  inline alert plus a Retry that clears this combination's cache entry only,
  exactly as `SegmentPanel.retry` scopes its bypass.
- **Empty window.** Not an error. Dense zero-filled buckets for the trends,
  `EmptyState` copy per card, zeroed KPIs — the same honest "no data yet" signal
  the drill-downs emit.
- **Unknown query values.** Coerced to the defaults by the Zod schema at both ends.

## Testing

**`dashboard-sales.service.spec.ts`**

- Product-type classification: a credit-pack order → `session-packs`, a
  `packageId` order without one → `memberships`, a POS/cart order → `retail`.
- The filter narrows all five outputs, not just the trend.
- Bucketing at each granularity, including that a bucket with no rows is present
  and zero.
- A refund lands in the bucket of `Refund.createdAt`, not the sale's bucket —
  the specific bug the two-read design exists to prevent.
- Channel derivation: `provider: 'pos'` → POS, `'stub'` → Online.
- `topSellers` ignores negative (promo/discount) lines and caps at 8.
- Empty window → zeroed KPIs, dense zero series, empty breakdowns.

**`sales-view.test.tsx`**

- All four cards plus the KPI strip render from a fixture response.
- Changing granularity or product type refetches; returning to a visited
  combination serves the cache without a second call.
- Controls disable while in flight.
- A failed load shows the alert + Retry; Retry refetches.
- Per-card empty states when a fixture section is empty.

**`segmented-dashboard.test.tsx`** (existing, extended)

- `?segment=sales` renders `SalesView`, not `SegmentPanel`.
- The "Add widget" button is absent on `overview` **and** `sales`, present on the
  other four.

## Alternatives considered

**Parameterised widgets.** Extend `DashboardWidgetDefinition` with per-widget
params and let `SegmentPanel` pass them through. Rejected: every segment pays for
a control surface only Sales needs, and the picker would have to learn to store
parameter state per gym — a schema change to serve one tab.

**Two static widgets, no controls.** Add `sales.revenue-over-time` and
`sales.vs-refunds` to the catalogue, bucketed by the tab's `?range=`. Cheapest by
far, and rejected only because it drops both features the request is actually
about: the daily/weekly/monthly toggle and the product-type filter.

**Channel-only filter (POS vs Online).** Filter by `Payment.provider` instead of
product type. Perfectly reliable but answers a different question, and the channel
split is already surfaced by the payment-method card.
