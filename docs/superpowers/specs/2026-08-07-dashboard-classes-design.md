# Dashboard Classes tab — demand, attendance and the empty seat — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for planning
**Follows:** [`2026-08-07-dashboard-revenue-design.md`](./2026-08-07-dashboard-revenue-design.md)

## Problem

The Classes tab is the generic widget grid: two `ReportSectionCard`s from the
Reports drill-down catalogue (`classes.most-booked`, `classes.peak-hours`). One
ranks class titles by seats booked; the other is a check-in heatmap that belongs
to the attendance report and describes gym traffic rather than class demand.

Neither answers the question a timetable is actually run on: **which hours of
which classes are worth staffing.** A gym commits a trainer and a room to every
occurrence whether or not anyone books it, so the expensive number is the empty
seat — and nothing on the dashboard computes it, even though
`ClassInstance.bookedCount` and the three capacity columns behind it have been
there since T5.1.

Alongside it, three more figures exist in the schema and nowhere on screen:

- **Did the booked seats show up?** `Booking.status` carries
  `ATTENDED` / `NO_SHOW`; only the drill-down reads them.
- **Is PT growing?** `PtSession` rows carry the whole calendar; nothing trends
  them.
- **When is demand?** Class start times give the real hour-by-weekday shape of
  the timetable; the tab currently shows check-ins instead, which include every
  member who came for the gym floor.

## Scope

One implementation plan. The tab stands alone as complete on delivery.

### Delivered

- A hand-built `ClassesView` replacing the widget grid for the `classes` tab, on
  the Overview's grid (main column + sticky rail), exactly as Sales, Members and
  Revenue.
- A four-tile KPI strip: classes held, seats booked, no-show rate, utilization.
- Four trends: bookings, attendance rate, utilization, PT sessions.
- Two snapshots: the ranked class-type list, and a weekday × hour demand heatmap.
- One tab-wide granularity control (daily / weekly / monthly).
- Removing `classes` from the configurable segments and its two catalogue
  entries.

### Out of scope

- **Design-token changes.** Existing `var(--color-*)` / `var(--font-family-*)`
  values only.
- **Schema migrations.** Every figure derives from existing columns.
- **Retiring the widget grid.** `staff` keeps the picker and the catalogue. That
  the picker is down to one segment is noted, not acted on — see "Follow-up".
- **The Reports drill-down.** `classes` and `attendance` keep every section they
  have. This tab does not refactor them and does not import from them.
- **Per-trainer breakdown.** Whose classes fill and whose do not is the Staff
  tab's question, and it still has a catalogue to answer it with.
- **Acting on what the tab surfaces.** Rescheduling a dead hour, or chasing a
  member who no-showed, happens in the schedule and member screens.

## Known data limits

Stated up front because they shape the contract, and because this codebase's rule
is that a figure is a real aggregation or an explicit empty state.

**Attendance is only as true as the marking.** A past class whose bookings were
never marked leaves them `BOOKED` — neither attended nor a no-show. Counting an
unmarked booking as attended would flatter the rate; counting it as a no-show
would invent a problem. Both are therefore excluded from the rate, and the tab
reports `markedCoverage` — the share of finished, uncancelled bookings that
carry an outcome — under the attendance card. A gym marking nothing sees a
coverage of 0% beside an attendance rate it can then discount, rather than a
confident number built on three bookings.

**Attendance and no-show are the same number.** With `ATTENDED + NO_SHOW` as the
denominator, `noShowRate = 100 − attendanceRate` by construction. Plotting both
would draw one chart and its mirror image, so the tab trends attendance and
reports no-show as a tile. This is a presentation decision recorded here so a
later reader does not "fix" the missing second line.

**Capacity is a three-step fallback and can be zero.** An occurrence's seats are
`capacityOverride ?? template.capacity ?? classType.capacity`, and a row whose
template and type are both gone (`SetNull`) has none. A bucket with no resolvable
capacity emits `null` utilization, never `0` — 0% utilization is the claim "every
seat went empty", which is a different and alarming statement from "there was
nothing to fill".

**A cancelled occurrence is not an empty room.** `InstanceStatus.CANCELED` rows
leave both the numerator and the denominator of utilization: the trainer and the
room were released, so the committed cost the metric exists to expose was never
committed. They also leave `classesHeld`.

**A waitlist entry holds no seat.** `WAITLIST` bookings are excluded from the
bookings trend, the heatmap and the class-type ranking. They are demand the gym
could not serve — a real and interesting figure, and one this tab does not claim
to show.

**The heatmap is UTC, like every other bucket in this dashboard.** Weekday and
hour come from the occurrence's `startsAt` read in UTC. For a Tbilisi gym (UTC+4)
that shifts the grid against local wall-clock time. The whole reporting layer
shares this limitation — `report-window.util` is UTC throughout — so fixing it
belongs to a gym-timezone change across all of Reports, not to this tab.

## Metric definitions

Percentages are 0–100 rounded to one decimal, via the existing `rate()` helper.
Counts are integers. The tab carries no money and therefore no currency.

### Bookings over time

`Booking` rows whose occurrence starts in the window, bucketed by
`classInstance.startsAt` (not by when the booking was made — the question is when
the demand lands, not when it was expressed). `CANCELED` and `WAITLIST` are
excluded; `BOOKED`, `ATTENDED` and `NO_SHOW` all count, because each held a seat.
Dense: a bucket with no bookings is a real zero.

### Attendance rate over time

Per bucket, `ATTENDED ÷ (ATTENDED + NO_SHOW)` over the same window. A bucket with
no marked bookings emits `null`, and the chart leaves a gap rather than drawing a
line through a number nobody measured — the same rule the Members tab's retention
trend uses.

`kpis.noShowRate` is the window-wide complement, `null` under the same condition.

### Utilization over time

Per bucket, `Σ seats booked ÷ Σ capacity` over the occurrences starting in it,
excluding `CANCELED` ones. `null` where the summed capacity is zero.

"Seats booked" is the same count the bookings trend uses — `Booking` rows that
held a seat — and **not** `ClassInstance.bookedCount`. The denormalised counter is
what the drill-down's fill rate reads, and it is maintained atomically, but it is
still a second answer to a question this tab already holds the rows for. One
source for every seat figure on the tab is worth more here than agreeing with a
different surface's shortcut: an owner comparing the utilization card against the
bookings chart beside it must never find two numbers.

### PT sessions over time

`PtSession` rows starting in the window, excluding `CANCELED`, bucketed by
`startsAt`. Dense.

### Most booked class types

Occurrences grouped by `template.title ?? classType.name ?? 'Class'` — the same
naming fallback `report-drilldown.service.ts` uses, so a class is called the same
thing on both surfaces. Each row carries seats booked, sessions held, and its own
utilization. Ranked by seats booked, **capped at eight rows**, and the card's
caption says so rather than letting a ninth class type vanish silently.

### Demand by hour

A 7 × 24 grid of seat counts: rows Monday–Sunday, columns hour 0–23 (UTC), cells
counting the same bookings as the bookings trend, keyed by their occurrence's
`startsAt`.

The API sends `cells` only. Weekday names are i18n keys resolved client-side, so
the contract stays locale-free like every sibling — the Reports drill-down sends
English `rowLabels` on the wire and this deliberately does not copy that.

### Marked coverage

`(ATTENDED + NO_SHOW) ÷ (bookings on occurrences that have ENDED, excluding
`CANCELED`and`WAITLIST`)`. `null` when no occurrence in the window has finished
— a tab opened on a week of future classes has nothing to have marked, which is
not 0% coverage.

## Architecture

### 1. Contract — `packages/types/src/dashboard-classes.ts` (new)

```ts
export const classesGranularitySchema = salesGranularitySchema;
export const DEFAULT_CLASSES_GRANULARITY: ClassesGranularity = 'daily';

export const dashboardClassesQuerySchema = z.object({
  granularity: classesGranularitySchema.catch(DEFAULT_CLASSES_GRANULARITY),
});

/** One bucket of a percentage trend. `null` — nothing to measure, not 0%. */
export const classesRatePointSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
});

export const classTypeSliceSchema = z.object({
  name: z.string(),
  seatsBooked: z.number(),
  sessions: z.number(),
  utilizationRate: z.number().nullable(),
});

export const classesKpisSchema = z.object({
  classesHeld: z.number(),
  seatsBooked: z.number(),
  noShowRate: z.number().nullable(),
  utilizationRate: z.number().nullable(),
});

export const dashboardClassesResponseSchema = z.object({
  granularity: classesGranularitySchema,
  kpis: classesKpisSchema,
  bookingsOverTime: z.array(reportSeriesPointSchema),
  attendanceOverTime: z.array(classesRatePointSchema),
  utilizationOverTime: z.array(classesRatePointSchema),
  ptSessionsOverTime: z.array(reportSeriesPointSchema),
  topClassTypes: z.array(classTypeSliceSchema),
  /** 7 rows (Mon–Sun) x 24 hours (UTC), seats booked. */
  demandByHour: z.array(z.array(z.number())),
  /** Share of finished bookings carrying an outcome; `null` — nothing finished. */
  markedCoverage: z.number().nullable(),
});
```

### 2. API — `apps/api/src/dashboard/dashboard-classes.service.ts` (new)

One `get(query)` over three reads: occurrences in the window (with capacity,
`bookedCount`, status, `startsAt`, `endsAt`, and the title fallback), their
bookings (status + the occurrence's `startsAt`/`endsAt`), and PT sessions.

Runs on `TenantPrismaService`. No `gymId` is passed or trusted.

Wired into `dashboard.controller.ts` as `@Get('classes')`, gated on
`Permission.ReportView`, query parsed with `dashboardClassesQuerySchema`
(`.catch`, so a hand-edited URL lands on the default rather than a 400).

### 3. Admin UI — `apps/admin/app/(dashboard)/class-insights/` (new)

Named `class-insights` because `(dashboard)/classes` is a real route — the
timetable screen — and this folder holds a tab's components, not a route segment.
Same reasoning as `member-retention/` and `revenue-insights/`.

| File                       | Job                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `actions.ts`               | `loadClassesAction` — re-asserts `ReportView`, re-parses, resolves failures                      |
| `classes-view.tsx`         | The tab: the granularity control, fetch/cache/retry keyed on it, settle cascade, error-as-banner |
| `classes-kpi-strip.tsx`    | Four tiles; the two rates render `—` when `null`                                                 |
| `bookings-trend-card.tsx`  | Bookings trend; owns the granularity control                                                     |
| `attendance-rate-card.tsx` | Attendance trend + the coverage note + the gap note                                              |
| `utilization-card.tsx`     | Utilization trend                                                                                |
| `pt-sessions-card.tsx`     | PT trend (rail, compact)                                                                         |
| `top-class-types-card.tsx` | Ranked list (rail)                                                                               |
| `demand-heatmap-card.tsx`  | 7 × 24 heatmap, weekday labels from i18n                                                         |

`lib/api.ts` gains `fetchDashboardClasses`, `cache: 'no-store'`.

### 4. Shell changes

- `HAND_BUILT_SEGMENTS` becomes
  `['overview', 'sales', 'members', 'revenue', 'classes']`;
  `CONFIGURABLE_DASHBOARD_SEGMENTS` becomes `['staff']`.
- The two `classes.*` catalogue entries and their i18n labels go.
- `segmented-dashboard.tsx` mounts `<ClassesView />`. No change to
  `configurableSegment` or `dashboard-header.tsx` — both branch on
  `isHandBuiltSegment`.
- Tests using `classes` as their configurable exemplar move to `staff`.

## Data flow

```
ClassesView (client)
  │  granularity  (local state, cached per value)
  ▼
loadClassesAction  ── ReportView re-check, query re-parse
  ▼
GET /dashboard/classes?granularity=
  ▼
DashboardClassesService.get
  ├─ classInstance.findMany  (window, + capacity fallback + bookedCount)
  ├─ booking.findMany        (window, via classInstance.startsAt)
  └─ ptSession.findMany      (window, non-cancelled)
  ▼
DashboardClassesResponse  ── one payload, every card from the same instant
```

## Error handling

Identical to Sales, Members and Revenue: a failed first load renders the alert as
the tab with a Retry; a failure with data already on screen renders a banner above
figures that stay usable; Retry drops only its own cache entry; the client
`.catch`es the action call itself, or a dropped connection leaves a permanent
skeleton.

## Testing

**`packages/types/src/dashboard-classes.spec.ts`**

- Query defaults: an unknown `granularity` lands on the default.
- Response round-trips; a `null` rate parses and stays distinct from `0`.

**`apps/api/src/dashboard/dashboard-classes.service.spec.ts`**

- Capacity resolves override → template → type, and a row with none contributes
  nothing to the denominator.
- A `CANCELED` occurrence leaves utilization and `classesHeld` entirely.
- `WAITLIST` and `CANCELED` bookings leave the bookings trend, the heatmap and
  the ranking; `BOOKED` / `ATTENDED` / `NO_SHOW` all count.
- Attendance is `null`, not `0`, in a bucket with no marked bookings.
- Utilization is `null`, not `0`, where summed capacity is zero.
- `markedCoverage` counts only occurrences that have ended, and is `null` when
  none has.
- The heatmap is 7 × 24, and an occurrence lands in its UTC weekday and hour.
- PT sessions exclude `CANCELED` and bucket by `startsAt`.
- The class-type ranking sorts by seats booked and caps at eight.
- Dense zero-fill: an empty window emits every bucket at `0` / `null`.

**`apps/admin/app/(dashboard)/class-insights/classes-view.test.tsx`**

- Changing granularity refetches; returning to a visited value does not.
- First-load failure renders the alert; a later failure renders the banner with
  the previous figures still on screen.
- A `null` rate renders as `—`, not `0%`.
- The heatmap renders localised weekday labels.

**Shell regressions** — `segmented-dashboard.test.tsx` gains a "renders the
hand-built classes view" case; `dashboard-header.test.tsx` extends its hand-built
table to `classes`; the picker and panel tests move their exemplar to `staff`.

## Follow-up (not this plan)

With `classes` promoted, the widget picker configures exactly one segment. The
machinery behind it — the catalogue, `/admin/dashboard/segments`, the picker
dialog, the panel, the `DashboardWidget` table — now serves a single tab. Either
`staff` becomes hand-built too and all of it is retired, or the grid earns its
keep by gaining segments. That is a decision to take deliberately, and this spec
records it rather than pre-empting it.

## Alternatives considered

**Build the heatmap from `CheckIn` rows.** Rejected: check-ins include every
member who came for the gym floor, so the grid would describe building traffic
rather than class demand — and `/reports/attendance` already draws exactly that
heatmap. Two surfaces showing the same picture under different titles is worse
than one.

**Trend attendance and no-show as two lines.** Rejected: under a shared
denominator they are one line and its mirror. See "Known data limits".

**Count unmarked bookings as attended.** Rejected: it makes the attendance rate a
function of staff diligence rather than member behaviour, and it fails silently —
the number looks best exactly when the data is worst.

**Utilization from `ATTENDED` rather than `bookedCount`.** Rejected per the
brainstorm: the metric exists to expose committed cost against demand, and a
booked seat is demand the gym was paid (or entitled) to serve. Whether that
member then turned up is what the attendance trend is for.
