# Dashboard overview redesign + segment shell completion — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for planning
**Follows:** [`2026-08-06-dashboard-segments-design.md`](./2026-08-06-dashboard-segments-design.md)

## Problem

Two problems, entangled enough that fixing either alone means touching the same
files twice.

**1. The segment shell is not finished.** The segmented dashboard from the
preceding spec landed and works — tabs, lazy panels, per-segment caching, the
widget picker — but four things it promised are missing:

- The page header (`<h1>`, subtitle, period filter, date-range input) lives
  inside `overview-view.tsx`. `segmented-dashboard.tsx` renders `OverviewView`
  only when `active === 'overview'`, so **every other tab has no title and no
  date filter** — while `?range=` still silently drives what those panels fetch
  (`segment-panel.tsx` calls `loadSegmentAction(shown, range)`). The user cannot
  change the window that governs what they are looking at.
- The tab bar sets `role="tablist"` / `role="tab"` but no `id` or
  `aria-controls`, and no element carries `role="tabpanel"`. The preceding spec
  said the bar "follows the same WAI-ARIA pattern `Tabs` implements"; the
  tab↔panel half of that pattern was never wired.
- `segmented-dashboard.tsx` — which holds the most delicate logic on the screen
  (URL parsing, keeping the last segment mounted, remount-on-save) — has no
  test, while all three of its siblings do.
- Its header comment promises the back button returns to the previous segment.
  It uses `router.replace`, which does not. (`replace` is the correct choice —
  it matches `overview-view.tsx` — so the comment is what is wrong.)

**2. The overview itself reads as dated and wastes the screen.** It is seven
stacked sections holding sixteen cards of identical visual weight. Nothing
tells the eye where to start. Nine KPI numbers are split across two different
card components in two separate rows, and the split is not meaningful: the
second row mixes `revenueThisMonth` (which carries a period-over-period delta)
in with five plain standing counts, then puts those six cards into a
three-column grid. On a wide monitor the content is a single tall column of
full-width bands.

## Scope

### In scope

- Moving the page header out of `OverviewView` into the segment shell, with a
  **context-appropriate filter** per tab.
- Rebuilding the overview's layout: a metric strip plus an asymmetric two-column
  work area with a sticky rail.
- A visual pass over the dashboard's own files — type treatment, card chrome,
  spacing rhythm, numeral alignment.
- The three remaining shell gaps: ARIA tab↔panel wiring, a test for
  `segmented-dashboard.tsx`, the misleading comment.

### Out of scope

- **Design-token changes.** Everything uses the existing
  `var(--color-*)` / `var(--font-family-*)` values. `@fit/astryx-theme` is not
  touched, so no other console screen changes appearance.
- **New data.** No new API calls, no new aggregations, no schema changes. Every
  number rendered today is rendered after this change.
- The segment panels' internals (`segment-panel.tsx`, `widget-grid.tsx`,
  `add-widget-dialog.tsx`). They are working; only the panel's ARIA wrapper
  changes.
- Widening `?range=` to `12m`, explicitly deferred by the preceding spec.

## 1. The filter split

This is the decision the rest of the design rests on.

`packages/types/src/dashboard.ts` defines two independent enums:

| Param    | Values                             | Governs                                                                   |
| -------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `period` | `today \| week \| month \| custom` | The overview's KPI numbers                                                |
| `range`  | `7d \| 30d \| 12w`                 | The revenue chart **and**, since the preceding spec, every segment widget |

The types file still describes `range` as shaping "only the revenue chart". That
stopped being true when segment panels began keying their fetches on it, and the
control was left behind inside `RevenueCard` — a component that renders only on
the overview tab. Hence the dead-parameter bug.

**The header shows whichever filter affects what is on screen:**

- **Overview tab** → the `period` filter. `?range=` keeps its toggle inside
  `RevenueCard`, where it is genuinely chart-local and sits next to the chart it
  changes.
- **Segment tab** → the `range` filter. `period` is not shown, because nothing
  on a segment tab reads it.

The alternative — both filters always visible — was rejected: on the overview it
would separate the range control from the only thing it changes, and on segment
tabs it would present a period filter that does nothing.

## 2. Components

Two new files, one rewritten, one merged pair.

| File                                        | Responsibility                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(dashboard)/dashboard-header.tsx` **new**  | `<h1>`, subtitle, and the context-appropriate filter. The only writer of `?period=` / `?from=` / `?to=`, and of `?range=` on segment tabs — `RevenueCard` keeps its own Overview `?range=` toggle (see §1). |
| `overview/metric-strip.tsx` **new**         | All nine numbers in one bordered container, two tiers (see §3). Absorbs `DeltaChip` from `kpi-cards.tsx` unchanged.                                                                                         |
| `overview/overview-view.tsx` **rewritten**  | Header removed; strip plus the two-column work area. ~280 lines → ~130.                                                                                                                                     |
| `overview/recent-activity-card.tsx` **new** | `RecentCheckInsCard` + `RecentMembersCard` behind a small tab switch. Two full-width cards → one rail card.                                                                                                 |
| `overview/kpi-cards.tsx` **deleted**        | Superseded by the strip.                                                                                                                                                                                    |

**Deleting `kpi-cards.tsx` is safe.** Its `KpiCard` / `StatKpiCard` exports are
imported by `overview-view.tsx` and nothing else in the console.
`locations/locations-board.tsx` defines its own local `KpiCard`, and
`(dashboard)/kpi-card.tsx` is a separate, Tailwind-classed component with no
importers — neither is affected.

`SegmentedDashboard` already receives `overview` in full, so the header needs no
new plumbing through `page.tsx`: it takes `period={overview.period}` (the
server-resolved `{period, from, to}`) and the `range` already passed in.

Surface count: **16 → 7**. Before: `InGymNow`, three KPI cards, six secondary KPI
cards, `RevenueCard`, `PlanMixCard`, `ScheduleCard`, `AlertsCard`,
`RecentCheckInsCard`, `RecentMembersCard`. After: the strip, `RevenueCard`,
`ScheduleCard`, `PlanMixCard`, `InGymNow`, `AlertsCard`, `RecentActivityCard`.

## 3. Layout

```
┌──────────────────────────────────────────────────────────┐
│  Title + subtitle                      [ period filter ] │  ← dashboard-header
├──────────────────────────────────────────────────────────┤
│  Overview │ Sales │ Members │ Revenue │ Classes │ Staff   │  ← segment-tabs
├──────────────────────────────────────────────────────────┤
│ revenue ▲ │ check-ins ▲ │ new ▼ │ this month ▲          │  ← strip, tier 1
│ active │ overdue │ classes │ expiring │ renewals        │  ← strip, tier 2
├────────────────────────────────────┬─────────────────────┤
│  Revenue (chart + range toggle)    │  ● In the gym now   │
│  Today's schedule                  │  Alerts             │
│  Plan mix                          │  Recent activity    │
│                                    │  ↑ sticky ≥1280px   │
└────────────────────────────────────┴─────────────────────┘
```

| Block         | <768px  | ≥768px  | ≥1024px                      | ≥1280px            |
| ------------- | ------- | ------- | ---------------------------- | ------------------ |
| Strip, tier 1 | 2 cols  | 4 cols  | 4 cols                       | 4 cols             |
| Strip, tier 2 | 2 cols  | 3 cols  | 5 cols                       | 5 cols             |
| Work area     | 1 col   | 1 col   | `2.2fr / minmax(280px, 1fr)` | same               |
| Right rail    | in flow | in flow | in flow                      | `position: sticky` |

**Why two tiers rather than one row of nine.** Nine is an awkward number to
grid — nine-across gives each cell ~110px at 1280px, too narrow for the longer
Georgian labels, and any other single-row count leaves a ragged tail. But the
nine metrics are not homogeneous in the first place: exactly four carry a
period-over-period delta (`todaysRevenue`, `checkInsToday`, `newMembers7d`,
`revenueThisMonth`) and five are standing counts with no baseline. Splitting on
that line grids cleanly (4 and 5) _and_ is the hierarchy the redesign is for —
unlike today's split, which puts a delta-bearing metric in with the counts.

Both tiers live in **one** bordered container, separated by a single hairline.
Tier 1 uses the larger numeral; tier 2 is smaller and muted.

`RevenueCard` and `ScheduleCard` lose their own
`gridColumn: { '@media (min-width: 1024px)': 'span 2' }`. Width becomes the
parent grid's business — a child should not hold an opinion about how many
columns of its parent it occupies. This also removes the ragged row where five
secondary KPI cards sat in a three-column grid.

## 4. Visual pass

The single biggest contributor to the dated feel is one type treatment repeated
on every card heading — `textTransform: uppercase` with
`letterSpacing: 0.15em` at `fontWeight: 700` (`revenue-card.tsx`'s
`sectionLabel`, copied into the sibling cards).

| Element      | Now                                   | After                                                |
| ------------ | ------------------------------------- | ---------------------------------------------------- |
| Card heading | uppercase, `.15em` tracking, 700      | sentence case, `600`, `0.8125rem`, neutral tracking  |
| KPI chrome   | 9 cards, each `minHeight: 13rem`      | 1 container, hairline dividers, no per-metric height |
| Icon tiles   | 2.75rem accent tile on every KPI card | dropped — nine identical tiles carry no information  |
| Spacing      | `1rem`/`1.5rem` everywhere            | 1.5rem between blocks, 1rem within a column          |
| Colour       | —                                     | unchanged                                            |

**What is _not_ changing, contrary to first impressions.** Two things already
work and are carried over verbatim rather than reinvented:

- **Delta colour already exists.** `DeltaChip` (`kpi-cards.tsx`) renders an
  Astryx `Badge` with `variant="success" | "error"`, plus a `noPriorData`
  fallback when `deltaPct` is `null`. It moves into `metric-strip.tsx` unchanged.
- **Numerals are already tabular.** KPI values render through Astryx `Text` with
  `hasTabularNumbers`. The strip keeps that; no numeral change is claimed.

**Four of the nine metrics have a delta, not three.** `todaysRevenue`,
`checkInsToday`, `newMembers7d` **and `revenueThisMonth`** are `DashboardKpi`
(value + `deltaPct`). The remaining five — `activeMembers`, `overduePayments`,
`classesToday`, `expiringSoon`, `renewalsDue` — are plain integers that today use
`StatKpiCard`, which deliberately shows a static `hint` rather than a fabricated
trend. `revenueThisMonth` currently sits in the secondary row despite being a
full KPI; the two-tier strip is what puts it back with its own kind.

## 5. ARIA

One panel, not two:

```tsx
// segment-tabs.tsx
<button id={`dashboard-tab-${segment}`} aria-controls="dashboard-tabpanel" … />

// segmented-dashboard.tsx
<div id="dashboard-tabpanel" role="tabpanel"
     aria-labelledby={`dashboard-tab-${active}`}>
  {active === 'overview' ? <OverviewView … /> : null}
  {lastSegment !== null ? <div hidden={active === 'overview'}>…</div> : null}
</div>
```

Both contents live in a single panel whose label follows the active tab. This
preserves the existing trick of keeping the last segment mounted-but-hidden so
its fetch cache survives a trip through Overview — the `hidden` attribute hides
it from assistive technology too.

**No `tabIndex={0}` on the panel.** The APG calls for it only when a panel has
no focusable descendants; these panels are full of buttons, charts and links, so
adding one would insert a tab stop that only gets in the way.

## 6. Error handling

Unchanged. `page.tsx` keeps its early return to `WelcomeFallback` when the
overview fetch throws `ApiError` — so a failed overview still shows neither
header nor tabs, exactly as today. `SegmentPanel`'s retry and its per-segment
cache-bypass are untouched.

## 7. Testing

`app/(dashboard)` currently has five test files and **none of them cover the
overview**, so there is nothing to update — only new coverage.

| File                             | Asserts                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segmented-dashboard.test.tsx`   | invalid `?segment=` falls back to the default; the last segment stays mounted and `hidden` across a trip through Overview; `aria-labelledby` tracks the active tab; saving bumps the key and remounts the panel                                       |
| `dashboard-header.test.tsx`      | overview renders the period control and writes `?period=`; a segment tab renders the range control and writes `?range=`; a custom range writes `from`/`to`, and selecting a preset clears them                                                        |
| `metric-strip.test.tsx`          | all nine metrics render across the two tiers; the four delta-bearing metrics colour by sign and fall back to `noPriorData` when `deltaPct` is `null`; the five count metrics show their hint or nothing, never a delta; a genuine zero renders as `0` |
| `recent-activity-card.test.tsx`  | the tab switch moves between check-ins and members                                                                                                                                                                                                    |
| `segment-tabs.test.tsx` (extend) | each tab carries `id` and `aria-controls` matching the panel                                                                                                                                                                                          |

`segment-panel.test.tsx` needs no change — the panel's own logic is untouched.

## 8. Risks

- **Sticky rail overlap.** A sticky rail must clear the console's fixed
  chrome. `top` is expressed against the same offset the layout already uses for
  its header, and the rail falls back to normal flow below 1280px.
- **Strip density in Georgian.** The widest tier-2 cell at ≥1024px is a fifth of
  the strip. `secondaryKpi.overduePayments` is "ვადაგადაცილებული გადახდები" — by
  some margin the longest label in either locale. Labels wrap to two lines rather
  than truncate; if that still overflows, the fallback is 3 columns at ≥1024px,
  never a smaller type size.
