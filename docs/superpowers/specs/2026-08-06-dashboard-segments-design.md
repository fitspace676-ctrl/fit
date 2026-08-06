# Segmented admin dashboard — design

**Date:** 2026-08-06
**Branch:** `feat/dashboard`
**Status:** Approved for planning

## Problem

The admin dashboard is a single fixed page: a period filter, then a hard-coded
run of cards (In-Gym Now, KPI tiles, Revenue, Plan Mix, Schedule, Alerts, Recent
check-ins, Recent members) followed by whatever report sections the signed-in
user has personally pinned. Every gym sees the same layout, the card order is
frozen in JSX, and the only configurable surface — pins — is per-user, so a
gym's staff never share a view of their own numbers.

Gym owners want the dashboard organised by **business segment** (Sales, Members,
Revenue, Classes & Training, Trainers/Staff), switching between segments with a
tab, and want to choose which widgets each segment shows.

## Scope

This spec covers the **segment + widget system** and wires it to the widgets
whose data already exists. It deliberately does **not** add new API
aggregations; those land in follow-up specs, one per segment.

The full widget catalogue the owner asked for is ~27 widgets, of which ~17 need
new backend aggregations (retention rate, members-at-risk, LTV, MRR, ARPM,
outstanding invoices, projected revenue, class/trainer utilisation, shift
coverage, and others). Building the system first means each of those later
arrives as _one new report section + one catalogue entry_, with no change to the
dashboard's structure.

### In scope

- A segment catalogue defined as config in `@fit/types`, not per-page JSX.
- A widget catalogue mapping each widget to an existing report drill-down section.
- Gym-scoped (shared) widget selection, replacing the per-user pin model.
- Animated segment switching with per-widget stagger.
- An "Add Widget" picker whose tabs/filters are the segments themselves.
- Splitting `dashboard-view.tsx` (1348 lines) along the new seams.

### Out of scope

- The ~17 widgets needing new aggregations (follow-up specs).
- Drag-and-drop reordering. Order is set by the picker's list order; DnD is a
  later enhancement and nothing here forecloses it (`position` is persisted).
- Per-widget range overrides. Every widget in a segment shares the page range.
- Multi-location filtering beyond what existing sections already do.

## Key design decision: a widget is a named reference to a report section

The codebase already contains the whole pipeline a widget needs:

```
report-drilldown.service.ts  →  ReportSection            →  report-sections.tsx
(computes the aggregation)      (series | breakdown |       (ReportSectionCard
                                 split | heatmap | table)    renders any of them)
```

So the dashboard does not get its own widget renderer or its own aggregation
layer. A widget is a catalogue entry that names an existing report section and
says which segment it belongs to and how wide it renders.

This is what makes the system extensible in the way the request asked for:
adding "Members at risk" later means adding a `members-at-risk` section to the
members drill-down and one line to the catalogue. Adding a "Leads/CRM" segment
later means one entry in the segment enum. Neither restructures the dashboard.

## Architecture

### 1. Catalogue — `packages/types/src/dashboard-segments.ts` (new)

```ts
export const DASHBOARD_SEGMENTS = [
  'overview',
  'sales',
  'members',
  'revenue',
  'classes',
  'staff',
] as const;
export const dashboardSegmentSchema = z.enum(DASHBOARD_SEGMENTS);
export type DashboardSegment = z.infer<typeof dashboardSegmentSchema>;

export interface DashboardWidgetDefinition {
  /** Stable slug, `<segment>.<name>`. Persisted; never renamed in place. */
  key: string;
  segment: DashboardSegment;
  /** The drill-down section this widget renders. */
  source: { metric: ReportMetric; section: string };
  /** Grid span: `sm` = 1 col, `md` = 2, `lg` = full row. */
  size: 'sm' | 'md' | 'lg';
  /** i18n key under `admin.dashboard.widgets`. */
  labelKey: string;
}
```

`overview` carries no catalogue entries — it is the existing hand-built page
(see §6) and is not configurable.

**Spec-1 catalogue (10 widgets).** Every entry resolves to a section that
exists and returns real data today:

| Segment | Widget key                   | Source (`metric` / `section`)           |
| ------- | ---------------------------- | --------------------------------------- |
| sales   | `sales.payment-method`       | `pos` / `sales-by-method`               |
| sales   | `sales.top-products`         | `pos` / `product-sales`                 |
| sales   | `sales.top-plans`            | `revenue` / `revenue-by-plan`           |
| members | `members.new-signups`        | `members` / `new-members-over-time`     |
| members | `members.churn`              | `members` / `churn-rate-trend`          |
| revenue | `revenue.over-time`          | `revenue` / `revenue-over-time`         |
| revenue | `revenue.by-location`        | `revenue` / `revenue-by-location`       |
| classes | `classes.most-booked`        | `classes` / `most-popular-classes`      |
| classes | `classes.peak-hours`         | `attendance` / `peak-hours`             |
| staff   | `staff.sessions-per-trainer` | `staff` / `sessions-booked-per-trainer` |

**Default selection.** A gym with no stored rows shows every widget in the
segment, in catalogue order. This keeps a fresh gym's dashboard useful without a
seeding step, and makes "no rows" mean "default" rather than "empty".

Because "no rows" is read as _default_, it cannot also mean _the owner removed
everything_ — so a segment must keep at least one widget. `PUT` rejects an empty
`widgetKeys` with `400`, and the picker disables unchecking the last remaining
widget in a segment. Hiding a whole segment is segment _visibility_, a separate
feature, and is out of scope here (§Scope).

**Catalogue invariants** (enforced by unit test, see §8):

- every `key` is unique and prefixed with its own `segment`;
- every `source` names a metric in `REPORT_METRICS` and a section id listed in
  that metric's `REPORT_METRIC_DEFINITIONS.sections`;
- every non-`overview` segment has at least one widget.

The second invariant is the important one: it makes a section rename in the
reports layer fail the test suite instead of silently blanking a widget.

### 2. Data model

Replace the per-user pin with a gym-scoped widget row.

```prisma
model DashboardWidget {
  id        String   @id @default(cuid())
  gymId     String
  segment   String
  widgetKey String
  position  Int
  createdAt DateTime @default(now())

  gym Gym @relation(fields: [gymId], references: [id], onDelete: Cascade)

  @@unique([gymId, segment, widgetKey])
  @@index([gymId, segment, position])
}
```

`segment` and `widgetKey` are stored as strings, not Prisma enums: the catalogue
is the source of truth, and a row naming a key the catalogue no longer defines is
dropped at read time (same honesty rule the pins service already applies to a
stale section). That keeps adding a segment a code-only change — no migration.

**Migration** (`dashboard_widgets_replace_pins`):

1. create `DashboardWidget`;
2. backfill from `DashboardPin` — `widgetKey = metric || '.' || section`,
   mapped to its segment via the catalogue, deduplicated per `(gymId, segment,
widgetKey)`, `position` by `pinnedAt`. Pins whose section has no catalogue
   entry are skipped;
3. drop `DashboardPin`.

Backfill runs in SQL so a gym's existing pins survive the switch to shared
config rather than silently vanishing.

### 3. API — `apps/api/src/dashboard/`

| Method | Route                                        | Permission   |
| ------ | -------------------------------------------- | ------------ |
| `GET`  | `/admin/dashboard/segments/:segment?range=`  | `ReportView` |
| `PUT`  | `/admin/dashboard/segments/:segment/widgets` | `ReportView` |

Both gate on `ReportView` (OWNER + MANAGER). Editing is deliberately _not_ on
`GymManage`: that permission is OWNER-only, and a manager who can read the
numbers is expected to be able to arrange them. The config is gym-wide, so an
edit is visible to every colleague — the UI states this (§5).

`:segment` accepts the configurable segments only. `overview` is server-rendered
and has no catalogue, so `GET /admin/dashboard/segments/overview` is a `400`
rather than an empty success — a client asking for it has a bug, and an empty
`widgets: []` would hide that.

**Range vocabulary.** The two enums differ: `DashboardRange` is
`7d | 30d | 12w`, while `ReportDrilldownRange` (= `AnalyticsRange`) adds `12m`.
The dashboard's set is a strict subset, so the page's existing `?range=` is
passed straight through to the drill-down layer and no second parameter is
introduced. The dashboard does not offer `12m`; widening its range control is a
separate change, deliberately not made here, because the overview's revenue
chart parses `?range=` with `dashboardRangeSchema.catch(...)` and would silently
fall back to `7d` on a value it doesn't know — a divergence not worth opening
for one extra window.

`GET` response reuses the existing resolved-widget shape:

```ts
{
  segment: DashboardSegment;
  range: DashboardRange;
  currency: string;
  widgets: Array<{ key: string; size: 'sm' | 'md' | 'lg'; section: ReportSection }>;
}
```

**Resolution follows the existing pins service**: group the segment's widgets by
`metric`, compute each distinct metric's drill-down **once**, then pick each
section out of the computed result. A segment of 3 widgets spanning 2 metrics
costs 2 computations, not 3. A widget whose section no longer resolves is
omitted rather than rendered broken.

`PUT` body is `{ widgetKeys: string[] }` — the full desired set in display
order. The handler validates every key against the catalogue and rejects keys
belonging to another segment, then replaces that `(gym, segment)` slice in one
transaction. Whole-slice replacement (rather than add/remove deltas) makes the
picker's "apply" idempotent and removes any reorder race.

The existing `GET /admin/dashboard/pins*` routes and `dashboard-pins.service.ts`
are removed along with the reports page's pin toggles, replaced by the picker.

### 4. Segment switching and data loading

Overview renders server-side exactly as today, so first paint is unchanged. The
other segments are **lazily fetched on first activation** and cached client-side
in a `Map` keyed by `` `${segment}:${range}` ``. Re-selecting a visited segment
is instant — which is what lets the transition animate rather than sit on a
spinner. Changing the range invalidates by virtue of the composite key.

The active segment lives in the URL as `?segment=members`, alongside the
existing `?range=` / `?period=` / `?from=` / `?to=`. Back-button and shared links
work, matching how range and period already behave. An unknown or absent value
falls back to `overview`.

### 5. Client structure — `apps/admin/app/(dashboard)/`

```
page.tsx                     server page: session gate, ?segment= parse, overview fetch
overview/
  overview-view.tsx          today's DashboardView body, unchanged behaviour
  in-gym-now.tsx             ┐
  kpi-cards.tsx              │ extracted from dashboard-view.tsx
  revenue-card.tsx           │ (In-Gym Now, KPI/Stat/Delta, Revenue, Plan Mix,
  plan-mix-card.tsx          │  Schedule, Alerts, Recent check-ins/members)
  schedule-card.tsx          │
  alerts-card.tsx            │
  recent-cards.tsx           ┘
segments/
  segment-tabs.tsx           the tab bar
  segment-panel.tsx          fetch + cache + enter/exit animation
  widget-grid.tsx            size → grid span, renders ReportSectionCard
  add-widget-dialog.tsx      picker; segments are its tabs/filters
charts.tsx                   unchanged
```

This is what retires the 1348-line `dashboard-view.tsx`: its cards move to
`overview/` as focused files, and nothing new is added to it.

Widget bodies use the **existing** `ReportSectionCard` from
`reports/report-sections.tsx` — no second renderer, no divergence in how a
series or heatmap looks between Reports and the dashboard.

**Add Widget dialog.** Astryx `Overlay`; the segment list is the dialog's tab
bar, each tab listing that segment's catalogue widgets with a checkbox and the
widget's current state. Applying issues one `PUT` for each changed segment. The
dialog carries a plain line stating the layout is shared with everyone at the
gym, so an edit is never a surprise to a colleague.

**Tabs.** The tab bar is built in the dashboard, not taken from `@fit/ui-web`'s
`Tabs`: that primitive is Tailwind-classed, and the dashboard is on the
guardrail's migrated (Tailwind-free) list. It follows the same WAI-ARIA pattern
`Tabs` implements — `role="tablist"`, roving `tabindex`, arrow/Home/End keys,
automatic activation — restyled in StyleX.

**Naming.** The Astryx `SegmentedControl` already used for the _period_ filter
is unrelated. Code here uses `WidgetSegment` / `DashboardSegment` throughout to
keep the two apart.

### 6. Animation

StyleX keyframes, no new dependency:

| Phase            | Property                                         | Duration |
| ---------------- | ------------------------------------------------ | -------- |
| outgoing panel   | `opacity 1→0`, `translateY 0→-4px`               | 120ms    |
| incoming widget  | `opacity 0→1`, `translateY 6px→0`                | 220ms    |
| stagger per card | `animation-delay: index × 40ms`, capped at 240ms | —        |

The panel holds its previous height (`min-height`) across the swap so the page
doesn't jump while the new grid mounts. Only `opacity` and `transform` are
animated — both compositor properties, so the cascade stays smooth on a long
grid.

`@media (prefers-reduced-motion: reduce)` drops the transform and the stagger,
leaving a plain opacity fade. Motion is decoration here; it never gates content.

The stagger index is passed as a StyleX dynamic style (a style function taking
the index), which is how StyleX handles per-instance values without inline
`style` attributes.

### 7. Error and empty states

Failure is per-segment, never page-wide — the same degradation rule the current
page applies to pinned widgets:

- **Segment fetch fails** → that panel shows an inline retry; the tabs, the
  overview, and every other segment stay usable.
- **Section returns no rows** → `ReportSectionCard`'s existing empty state. An
  empty window is an honest "no data yet", not a fabricated zero.
- **Widget key not in catalogue** (stale row) → omitted from the response.
- **Gym has no rows for a segment** → the full catalogue default (§1), not an
  empty page.

### 8. Testing

**`packages/types`** — catalogue invariants (§1). Unique keys, key/segment
prefix agreement, every `source` resolvable against
`REPORT_METRIC_DEFINITIONS`, every non-overview segment non-empty.

**`apps/api`** —

- segment resolution: correct sections returned; each distinct metric computed
  exactly once for a multi-widget segment; unresolvable section omitted;
- default-when-empty returns the full catalogue for that segment;
- `GET` on `overview` is a 400, not an empty success;
- `PUT` validates keys, rejects cross-segment keys, rejects an empty
  `widgetKeys`, replaces the slice transactionally, persists order;
- permission: `ReportView` passes for OWNER and MANAGER, a role without it gets
  403 on both routes;
- tenant scoping: a gym never reads or writes another gym's rows.

**`apps/admin`** —

- tab bar keyboard interaction (arrows, Home/End, roving tabindex);
- panel caches a visited segment and does not refetch;
- picker apply issues the expected `PUT` payload;
- picker disables unchecking a segment's last remaining widget.

**`apps/e2e`** — switch segment and see its widgets render; add a widget through
the picker, reload, and see it persist.

**Guardrail** — every new file under `apps/admin/app/(dashboard)/` is inside an
already-guarded path, so `check-tailwind-guardrail.ts` covers it with no
manifest change. New files must be StyleX-only.

## Consequences

- Per-user pinning is gone. Every colleague at a gym sees one dashboard. This
  was the explicit choice; existing pins are migrated rather than dropped, but a
  user who had pinned something privately will now find it shared.
- Reports' "Pin to Dashboard" control is replaced by the dashboard's own picker.
  Curation moves to the surface being curated.
- The first visit to each segment costs a fetch. Overview is unaffected.
- The follow-up specs (one per segment) add sections to the drill-down service
  and entries to the catalogue. Neither touches the dashboard's structure —
  which is the point of building the system first.
