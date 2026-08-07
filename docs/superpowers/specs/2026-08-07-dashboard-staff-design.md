# Dashboard Staff tab — delivery, capacity and the standing rota — design

**Date:** 2026-08-07
**Branch:** `feat/dashboard`
**Status:** Approved for planning
**Follows:** [`2026-08-07-dashboard-classes-design.md`](./2026-08-07-dashboard-classes-design.md)

## Problem

The Staff tab is the last widget grid, and it holds one widget:
`staff.sessions-per-trainer`, a ranked list of class counts from the Reports
drill-down. It answers "who taught the most classes" and nothing else.

The question a gym actually staffs against is capacity: **is the time we are
paying for being delivered.** Three columns carry the answer and nothing reads
them:

- **`Trainer.availability`** — a validated weekly JSON of the hours each trainer
  can teach. It is edited from the console and never compared against anything.
- **`PtSession`** — the one-to-one calendar. The drill-down counts classes only,
  so a trainer whose week is entirely PT reads as idle.
- **`ShiftSlot`** — the staff rota, one row per weekly shift, backing the Staff
  detail screen's calendar tab and nothing else.

## Scope

One implementation plan, delivering two things that cannot be separated — see
"Why the widget grid goes" below.

### Delivered

- A hand-built `StaffView` replacing the widget grid for the `staff` tab.
- A four-tile KPI strip: trainers delivering, sessions delivered, average trainer
  utilization, scheduled hours per week.
- One trend: sessions delivered, split classes against PT.
- Four snapshots: utilization per trainer, sessions per trainer, shift coverage by
  weekday, and the gaps card.
- One tab-wide granularity control (daily / weekly / monthly).
- **Retiring the configurable widget grid entirely** — the catalogue, the picker,
  the panel, the segments API and their contracts.

### Out of scope

- **Dropping the `DashboardWidget` table.** The rows become orphaned the moment
  the segments API goes. Deleting them is a destructive, irreversible migration
  and is deliberately a separate, deliberate decision — recorded in "Follow-up".
- **Joining trainers to staff accounts.** See "Known data limits".
- **Schema migrations, design tokens, the Reports drill-down.** As every sibling
  tab: none, none, untouched. `/reports/staff` keeps its `sessions-booked-per-trainer`
  section.
- **Payroll or cost.** Utilization is hours against hours. What an hour costs is
  not in the schema.

## Why the widget grid goes

`staff` is the last configurable segment. Promoting it leaves
`CONFIGURABLE_DASHBOARD_SEGMENTS` empty, and an empty list is not expressible:
`z.enum([])` has no valid type, so `configurableDashboardSegmentSchema` and every
contract built on it stop compiling. The retirement is not a judgement call
bundled into this work — it is what promoting the last segment MEANS.

Removed:

| Layer        | Gone                                                                                                                                                                                                                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@fit/types` | `CONFIGURABLE_DASHBOARD_SEGMENTS`, `configurableDashboardSegmentSchema`, `DASHBOARD_WIDGET_CATALOG`, `DashboardWidgetDefinition`, `widgetsForSegment`, `findDashboardWidget`, `setDashboardWidgetsSchema`, `resolvedDashboardWidgetSchema`, `dashboardSegmentResponseSchema`, `dashboardWidgetSizeSchema`, `isHandBuiltSegment`, `HAND_BUILT_SEGMENTS` |
| API          | `dashboard-segments.controller.ts`, `dashboard-segments.service.ts` + specs; the `/admin/dashboard/segments` routes                                                                                                                                                                                                                                    |
| Admin        | `segments/segment-panel.tsx`, `add-widget-dialog.tsx`, `widget-grid.tsx`, `actions.ts`, their tests; `fetchDashboardSegment` / `saveDashboardSegmentWidgets` in `lib/api.ts`                                                                                                                                                                           |
| i18n         | `admin.dashboard.widgets`, `admin.dashboard.picker`, `admin.dashboard.segments.loadError` / `retry` / `empty`                                                                                                                                                                                                                                          |

Kept: `DASHBOARD_SEGMENTS`, `dashboardSegmentSchema`, `DEFAULT_DASHBOARD_SEGMENT`,
`segment-tabs.tsx`, `use-roving-tablist.ts`, `segmented-dashboard.tsx`. The tab bar
and the URL contract are unaffected — every tab simply renders its own view now.

`isHandBuiltSegment` goes with the rest: it existed to sort tabs into two kinds,
and there is only one kind left. `segmented-dashboard.tsx` loses
`configurableSegment`, `lastSegment`, `savedAt`, `selections` and the picker slot.

`dashboard-header.tsx` loses its RANGE CONTROL — the branch that rendered a
`?range=` picker for a segment tab, whose only consumer was the widget panel. Every
hand-built tab owns its own time control, so the header is left with the period
control on Overview and nothing on the other five.

**`?range=` itself stays live.** It is not the panel's param: the Overview's
`RevenueCard` writes it (`overview-view.tsx`'s `selectRange`) and the server reads
it in `fetchDashboardOverview` to window that card's series. `page.tsx` keeps
`parseRange` and keeps passing `range` to the overview fetch; what goes is only the
`range` prop threaded from the page through the shell into the header, which no
longer has a control to feed.

## Known data limits

**Trainers and staff accounts are different records, and cannot be joined.**
`Trainer` is a gym-curated profile (name, bio, availability, rating); a staff
`GymMember` is an auth identity with a role. The schema documents the split
deliberately and carries no foreign key between them. So trainer delivery and
utilization describe one population, shift coverage another, and no figure on this
tab crosses that line. The two halves are labelled on screen rather than silently
mixed, and no total spans them.

**There is no record that a staff member actually worked.** `ShiftSlot` is the
standing plan and `TimeOffRequest` the approved absence; nothing records
attendance. The coverage card therefore says "scheduled", never "worked", and the
tab makes no attendance claim about staff at all. (Members have `CheckIn`; using
it for staff would measure who walked through a turnstile, which for a
receptionist who never does is 0% — a fabricated failure.)

**Approved leave is not subtracted from the coverage grid.** `ShiftSlot` is a
recurring weekly pattern with no dates; `TimeOffRequest` is a concrete date range.
Subtracting the second from the first would produce a number that is neither the
rota nor the reality. Leave is reported BESIDE the grid, as staff-days, in the
gaps card.

**A trainer with no availability set has no utilization, not 0%.** A brand-new
trainer's stored default is `{}`, which parses to a fully-unavailable week.
Dividing by that zero would report every such trainer as idle. They emit `null`,
are excluded from the gym-wide average, and are counted in the gaps card — a
missing configuration is the gym's to fix, and naming it is more useful than a red
bar.

**Availability windows are wall-clock, and everything else here is UTC.**
`{ start: "09:00", end: "17:00" }` is a local time with no zone. The delivered
hours it is compared against come from UTC instants. For a gym whose staff work
09:00–17:00 local, both sides measure the same NUMBER of hours, so the ratio is
right; only a window that straddles midnight local would misalign. The whole
reporting layer shares the UTC assumption — fixing it is a gym-timezone change
across all of Reports.

**The Prisma comment on `Trainer.availability` is stale.** It documents
`{ start, close }`; the Zod schema that validates and stores the value uses
`{ start, end }`. The schema is authoritative and this tab follows it. The comment
is corrected as part of this work — a one-line doc fix, no behaviour change.

## Metric definitions

Hours are computed in MINUTES and reported as decimal hours rounded to one place.
Percentages use the existing `rate()` helper and are nullable.

### Sessions delivered

Non-cancelled `ClassInstance` rows with a `trainerId`, plus non-cancelled
`PtSession` rows, bucketed by `startsAt`. Two dense series — `classes` and `pt` —
so a trainer base that has shifted from group to one-to-one reads as the shift it
is rather than as flat delivery.

A class with **no** trainer assigned is counted in neither series and is reported
in the gaps card: it was delivered by somebody, and this tab does not know who.

### Sessions per trainer

The same rows grouped by `Trainer.name`, each row carrying classes, PT, the total,
and the delivered hours behind them. Ranked by total sessions, capped at eight
rows, with the cap stated on the card.

### Trainer utilization

Per trainer: `delivered minutes ÷ available minutes`.

- **Delivered** — `endsAt − startsAt` over that trainer's non-cancelled classes
  and PT sessions starting in the window. An occurrence that starts inside the
  window and ends outside it contributes its whole duration; the window selects by
  start, like every other figure on the dashboard.
- **Available** — the trainer's weekly `availability`, parsed with
  `weeklyAvailabilitySchema`, summed per weekday, multiplied by how many times
  that weekday occurs in the window (UTC).

`null` when available minutes are zero. The KPI tile averages the trainers that
have a rate, and the card's caption names how many were excluded.

**A malformed `availability` JSON yields `null`, not a crash.** The column is
`Json` and predates the validator; `safeParse` failures are counted as
"no availability set" rather than thrown.

### Shift coverage

`ShiftSlot` rows summed per `dayOfWeek` (0 = Monday … 6 = Sunday): total scheduled
minutes and the number of distinct staff scheduled. Deliberately **not**
window-scoped — a recurring weekly rota has no dates, so it is the same answer
whatever the chart above is showing, and the caption says so.

`endTime <= startTime` (an overnight shift, or a typo) contributes zero minutes
and is counted in the gaps card rather than silently wrapping to a negative or a
23-hour shift.

### The gaps card

Four counts the rest of the tab cannot include, gathered in one place rather than
scattered as caveats:

- Approved leave in the window, in staff-days.
- Staff accounts with no `ShiftSlot` at all.
- Trainers with no usable `availability`.
- Classes in the window with no trainer assigned.

Staff means a `GymMember` whose role is not `MEMBER`, `deletedAt: null`.

## Architecture

### 1. Contract — `packages/types/src/dashboard-staff.ts` (new)

```ts
export const staffGranularitySchema = salesGranularitySchema;
export const DEFAULT_STAFF_GRANULARITY: StaffGranularity = 'daily';
export const dashboardStaffQuerySchema = z.object({
  granularity: staffGranularitySchema.catch(DEFAULT_STAFF_GRANULARITY),
});

export const sessionsPointSchema = z.object({
  label: z.string(),
  classes: z.number(),
  pt: z.number(),
});

export const trainerDeliverySchema = z.object({
  name: z.string(),
  classes: z.number(),
  pt: z.number(),
  sessions: z.number(),
  hours: z.number(),
  /** `null` — no usable availability, so there is no rate to state. */
  utilizationRate: z.number().nullable(),
});

export const shiftCoverageDaySchema = z.object({
  /** 0 = Monday … 6 = Sunday, matching `ShiftSlot.dayOfWeek`. */
  dayOfWeek: z.number(),
  hours: z.number(),
  staffCount: z.number(),
});

export const staffGapsSchema = z.object({
  leaveStaffDays: z.number(),
  staffWithoutShifts: z.number(),
  trainersWithoutAvailability: z.number(),
  classesWithoutTrainer: z.number(),
  invalidShiftSlots: z.number(),
});

export const staffKpisSchema = z.object({
  trainersDelivering: z.number(),
  sessionsDelivered: z.number(),
  utilizationRate: z.number().nullable(),
  scheduledHoursPerWeek: z.number(),
});

export const dashboardStaffResponseSchema = z.object({
  granularity: staffGranularitySchema,
  kpis: staffKpisSchema,
  sessionsOverTime: z.array(sessionsPointSchema),
  /** Ranked by sessions, capped at eight. */
  trainers: z.array(trainerDeliverySchema),
  /** Always seven entries, Monday first. */
  shiftCoverage: z.array(shiftCoverageDaySchema),
  gaps: staffGapsSchema,
});
```

### 2. API — `apps/api/src/dashboard/dashboard-staff.service.ts` (new)

One `get(query)` over six reads: class instances in the window (trainer + times +
status), PT sessions in the window, trainers (name, availability, status), shift
slots, approved time-off overlapping the window, and the staff head-count.

Wired as `@Get('staff')` on `dashboard.controller.ts`, gated on
`Permission.ReportView`.

### 3. Admin UI — `apps/admin/app/(dashboard)/staff-insights/` (new)

Named `staff-insights` because `(dashboard)/staff` is the real staff-roster route,
exactly as `class-insights` and `revenue-insights` before it.

| File                            | Job                                                      |
| ------------------------------- | -------------------------------------------------------- |
| `actions.ts`                    | `loadStaffAction`                                        |
| `staff-view.tsx`                | The tab: control, cache, retry, cascade, error-as-banner |
| `staff-kpi-strip.tsx`           | Four tiles; the nullable rate renders `—`                |
| `sessions-trend-card.tsx`       | Classes against PT; owns the granularity control         |
| `trainer-utilization-card.tsx`  | Ranked bars + the excluded-trainer caption               |
| `sessions-per-trainer-card.tsx` | Ranked list (rail)                                       |
| `shift-coverage-card.tsx`       | Weekday bars, labelled "scheduled"                       |
| `staff-gaps-card.tsx`           | The five honest counts (rail)                            |

### 4. Shell changes

`HAND_BUILT_SEGMENTS` and `isHandBuiltSegment` disappear;
`DASHBOARD_SEGMENTS` becomes a plain literal list of the six tabs.
`segmented-dashboard.tsx` becomes a switch over six views with no panel, no
picker and no selection state. `page.tsx` stops computing `selectedKeys`.
`dashboard-header.tsx` keeps the period control for Overview and shows nothing
elsewhere, and it no longer takes a `range` prop. `page.tsx` still parses `?range=`
and still passes it to `fetchDashboardOverview` — the Overview's revenue card owns
that param and is unaffected by any of this.

## Error handling

Identical to the four sibling tabs: alert-as-tab on a failed first load, banner
over surviving figures afterwards, per-combination retry, and a `.catch` on the
action call itself.

## Testing

**`packages/types/src/dashboard-staff.spec.ts`** — query defaults, response
round-trip, `null` utilization distinct from `0`.

**`apps/api/src/dashboard/dashboard-staff.service.spec.ts`**

- Available minutes multiply each weekday's windows by that weekday's count in the
  window; a 30-day window covers four or five of each.
- Two windows in one day sum; an unavailable day contributes nothing.
- A trainer with `{}` availability, and one with malformed JSON, both yield `null`
  and are counted in the gaps — no throw.
- The KPI average excludes the `null` trainers rather than treating them as zero.
- Cancelled classes and cancelled PT sessions leave every figure.
- A class with no `trainerId` is in neither series and is counted in the gaps.
- Delivered hours sum `endsAt − startsAt`, including an occurrence that ends after
  the window closes.
- Shift coverage sums per weekday, counts distinct staff, and rejects
  `endTime <= startTime` into `invalidShiftSlots`.
- Leave counts staff-days clipped to the window, approved only.
- The trainer ranking sorts by sessions and caps at eight.
- Dense zero-fill on an empty window; every KPI `0` or `null`.

**`apps/admin/app/(dashboard)/staff-insights/staff-view.test.tsx`** — loads and
renders each card, refetches on granularity change and caches, `null` renders as
`—`, both error modes, the gaps card states its counts.

**Retirement regressions** — the segments spec files are deleted with the code
they covered. `segmented-dashboard.test.tsx` is rewritten to assert what the shell
does now: each of the six tabs renders its own view, no panel exists, `?segment=`
still parses and falls back. `dashboard-header.test.tsx` drops every range case.

## Follow-up

**The `DashboardWidget` table is now orphaned.** No code reads or writes it after
this change. Dropping it is one migration and one line of schema, and it destroys
whatever layouts gyms had saved. It is deliberately left for a separate decision.

**The dashboard now has six tabs and no extension point.** Adding a seventh means
writing a view, a contract and a service — which is what the last four took, and
what the widget indirection was supposed to save. It saved nothing because every
tab that mattered outgrew the "a widget is a report section" shape within one
iteration. Worth remembering before reaching for a generic layer again.
