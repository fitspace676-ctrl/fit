# Dashboard Revenue tab — money in, money owed, money coming — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for planning
**Follows:** [`2026-08-07-dashboard-members-design.md`](./2026-08-07-dashboard-members-design.md)

## Problem

The Revenue tab is the generic widget grid: two `ReportSectionCard`s pulled from
the Reports drill-down catalogue (`revenue.over-time`, `revenue.by-location`).
Both read `Payment` rows only, so both answer one narrow question — what the till
took — and the drill-down says so in its own comment: _"Subscriptions raise no
payments in the MVP, so this is order/POS revenue only."_

That leaves an owner unable to answer the questions a subscription business is
actually run on:

- **What is the recurring base worth?** `Subscription.priceAmount` and `interval`
  carry it; nothing sums them.
- **What is owed but not settled?** `Invoice{PENDING, FAILED}` and `dueDate`
  carry it; nothing surfaces it, so a failed renewal is invisible until the
  member complains.
- **What is coming in next?** `Subscription.currentPeriodEnd` says exactly which
  charges fall due this week; nothing reads it forward.

And the one figure the tab does show duplicates the Sales tab, which already
covers transactional takings in more detail.

## Scope

One implementation plan. The tab stands alone as complete on delivery.

### Delivered

- A hand-built `RevenueView` replacing the widget grid for the `revenue` tab, on
  the Overview's grid (main column + sticky rail), exactly as Sales and Members.
- A four-tile KPI strip: total revenue, MRR, revenue per member, outstanding.
- Three trends: total revenue split by stream, recurring revenue (MRR), and
  projected upcoming charges.
- Two snapshots in the rail: outstanding/overdue invoices, and revenue by
  location (rendered only for a multi-location gym).
- Two tab-wide controls: granularity (daily / weekly / monthly) and projection
  window (7 / 30 days).
- Removing `revenue` from the configurable segments and its two catalogue
  entries.

### Out of scope

- **Design-token changes.** Existing `var(--color-*)` / `var(--font-family-*)`
  values only.
- **Schema migrations.** Every figure derives from existing columns.
- **The Reports drill-down.** `revenue-over-time`, `revenue-by-plan`,
  `revenue-by-location` and `revenue-monthly` stay exactly as they are; `/reports`
  is a different surface with a different contract. This tab does not refactor it
  and does not import from it.
- **Acting on what the tab surfaces.** Chasing an overdue invoice, retrying a
  failed charge, or emailing a member is the Payments hub's job. The rail card
  states the numbers; it does not act on them.
- **Forecasting beyond scheduled charges.** "Projected" means charges already
  scheduled by an existing subscription's own billing date. No growth model, no
  churn-adjusted expectation, no seasonality.
- **Cash-basis vs accrual reconciliation.** Every figure is cash actually taken
  (or explicitly labelled as owed / expected). This is not an accounting ledger.

## Known data limits

Stated up front because they shape the contract, and because this codebase's rule
is that a figure is a real aggregation or an explicit empty state.

**There is no status history, so a past instant's MRR is reconstructed.** No
per-status event log exists. A subscription contributes to a past bucket if it was
created before that instant and had not reached its churn moment by then, valued
at **today's** `priceAmount`. That is exact for a subscription that was created,
ran, and (possibly) ended at one price — the overwhelming majority — and
approximate for one whose price changed, or that moved between live states in the
past (`ACTIVE → FROZEN → ACTIVE`), because `updatedAt` remembers only the most
recent move. The same reconstruction already backs the Members tab's active-member
trend; this spec reuses its helpers rather than inventing a second answer.

**Trials are excluded from MRR by definition, not by accident.** A `TRIAL`
subscription is entitled but has not been charged. Counting it as recurring
revenue would inflate MRR by exactly the amount most at risk of never arriving.
It appears in Projected instead, where "expected, not yet taken" is the whole
point of the number.

**"Overdue" is derived, not stored.** `InvoiceStatus` is
`PAID | PENDING | FAILED | REFUNDED` — there is no `OVERDUE`. An invoice is
overdue when it is unsettled **and** carries a `dueDate` strictly before the
current UTC day's start. An unsettled invoice with no `dueDate` is outstanding but
never overdue: no deadline was ever stated, so none has passed.

**Subscription revenue and order revenue are disjoint by construction.** A
subscription charge mints an `Invoice`; a POS/shop sale mints a `Payment` and,
where it also raises a document, an `Invoice` carrying that `orderId`. Summing
`Payment{CAPTURED}` with `Invoice{PAID, orderId: null}` therefore counts every
money movement exactly once. The `orderId: null` filter is the whole guard, and it
is the same one `dashboard-members.service.ts` uses for its LTV numerator.

**Trashed members are filtered from the head-count reads, not from the money.**
`GymMember.deletedAt` is a soft delete. A subscription belonging to a trashed
member is excluded from MRR, from the projection, and from the active-member
denominator — that membership is not billing. Cash already taken is **not**
filtered: a payment that settled is revenue whether or not the member was later
moved to trash, and `Invoice`/`Order` deliberately survive a member purge
(`SetNull`) for exactly that reason. The consequence is stated rather than hidden:
a member trashed mid-window leaves their takings in `revenuePerMember`'s numerator
while leaving its denominator.

**Outstanding debt is counted gym-wide, including for trashed members.** An
unsettled invoice is owed regardless of the roster's state, and its `memberId` may
already be `null` from a purge. Filtering it out would quietly shrink a number
whose entire job is to be uncomfortable.

**Single-location gyms have no location breakdown to show.** Not an empty chart —
the question does not apply. The contract distinguishes "not applicable" from "no
revenue" so the client can drop the card rather than render an empty one.

## Metric definitions

Money is an integer in the currency's MINOR units (tetri) throughout. The response
carries one `currency`, taken from the most recent payment, else the most recent
invoice, else `DEFAULT_CURRENCY`.

### Total revenue, split by stream

Two dense series over the granularity's window, bucketed by
`report-window.util`'s existing `resolveWindow` / `bucketKey`:

- **`recurring`** — `Invoice{status: PAID, orderId: null}`, bucketed by `issuedAt`.
  Membership and other subscription charges.
- **`oneOff`** — `Payment{status: CAPTURED}`, bucketed by `createdAt`, valued
  `amount − refundedAmount`. The till, the shop, session packs.

The KPI tile is the sum of both over the whole window. A partial refund reduces
the bucket the original payment landed in, not the bucket the refund happened in —
consistent with the Reports drill-down, and the reason the tile can move for a
past day.

### MRR — recurring revenue from active plans

For each bucket instant, the sum over subscriptions **live and `ACTIVE`** at that
instant of `priceAmount` normalised to a month:

- `interval = MONTH` → `priceAmount`
- `interval = YEAR` → `Math.round(priceAmount / 12)`

`TRIAL` (not yet charged), `PAST_DUE` (charged, not collected), `FROZEN` (paused),
and every terminal state are excluded. `kpis.mrr` is the value computed at
`win.end` — the MRR as it stands now, not an average over the window, and not
necessarily the last point of `mrrOverTime` (that point is its own bucket's
_start_).

### Revenue per member

Window net revenue (both streams) ÷ members holding a **live** subscription at the
window's end. Zero members yields `0`, not a division by zero.

"Live" here is `isLiveStatus` — the same population the Members tab calls active
members, so the two tabs' denominators agree. It is deliberately wider than MRR's
`ACTIVE`-only rule: MRR asks "what is contractually recurring", this asks "how
much did we take per person on the books". A frozen member is on the books and
contributes no MRR, and both statements are true.

Deliberately different from the Members tab's `avgLtv`, which divides _lifetime_
revenue by _all_ members. This one is a rate over the selected window; that one is
a per-head lifetime total. Two different questions, so two different tiles on two
different tabs.

### Outstanding and overdue

Over `Invoice{status: PENDING | FAILED}`, gym-wide and **not** window-scoped — a
debt does not stop being owed because the chart is showing last week:

- `count`, `total` — everything unsettled.
- `overdueCount`, `overdueTotal` — the subset whose `dueDate` is strictly before
  the current UTC day's start.
- `failedCount`, `failedTotal` — the `FAILED` subset. Broken out because it needs
  a different response: an overdue `PENDING` invoice is chased, a `FAILED` charge
  is retried.

### Projected upcoming revenue

Over `Subscription{status: ACTIVE | TRIAL, cancelAtPeriodEnd: false}` whose
`currentPeriodEnd` falls in `[now, now + projectionWindow)`, valued at
`priceAmount` (the charge that will actually be taken, not a monthly
normalisation), bucketed by calendar day and densely zero-filled.

`cancelAtPeriodEnd: true` is excluded: that subscription is scheduled to end, not
to renew. `FROZEN` is excluded: a frozen subscription's period end moves when it
resumes, so its current date is not a charge date.

Alongside the series, `atRisk` — the count and summed `priceAmount` of
`PAST_DUE` subscriptions. Not part of the projection (that money is already late,
not upcoming) but shown beneath it, because the honest read of "what is coming in"
includes what is being chased.

### Revenue by location

`Payment{CAPTURED}` in the window, attributed through `order.location.name`,
summed net, sorted descending. Payments with no location fall under the existing
`NO_LOCATION_LABEL`.

`byLocation` is `null` when the gym has fewer than two active `Location` rows —
"the question does not apply" — and an array (possibly empty) otherwise. Only the
`Payment` stream is attributable: a subscription invoice names no location, and
inventing one would be a fabricated figure. The card's caption says so rather than
letting the totals silently disagree with the KPI tile.

## Architecture

### 1. Contract — `packages/types/src/dashboard-revenue.ts` (new)

```ts
export const revenueGranularitySchema = salesGranularitySchema; // daily|weekly|monthly
export const projectionWindowSchema = z.enum(['7', '30']);

export const dashboardRevenueQuerySchema = z.object({
  granularity: revenueGranularitySchema.catch(DEFAULT_REVENUE_GRANULARITY),
  projectionWindow: projectionWindowSchema.catch(DEFAULT_PROJECTION_WINDOW),
});

export const revenueStreamPointSchema = z.object({
  label: z.string(), // bucket start, YYYY-MM-DD
  recurring: z.number(),
  oneOff: z.number(),
});

export const revenueKpisSchema = z.object({
  totalRevenue: z.number(), // window, both streams, net
  mrr: z.number(), // at window end
  revenuePerMember: z.number(), // window revenue / active members
  outstandingTotal: z.number(), // gym-wide, PENDING + FAILED
});

export const outstandingInvoicesSchema = z.object({
  count: z.number(),
  total: z.number(),
  overdueCount: z.number(),
  overdueTotal: z.number(),
  failedCount: z.number(),
  failedTotal: z.number(),
});

export const projectedRevenueSchema = z.object({
  total: z.number(),
  points: z.array(reportSeriesPointSchema), // dense, one per day
  atRiskCount: z.number(),
  atRiskTotal: z.number(),
});

export const revenueLocationSliceSchema = z.object({
  location: z.string(),
  value: z.number(),
});

export const dashboardRevenueResponseSchema = z.object({
  granularity: revenueGranularitySchema,
  projectionWindow: projectionWindowSchema,
  currency: z.string(),
  kpis: revenueKpisSchema,
  revenueOverTime: z.array(revenueStreamPointSchema),
  mrrOverTime: z.array(reportSeriesPointSchema),
  projected: projectedRevenueSchema,
  outstanding: outstandingInvoicesSchema,
  /** `null` — single-location gym, question not applicable. */
  byLocation: z.array(revenueLocationSliceSchema).nullable(),
});
```

Exported from `packages/types/index.ts` beside its three siblings.

### 2. API — `apps/api/src/dashboard/dashboard-revenue.service.ts` (new)

One `get(query)` building the whole tab from a single `Promise.all` of five reads:
payments (window, with `order.location`), paid subscription invoices (window),
unsettled invoices (gym-wide), subscriptions (all, for the MRR reconstruction and
the projection), and the active-location count.

Runs on `TenantPrismaService`, so no query passes or trusts a `gymId`.
`member: { deletedAt: null }` is applied to the **subscription** read only — see
"Trashed members" above for why the money reads are deliberately unfiltered.

The subscription-liveness helpers (`churnMoment`, `wasLiveAt`) currently live as
private functions in `dashboard-members.service.ts`. They move to a shared
`apps/api/src/dashboard/subscription-timeline.util.ts` and both services import
them — a third hand-written copy of that logic is exactly what the Members spec
refused to add.

Wired into `dashboard.controller.ts` as `GET /dashboard/members`'s sibling:
`@Get('revenue')`, gated on `Permission.ReportView`, query parsed with
`dashboardRevenueQuerySchema` (`.catch`, so a hand-edited URL lands on defaults
rather than a 400).

### 3. Admin UI — `apps/admin/app/(dashboard)/revenue-insights/` (new)

Directory named `revenue-insights` because `(dashboard)/revenue` does not exist
but `(dashboard)/payments` and `(dashboard)/reports` already own the adjacent
routes; the folder is a tab's components, not a route segment, exactly like
`member-retention/`.

| File                            | Job                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actions.ts`                    | `loadRevenueAction` — re-asserts `ReportView`, re-parses the query, resolves failures to `{ ok: false, error }`                                       |
| `revenue-view.tsx`              | The tab: both controls, the fetch/cache/retry ref keyed on `granularity:projectionWindow`, the settle cascade, error-as-banner once data is on screen |
| `revenue-kpi-strip.tsx`         | Four tiles                                                                                                                                            |
| `revenue-trend-card.tsx`        | Stacked two-stream trend; owns the granularity control                                                                                                |
| `recurring-revenue-card.tsx`    | MRR trend                                                                                                                                             |
| `projected-revenue-card.tsx`    | Projection series + at-risk line; owns the 7/30 control                                                                                               |
| `outstanding-invoices-card.tsx` | Rail snapshot                                                                                                                                         |
| `revenue-by-location-card.tsx`  | Rail breakdown; the view renders it only when `byLocation !== null`                                                                                   |

`lib/api.ts` gains `fetchDashboardRevenue`, `cache: 'no-store'`, beside
`fetchDashboardMembers`.

### 4. Shell changes

- `HAND_BUILT_SEGMENTS` becomes `['overview', 'sales', 'members', 'revenue']`;
  `CONFIGURABLE_DASHBOARD_SEGMENTS` becomes `['classes', 'staff']`.
- The two `revenue.*` entries leave `DASHBOARD_WIDGET_CATALOG`; their
  `revenueOverTime` / `revenueByLocation` i18n labels leave both locales.
- `segmented-dashboard.tsx` mounts `<RevenueView />` for the tab. No change to
  `configurableSegment` or `dashboard-header.tsx`: both already branch on
  `isHandBuiltSegment`, which is why that guard was introduced.
- Tests that use `revenue` as their configurable exemplar move to `classes`.

**Noted, not decided here:** after this tab, the picker offers two segments. A
follow-up should decide whether the configurable grid survives at all, or whether
Classes and Staff become hand-built too and the widget machinery is retired.

## Data flow

```
RevenueView (client)
  │  granularity, projectionWindow  (local state, cached by composite key)
  ▼
loadRevenueAction (server action)  ── ReportView re-check, query re-parse
  ▼
GET /dashboard/revenue?granularity=&projectionWindow=
  ▼
DashboardRevenueService.get
  ├─ payment.findMany       (window, CAPTURED, + order.location)
  ├─ invoice.findMany       (window, PAID, orderId: null)
  ├─ invoice.findMany       (gym-wide, PENDING | FAILED)
  ├─ subscription.findMany  (all, live-state reconstruction + projection)
  └─ location.count         (ACTIVE — decides byLocation null vs array)
  ▼
DashboardRevenueResponse  ── one payload, every card from the same instant
```

## Error handling

Identical to Sales and Members, because a user who has learnt one tab's failure
behaviour has learnt this one's:

- A first load that fails renders the alert **as** the tab, with a Retry.
- A failure once data is on screen renders a banner **above** the previous
  combination's figures, which stay usable — the controls live inside the cards,
  so replacing the tab would strand the user on the combination that just failed.
- Retry deletes only its own cache entry.
- `loadRevenueAction` resolves its own failures; the client still `.catch`es the
  call itself, or a dropped connection leaves a permanent skeleton with no retry.

## Testing

**`packages/types/src/dashboard-revenue.spec.ts`**

- Query defaults: an unknown `granularity` / `projectionWindow` lands on the
  default rather than failing.
- Response round-trips; `byLocation: null` parses and is distinct from `[]`.

**`apps/api/src/dashboard/dashboard-revenue.service.spec.ts`**

- A POS order that raised both a `Payment` and an `Invoice` is counted **once**
  (the `orderId: null` guard).
- `YEAR` interval normalises to `round(amount / 12)` in MRR; `MONTH` passes
  through.
- MRR excludes `TRIAL`, `PAST_DUE`, `FROZEN` and terminal states.
- Overdue boundary: `dueDate` exactly at today's UTC start is **not** overdue;
  one millisecond earlier is. An unsettled invoice with `dueDate: null` counts as
  outstanding and not as overdue.
- Projection excludes `cancelAtPeriodEnd: true` and `FROZEN`; includes `TRIAL`.
- `atRisk` counts `PAST_DUE` and is absent from the projection series.
- `byLocation` is `null` with one active location, an array with two.
- Zero active members yields `revenuePerMember: 0`.
- Dense zero-fill: a window with no revenue emits every bucket at `0`, not `[]`.

**`apps/admin/app/(dashboard)/revenue-insights/revenue-view.test.tsx`**

- Changing granularity refetches; returning to a visited combination does not.
- Retry drops only its own cache entry.
- First-load failure renders the alert; a later failure renders the banner with
  the previous figures still on screen.
- The location card is absent when `byLocation` is `null` and present when it is
  an array.

**Shell regressions** — `segmented-dashboard.test.tsx` gains a "renders the
hand-built revenue view, not the widget panel" case; `dashboard-header.test.tsx`
extends its hand-built table to `revenue`; the picker and panel tests move their
exemplar to `classes`.

## Alternatives considered

**Keep the widget grid and add four more catalogue entries.** Rejected: a widget
is a Reports drill-down section rendered by `ReportSectionCard`. Three of the six
figures are snapshots with no series, one is conditional on the gym's shape, and
two need a control the grid has no place to put. Forcing them through the widget
seam would mean either fabricating series for snapshots or extending the widget
contract for one tab's benefit.

**Reuse `report-drilldown.service.ts`'s `revenue()` and add sections to it.**
Rejected: that method backs `/reports/revenue`, which is a separate product
surface with its own export path and its own consumers. Changing what it returns
to suit a dashboard tab couples two surfaces that currently have no reason to
change together — and its stated contract is payments-only, which this tab
deliberately breaks with.

**One combined revenue line instead of a split.** Rejected in brainstorming: a
single line hides the only distinction an owner acts on — recurring base versus
transactional takings move for entirely different reasons and are fixed by
entirely different actions.

**Include `PAST_DUE` in the projection.** Rejected: it would let money that has
already failed to arrive inflate the number whose entire purpose is "what is
coming in". It is reported beside the projection, labelled as at risk.
