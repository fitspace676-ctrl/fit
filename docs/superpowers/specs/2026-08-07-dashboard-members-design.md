# Dashboard Members tab — retention analytics — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for planning
**Follows:** [`2026-08-07-dashboard-sales-design.md`](./2026-08-07-dashboard-sales-design.md)

## Problem

The Members tab is the generic widget grid: two static `ReportSectionCard`s
(`members.new-signups`, `members.churn`) pulled from the Reports drill-down
catalogue. Both are lagging indicators — they tell a gym who has already left.

Nothing on the tab answers the question a gym actually runs on: **who is about to
leave, and is there still time to do something about it.** That question has two
halves, and the tab has neither:

- **The billing half.** Whose membership lapses this week? `Subscription.currentPeriodEnd`
  carries it and nothing surfaces it.
- **The engagement half.** Who is still paying but has stopped showing up?
  `CheckIn` carries every visit and nothing reads it for this. This is the earlier
  signal by weeks — a member disengages long before they cancel — and it is the
  only one that leaves room to intervene.

Alongside those, the tab lacks the standing numbers that frame them: how many
members there are over time, what the retention rate is, how the membership base
splits by billing state, and what a member is worth.

## Scope

Delivered as **two implementation plans** off this one spec. Plan A stands alone
as a complete, useful tab; Plan B adds the two drill-down lists.

### Plan A — the tab and its trends

- A hand-built `MembersView` replacing the widget grid for the `members` tab,
  on the Overview's grid (main column + sticky rail), exactly as Sales.
- A four-tile KPI strip: active members, new signups, churned, average LTV.
- Three trends: total active members, signups-vs-churn, retention %.
- A members-by-status breakdown across all six `SubscriptionStatus` values.
- One tab-wide granularity control (daily / weekly / monthly) plus a
  retention-window control (30 / 60 / 90 days) local to the retention card.
- Removing `members` from the configurable segments and its two catalogue entries.

### Plan B — the two watch-lists

- **Members expiring soon** — count plus list, window configurable 7 / 14 / 30 days.
- **Members at risk** — count plus list, ranked by how far past their own usual
  rhythm each member has drifted.
- Both as rail cards with an inline list, on the same tab.

### Out of scope

- **Design-token changes.** Existing `var(--color-*)` / `var(--font-family-*)`
  values only.
- **Schema migrations.** Every figure derives from existing columns.
- **The other three segments.** `revenue`, `classes` and `staff` keep the widget
  grid and the picker.
- **Acting on a list.** The cards surface who is at risk; messaging them, tagging
  them, or opening a task is a separate feature. The list rows link to the member
  detail page and stop there.
- **Predictive LTV.** See "Metric definitions" below.

## Known data limits

Stated up front because they shape the contract, and because this codebase's rule
is that a figure is a real aggregation or an explicit empty state.

**A member with too few visits has no rhythm to measure.** The at-risk metric
compares a member against their own history. Below four visits in the baseline
window there are fewer than three intervals to take a median of, which is noise
rather than a pattern. Those members are excluded from the ranking and **counted
separately in the card's caption** — never silently dropped, and never assigned a
fabricated baseline.

**Trashed members are excluded, and the existing report does not exclude them.**
`GymMember.deletedAt` is a soft-delete the roster, check-in and dashboard counts
all filter on (`deletedAt: null`, eleven call sites). The `members` drill-down in
`report-drilldown.service.ts` does **not**, so its figures currently include
trashed members. This tab filters correctly; the drift is recorded here as a
pre-existing bug in Reports, not fixed by this work.

**Subscription state is reconstructed, not journalled.** There is no per-status
event log, so a past instant's state is derived from `createdAt`, `status`,
`canceledAt` and `updatedAt` via the existing `churnMoment` / `isTerminalBefore`
helpers. That is exact for the current state and for a clean cancel/expire, and
approximate for a subscription that moved between live states in the past
(`ACTIVE → FROZEN → ACTIVE`) — `updatedAt` only remembers the most recent move.
The historical trends therefore reconstruct membership _count_, which the
derivation gets right, and never claim to reconstruct historical status _mix_.
That is why "members by status" is a snapshot and not a trend.

**`FROZEN` is live but not entitled, and the difference is load-bearing.**
`@fit/db`'s state machine distinguishes `LIVE_SUBSCRIPTION_STATUSES`
(TRIAL / ACTIVE / PAST_DUE / FROZEN — the uniqueness slot) from
`ENTITLED_SUBSCRIPTION_STATUSES` (TRIAL / ACTIVE / PAST_DUE — access right now).
Which set a figure uses is a real decision, made per metric in the table below.

## Metric definitions

The four figures that are not simply a count of rows.

### Total active members

Members holding a subscription in `LIVE_SUBSCRIPTION_STATUSES` at each bucket's
start. Frozen counts: a paused membership is still a membership, still occupies
the slot, and still resumes.

### Retention %, rolling window

```
retention(N) = live members at (bucketStart − N days) who are STILL live at bucketStart
               ÷ live members at (bucketStart − N days)
```

One line, with a 30 / 60 / 90 control choosing `N`. Rejected alternatives:
`1 − churnRate` duplicates the existing churn chart with no new information, and
cohort-by-join-month retention answers a different (also useful) question that
needs its own surface — a grid, not a line.

A bucket whose denominator is zero — a gym with no members N days before it —
emits `null`, and the chart breaks the line there rather than drawing 0%. A gym
that did not exist yet had no retention, and 0% is a different and alarming claim.

### Average LTV

```
avgLTV = ( Σ net captured Payments attributed to a member
         + Σ PAID Invoices with no linked order )
         ÷ count of non-trashed MEMBER-role GymMembers
```

Revenue lives in two tables and this is the only figure that spans both. Payments
attribute through `Order.memberId`; subscription billing raises `Invoice` rows and
no payment at all.

**The `orderId IS NULL` filter on invoices is not optional.** An admin-raised
invoice may name an order that also has a captured payment, and counting both
would double-count that money. Excluding order-linked invoices keeps every
currency unit counted exactly once.

This is **lifetime value to date** — a real aggregation over money actually taken.
It is deliberately not the predictive `ARPU × 1/churn` formula: that is a
projection, and a projection rendered as a hard number beside six measured ones
reads as measured. The tile's caption says "to date" so the figure cannot be
mistaken for a forecast.

Guest and walk-in revenue (orders with no `memberId`) is excluded from the
numerator, since it belongs to no member's lifetime.

### Members at risk

The tab's one genuinely new aggregation, and the reason engagement beats billing
as an early warning.

For each member holding an **`ENTITLED`** subscription — frozen members are
deliberately not visiting, so flagging them would fire a false alarm on every
freeze — measured over an explicit baseline window of **`[now − 104d, now − 14d]`**:
ninety days of history, ending a fortnight ago.

The fortnight is cut out on purpose. The baseline exists to answer "what is this
member's normal rhythm?", and letting the current silence into it would drag the
median toward the very drop-off being detected — the member would keep
re-normalising to their decline and never trip. `currentGap` is measured against
the member's genuine last check-in, inside the excluded fortnight or not.

```
usualGap   = median interval, in days, between consecutive check-ins
alertAfter = clamp(usualGap × 2, 10 days, 30 days)
currentGap = days since the member's last check-in
at risk    ⟺ currentGap ≥ alertAfter          (needs ≥ 4 baseline visits)
severity   = currentGap ÷ alertAfter          (the list's sort key, descending)
```

**Why the median, not the mean.** One long holiday drags a mean far enough to
mask a real drop-off; the median ignores it.

**Why the clamp.** A bare `× 2` misbehaves at both ends of the distribution. A
member who comes three times a week has a 2.3-day gap, so `× 2` fires after 4.6
days — one bout of flu and they are on the list. A member who comes monthly has a
30-day gap, so `× 2` fires after 60 days, by which point the membership is gone.
The bounds fix both ends, and each has a reason:

| Bound               | Why                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **10 days** floor   | One missed week is a holiday, an illness, a work trip. It is not a signal.                                       |
| **30 days** ceiling | A missed billing cycle is no longer an early warning; past that the card would be reporting rather than warning. |

Worked through the range:

| Member      | `usualGap` | `× 2` | `alertAfter` |
| ----------- | ---------- | ----- | ------------ |
| 3× per week | 2.3d       | 4.6d  | **10d**      |
| 2× per week | 3.5d       | 7d    | **10d**      |
| Weekly      | 7d         | 14d   | **14d**      |
| Fortnightly | 14d        | 28d   | **28d**      |
| Monthly     | 30d        | 60d   | **30d**      |

The card reports three groups, and all three are shown because each answers a
different question:

1. **At risk** — has a rhythm and has broken it. Ranked by `severity`.
2. **Never visited** — holds an entitled subscription and has no check-in at all.
   The highest-risk cohort and the one the ratio cannot express, since it has no
   denominator. Listed separately, above the ranked list.
3. **Not enough history** — fewer than four baseline visits. A count in the
   caption, no list. The honest answer is that we cannot judge them yet.

### Members expiring soon

Subscriptions in `ENTITLED_SUBSCRIPTION_STATUSES` whose `currentPeriodEnd` falls
between now and now + N days, where N is 7 / 14 / 30 from a control on the card.

Frozen subscriptions are excluded: a freeze pushes `currentPeriodEnd` out by the
days spent frozen on resume, so a frozen row's period end is a placeholder rather
than a date anything happens on, and listing it would send staff chasing a lapse
that is not going to occur.

`cancelAtPeriodEnd` rows **are** included and flagged in the list — they are the
most certain lapses on the tab.

## Architecture

### 1. Contract — `packages/types/src/dashboard-members.ts` (new)

Mirrors `dashboard-sales.ts`. The query carries the tab-wide granularity plus the
two card-local windows, so the whole tab stays one round trip:

```ts
export const membersGranularitySchema = salesGranularitySchema; // daily|weekly|monthly
export const retentionWindowSchema = z.enum(['30', '60', '90']);
export const expiringWindowSchema = z.enum(['7', '14', '30']);

export const dashboardMembersQuerySchema = z.object({
  granularity: membersGranularitySchema.catch('daily'),
  retentionWindow: retentionWindowSchema.catch('30'),
  expiringWindow: expiringWindowSchema.catch('7'),
});
```

`.catch` not `.default`, so a hand-edited URL lands on the default rather than a
400 — the rule every dashboard query in this repo follows.

Response (money in MINOR units, as everywhere):

```ts
kpis: { activeMembers, newSignups, churned, avgLtv }
activeOverTime:  ReportSeriesPoint[]                  // count per bucket
signupsVsChurn:  { label: string; signups: number; churned: number }[]
retention:       { label: string; value: number | null }[]   // percent, null = no denominator
byStatus:        { status: SubscriptionStatus-as-wire; count: number }[]
expiringSoon:    { total: number; members: MemberListRow[] }
atRisk:          { ranked: AtRiskRow[]; neverVisited: MemberListRow[]; unjudgeable: number }
```

`signupsVsChurn` declares its own `{ label, signups, churned }` rather than
reusing `salesComparisonPointSchema`. The two are structurally identical, and
generalising them to `{ label, a, b }` was considered and rejected: the field
names are what make each contract readable at its call site, and a shared
three-field schema would trade that away to save six lines. Nothing is shared at
the wire level — the reuse that matters is the `DualAreaChart` component, which
takes its own `{ label, primary, secondary }` and is mapped to by each card.

Status labels stay off the wire as i18n keys, matching Sales.

### 2. API — `apps/api/src/dashboard/dashboard-members.service.ts` (new)

One route on the existing controller, guarded like its siblings:

```
GET /dashboard/members?granularity=&retentionWindow=&expiringWindow=
@RequirePermissions(Permission.ReportView)
```

Four reads, all windowed and tenant-scoped:

| Read                    | Notes                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gymMember.findMany`    | `role: MEMBER`, `deletedAt: null` — the trash filter Reports is missing                                                                                   |
| `subscription.findMany` | with `member: { deletedAt: null }`, for every trend and the status split                                                                                  |
| `checkIn.findMany`      | **`gymId` pinned explicitly** — `CheckIn` is not in the tenant extension's model set (see `check-in.service.ts`); the attendance drill-down does the same |
| `payment` + `invoice`   | for the LTV numerator only                                                                                                                                |

`LIVE_SUBSCRIPTION_STATUSES` and `ENTITLED_SUBSCRIPTION_STATUSES` are imported
from `@fit/db`. **A fifth local copy must not be created:** the constant is
already duplicated by hand in `dashboard.service.ts:40`, `members.service.ts:64`
and `report-drilldown.service.ts:34`, all currently in agreement and all free to
drift. The new service imports the canonical one; re-pointing the three existing
copies is a worthwhile follow-up but is not in this scope.

Window and bucket maths delegate entirely to `report-window.util.ts`, as Sales does.

**The at-risk pass** is the only non-trivial computation. It groups the baseline
check-ins by member, sorts each member's timestamps, diffs consecutive pairs,
takes the median, and applies the clamp. One pass over check-ins to group, then
one sort per member — comfortably inside a gym-sized dataset, and bounded by the
`(gymId, checkedInAt)` index the window read already uses.

### 3. Admin UI — `apps/admin/app/(dashboard)/members/` (new)

| File                        | Role                                            |
| --------------------------- | ----------------------------------------------- |
| `members-view.tsx`          | The tab: fetch, cache, controls, layout         |
| `members-kpi-strip.tsx`     | Four tiles                                      |
| `active-members-card.tsx`   | `AreaChart` + the granularity control           |
| `signups-vs-churn-card.tsx` | `DualAreaChart` — the primitive built for Sales |
| `retention-card.tsx`        | `AreaChart` + the 30/60/90 control              |
| `status-breakdown-card.tsx` | `BarChart` over six statuses                    |
| `expiring-soon-card.tsx`    | Count + list + the 7/14/30 control _(Plan B)_   |
| `at-risk-card.tsx`          | Three groups, ranked list _(Plan B)_            |
| `member-list.tsx`           | The row shared by both list cards _(Plan B)_    |
| `actions.ts`                | `loadMembersAction`                             |

Layout, fetch/cache/retry, the settle cascade, and the error-banner-over-content
behaviour are all lifted from `sales/sales-view.tsx`, which is the reference
implementation for a hand-built tab now that its review findings are folded in.

`member-list.tsx` exists from the start of Plan B rather than being extracted
later: both list cards render the same row (avatar initials, name, the one figure
that matters for that list, a link to the member) and writing it twice to
de-duplicate afterwards is the mistake the Sales work already paid for once.

### 4. Shell changes

Identical in shape to the Sales switch-over: `members` leaves
`CONFIGURABLE_DASHBOARD_SEGMENTS`, its two catalogue entries go,
`DASHBOARD_SEGMENTS` gains it explicitly beside `overview` and `sales`,
`configurableSegment()` in `segmented-dashboard.tsx` learns the third hand-built
tab, and `DashboardHeader` shows it no `?range=` control.

Every spec that currently uses `'members'` as its example configurable segment
moves to `'revenue'` — the same fallout the Sales switch-over had, for the same
reason, and the plan enumerates it rather than leaving it to be discovered.

**After this tab, three of six segments are hand-built.** If a fourth follows,
the shell's `overview | sales | members | configurable` branching should become a
registry rather than a widening conditional. Recorded as a threshold, not done here.

## Data flow

```
MembersView (client)
  │  granularity + retentionWindow + expiringWindow (lifted state, cached by composite key)
  ▼
loadMembersAction (server action — re-asserts ReportView)
  ▼
GET /dashboard/members   ← TenantGuard + PermissionsGuard(ReportView)
  ▼
DashboardMembersService
  ├─ resolveWindow(granularity)             → report-window.util.ts
  ├─ gymMember   (deletedAt: null)          → signups, LTV denominator
  ├─ subscription(member.deletedAt: null)   → active trend, churn, retention, status, expiring
  ├─ checkIn     (gymId pinned)             → at-risk baselines
  ├─ payment + invoice                      → LTV numerator
  └─ one pass each → { kpis, activeOverTime, signupsVsChurn, retention,
                       byStatus, expiringSoon, atRisk }
```

## Error handling

Identical to Sales, which is now the reference: the API guard is authoritative and
the action re-checks `ReportView` as defence in depth; a failed fetch with data
already on screen renders an error banner **above the still-usable content** rather
than replacing the tab (the Sales review's finding, applied from the start here);
`.catch()` on the action call so a dropped connection cannot leave a permanent
skeleton; unknown query values coerce to defaults at both ends.

Empty states are per card. A gym with no check-ins at all gets an at-risk card
that says so, not an empty ranked list implying everyone is fine.

## Testing

**`dashboard-members.service.spec.ts`** (Plan A portion)

- Active-members trend counts a `FROZEN` subscription as live and a `CANCELED`
  one as not.
- Trashed members (`deletedAt`) are excluded from every figure — the bug the
  Reports drill-down has.
- Retention emits `null`, not `0`, for a bucket with no denominator.
- LTV counts a payment and a subscription invoice, and does **not** double-count
  an invoice that names an order with a captured payment.
- LTV excludes guest orders with no `memberId`.
- Status breakdown covers all six statuses and omits none with a non-zero count.
- Empty window → zeroed KPIs, dense zero series, empty breakdowns.

**`dashboard-members.service.spec.ts`** (Plan B portion)

- `usualGap` uses the median: a member with gaps `[2, 2, 2, 40]` is judged on 2,
  not on the mean of 11.5.
- The floor: a 3×/week member absent 8 days is **not** flagged; absent 11 days is.
- The ceiling: a monthly member absent 35 days **is** flagged, though `× 2` alone
  would have waited for 60.
- A `FROZEN` member absent for months is never flagged.
- A member with three baseline visits lands in `unjudgeable`, not in the ranking.
- A member with an entitled subscription and no check-ins lands in `neverVisited`.
- `severity` orders the ranked list, most overdue first.
- Expiring-soon respects the window bound, excludes frozen, includes and flags
  `cancelAtPeriodEnd`.

**`members-view.test.tsx`** — every card renders from a fixture; each control
refetches; a revisited combination serves from cache; the error banner keeps the
controls mounted; per-card empty states; **and at least one assertion on a
rendered money figure**, which is the gap the Sales review found the hard way.

## Alternatives considered

**Absolute inactivity threshold ("no visit in 14 days").** Trivial to compute and
explain, and wrong for most of the member base: it flags every monthly member
permanently and misses a daily member who has quietly stopped coming. Rejected in
brainstorming in favour of the personal baseline.

**Extending the widget catalogue instead.** Same reasoning as Sales: the two
watch-lists need their own controls and their own row rendering, and the catalogue
framework offers neither without every other segment paying for it.

**One plan instead of two.** The at-risk aggregation carries the tab's only novel
maths and roughly half its test surface. Splitting it out means Plan A ships a
complete tab on its own and Plan B's harder work gets its own review cycle rather
than riding in behind six simpler widgets.
