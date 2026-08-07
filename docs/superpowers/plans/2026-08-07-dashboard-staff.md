# Dashboard Staff Tab + Widget-Grid Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the last widget grid with a hand-built Staff tab — delivery, trainer utilization against stored availability, and the standing rota — and retire the widget machinery that promoting the last segment makes unrepresentable.

**Architecture:** The fifth and final hand-built tab, built exactly like Classes. Then a deletion pass: with no configurable segments left, the catalogue, the picker, the panel and the segments API have no callers and no valid types.

**Tech Stack:** NestJS + Prisma, Zod contracts in `@fit/types`, Next.js App Router + StyleX + Astryx, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-07-dashboard-staff-design.md`](../specs/2026-08-07-dashboard-staff-design.md)

**Order matters:** Tasks 1–8 build the tab while the grid still compiles. Tasks 9–10 delete the grid. Reversing them leaves the repo uncompilable in between.

## Global Constraints

- No schema migrations. The `DashboardWidget` table stays; only its callers go.
- No new design tokens.
- Every API read goes through `TenantPrismaService`.
- Hours are computed in MINUTES, reported as decimal hours to one place. Percentages use `rate()`; a rate with no denominator is `null`.
- `?range=` stays live — the Overview's revenue card owns it. Only the header's range CONTROL and the prop chain feeding it go.
- i18n keys land in both locales; the API stays locale-free (weekday names are keys).
- `pnpm lint` runs with `--max-warnings 0`.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: The wire contract

**Files:** create `packages/types/src/dashboard-staff.ts` + `.spec.ts`; export from `packages/types/index.ts`.

Produces `dashboardStaffQuerySchema`, `DashboardStaffQuery`, `dashboardStaffResponseSchema`, `DashboardStaffResponse`, `StaffGranularity`, `DEFAULT_STAFF_GRANULARITY`, `SessionsPoint`, `TrainerDelivery`, `ShiftCoverageDay`, `StaffGaps`, `StaffKpis`, `TOP_TRAINERS`.

- [ ] **Step 1: the failing test** — query defaults, response round-trip, `null` utilization distinct from `0`, seven coverage days required, a missing KPI rejected. Model it on `dashboard-classes.spec.ts`.
- [ ] **Step 2:** `pnpm --filter @fit/types test -- dashboard-staff` → FAIL (unresolved import).
- [ ] **Step 3: the contract**, exactly as the spec's "Contract" section, with these doc comments carried in:

```ts
// @fit/types — the hand-built Staff dashboard tab's contract (Zod schemas).
//
// The tab has TWO HALVES that the schema cannot join. `Trainer` is a curated
// profile carrying `availability`; a staff `GymMember` is an auth identity
// carrying `ShiftSlot` rows. There is no foreign key between them, so trainer
// delivery and shift coverage describe different populations — no figure here
// crosses that line and no total spans them.
//
// Hours are decimal hours to one place; percentages are 0–100 and NULLABLE. A
// trainer with no availability set has no utilization, not 0%: dividing by that
// zero would report every unconfigured trainer as idle.
```

```ts
/** How many trainers the ranking shows. The card's caption states it. */
export const TOP_TRAINERS = 8;
```

- [ ] **Step 4:** export, run → PASS, commit `feat(types): add the Staff dashboard tab contract`.

---

### Task 2: The Staff aggregation service

**Files:** create `apps/api/src/dashboard/dashboard-staff.service.ts` + `.spec.ts`.

- [ ] **Step 1: the failing test.** Freeze time to `2026-08-07T12:00:00.000Z` with `vi.setSystemTime`, stub six Prisma reads, and cover every case in the spec's Testing section. The two that carry the design:

```ts
// A weekday's windows multiply by how many times that weekday falls in the
// window — the whole point of comparing a WEEKLY availability against a
// 30-day delivery record.
it('multiplies each weekday of availability by its count in the window', async () => {
  const { service } = setup({
    trainers: [
      {
        id: 't1',
        name: 'Ana',
        availability: { mon: { available: true, windows: [{ start: '09:00', end: '17:00' }] } },
      },
    ],
    instances: [instance({ trainerId: 't1', startsAt: at(-1, 9), endsAt: at(-1, 13) })],
  });
  const result = await service.get(QUERY);
  // Five Mondays in the 31-bucket window x 8h = 40h available, 4h delivered.
  expect(result.trainers[0]?.utilizationRate).toBe(10);
  expect(result.trainers[0]?.hours).toBe(4);
});

// The stored default for a new trainer is `{}`, and a Json column can hold
// anything. Neither is 0% utilization, and neither may throw.
it('yields null for an unset or malformed availability and counts it', async () => {
  const { service } = setup({
    trainers: [
      { id: 't1', name: 'Ana', availability: {} },
      { id: 't2', name: 'Bo', availability: { mon: 'nonsense' } },
    ],
    instances: [instance({ trainerId: 't1' })],
  });
  const result = await service.get(QUERY);
  expect(result.trainers.every((t) => t.utilizationRate === null)).toBe(true);
  expect(result.kpis.utilizationRate).toBeNull();
  expect(result.gaps.trainersWithoutAvailability).toBe(2);
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: the service.** The reads:

```ts
const [instances, ptSessions, trainers, shiftSlots, timeOff, staffCount] = await Promise.all([
  this.prisma.client.classInstance.findMany({
    where: {
      startsAt: { gte: win.start, lt: win.end },
      status: { not: InstanceStatus.CANCELED },
    },
    select: { trainerId: true, startsAt: true, endsAt: true },
  }),
  this.prisma.client.ptSession.findMany({
    where: {
      startsAt: { gte: win.start, lt: win.end },
      status: { not: InstanceStatus.CANCELED },
    },
    select: { trainerId: true, startsAt: true, endsAt: true },
  }),
  this.prisma.client.trainer.findMany({
    where: { status: TrainerStatus.ACTIVE },
    select: { id: true, name: true, availability: true },
  }),
  // NOT window-scoped: a recurring weekly rota carries no dates.
  this.prisma.client.shiftSlot.findMany({
    select: { staffId: true, dayOfWeek: true, startTime: true, endTime: true },
  }),
  this.prisma.client.timeOffRequest.findMany({
    where: {
      status: TimeOffStatus.approved,
      startDate: { lt: win.end },
      endDate: { gte: win.start },
    },
    select: { startDate: true, endDate: true },
  }),
  this.prisma.client.gymMember.count({
    where: { role: { not: Role.MEMBER }, deletedAt: null },
  }),
]);
```

and the pure helpers, which are where the thinking is:

```ts
/** Weekday keys in `ShiftSlot.dayOfWeek` order: 0 = Monday … 6 = Sunday. */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** `"HH:MM"` as minutes past midnight. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Minutes to decimal hours, one place. */
function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * How many times each weekday falls inside the window, Monday first. A weekly
 * availability means nothing until it is multiplied by this.
 */
function weekdayCounts(win: ReportWindow): number[] {
  const counts = new Array<number>(7).fill(0);
  let cursor = new Date(`${isoDate(win.start)}T00:00:00.000Z`).getTime();
  while (cursor < win.end.getTime()) {
    const index = (new Date(cursor).getUTCDay() + 6) % 7;
    counts[index] = (counts[index] ?? 0) + 1;
    cursor += DAY_MS;
  }
  return counts;
}

/**
 * A trainer's bookable minutes over the window, or `null` when there are none to
 * divide by.
 *
 * `safeParse`, not `parse`: the column is `Json` and predates the validator, so a
 * malformed value is data to report rather than an exception to throw. An unset
 * week (`{}`, the stored default) parses fine and sums to zero — the same `null`,
 * and the same line in the gaps card.
 */
function availableMinutes(raw: unknown, counts: number[]): number | null {
  const parsed = weeklyAvailabilitySchema.safeParse(raw ?? {});
  if (!parsed.success) return null;
  let total = 0;
  DAY_KEYS.forEach((key, index) => {
    const day = parsed.data[key];
    if (!day.available) return;
    const minutes = day.windows.reduce(
      (sum, window) => sum + (toMinutes(window.end) - toMinutes(window.start)),
      0,
    );
    total += minutes * (counts[index] ?? 0);
  });
  return total === 0 ? null : total;
}
```

The gym-wide utilization is a WEIGHTED ratio, not a mean of rates — one trainer
with two available hours must not swing the gym's number as hard as one with
forty:

```ts
      utilizationRate:
        ratedAvailable === 0 ? null : rate(ratedDelivered, ratedAvailable),
```

where `ratedDelivered` / `ratedAvailable` accumulate only over trainers whose
`availableMinutes` was non-null.

Leave, clipped to the window and counted in staff-days:

`startOfUtcDay` is local to this service and takes a `Date` — the one in
`admin-invoices.service.ts` takes a `YYYY-MM-DD` string and is not reusable here:

```ts
/** The UTC midnight of an instant's own calendar day, as epoch ms. */
function startOfUtcDay(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
}
```

```ts
let leaveStaffDays = 0;
for (const request of timeOff) {
  const from = Math.max(startOfUtcDay(request.startDate), startOfUtcDay(win.start));
  const to = Math.min(startOfUtcDay(request.endDate), startOfUtcDay(win.end));
  // Inclusive of both ends: a one-day request is one staff-day, not zero.
  if (to >= from) leaveStaffDays += Math.round((to - from) / DAY_MS) + 1;
}
```

Shift coverage, seven entries always, rejecting a slot that does not move forward:

```ts
const coverage = DAY_KEYS.map((_, dayOfWeek) => ({
  dayOfWeek,
  minutes: 0,
  staff: new Set<string>(),
}));
let invalidShiftSlots = 0;
for (const slot of shiftSlots) {
  const minutes = toMinutes(slot.endTime) - toMinutes(slot.startTime);
  const day = coverage[slot.dayOfWeek];
  if (day === undefined || minutes <= 0) {
    // An overnight shift or a typo. Counted, not wrapped into a negative or a
    // 23-hour day.
    invalidShiftSlots += 1;
    continue;
  }
  day.minutes += minutes;
  day.staff.add(slot.staffId);
}
```

- [ ] **Step 4:** run → PASS. Commit `feat(api): aggregate the Staff dashboard tab`.

---

### Task 3: Expose it on the controller

**Files:** modify `dashboard.controller.ts`, `dashboard.module.ts`, `dashboard.controller.spec.ts`.

Mirror `@Get('classes')` exactly: a `staffTab` constructor argument, a `@Get('staff')` handler parsing with `dashboardStaffQuerySchema`, the provider registered, the module doc-comment's tab list extended to five. Three controller cases (valid query, absent query, unknown granularity).

- [ ] Test → FAIL → implement → `pnpm --filter api test -- dashboard` → PASS → commit `feat(api): serve GET /dashboard/staff`.

---

### Task 4: The admin data layer

**Files:** modify `apps/admin/lib/api.ts`; create `app/(dashboard)/staff-insights/actions.ts`.

`fetchDashboardStaff` beside `fetchDashboardClasses` (one `granularity` param, `cache: 'no-store'`); `loadStaffAction` as a copy of `class-insights/actions.ts` against `admin.dashboard.staff`.

- [ ] tsc → PASS → commit `feat(admin): fetch the Staff dashboard tab`.

---

### Task 5: The tab's copy, in both locales

**Files:** both locales, inserted after `admin.dashboard.classes`.

- [ ] Verify `admin.dashboard.staff` is free first:
      `python3 -c "import json;print('staff' in json.load(open('packages/i18n/locales/en.json'))['admin']['dashboard'])"`.
- [ ] Keys: `granularityLabel`, `granularity.*`, `window.*`, `kpi.{trainersDelivering,sessionsDelivered,utilizationRate,scheduledHoursPerWeek}`, `kpiCaption`, `noValue`, `sessions.{title,caption,chartAria,classes,pt,empty}`, `utilization.{title,caption,excluded,empty}`, `perTrainer.{title,caption,row,empty}`, `coverage.{title,caption,weekday.{mon..sun},row,empty}`, `gaps.{title,caption,leave,noShifts,noAvailability,noTrainer,invalidShifts,none}`, `loadError`, `retry`.
- [ ] The three captions that carry the spec's honesty, verbatim in English: - `coverage.caption`: `"The standing weekly rota — scheduled, not worked"` - `utilization.excluded`: `"{count} trainers have no availability set"` - `gaps.caption`: `"What this tab cannot count"`
- [ ] `pnpm --filter @fit/i18n test` → PASS → commit `feat(i18n): add the Staff dashboard tab copy`.

---

### Task 6: The KPI strip and the sessions trend

**Files:** `staff-insights/staff-kpi-strip.tsx`, `sessions-trend-card.tsx`.

- [ ] **Strip** — copy `class-insights/classes-kpi-strip.tsx`. Tiles:

```tsx
const TILES = [
  { key: 'trainersDelivering', kind: 'count' },
  { key: 'sessionsDelivered', kind: 'count' },
  { key: 'utilizationRate', kind: 'rate' },
  { key: 'scheduledHoursPerWeek', kind: 'hours' },
] as const satisfies readonly { key: keyof StaffKpis; kind: 'count' | 'rate' | 'hours' }[];
```

with `hours` rendering `${value}h` and `rate` the em-dash on `null`.

- [ ] **Trend** — copy `revenue-insights/revenue-trend-card.tsx` (the `DualAreaChart` one) with `secondaryTone="neutral"`, `primary: point.classes`, `secondary: point.pt`, legend keys `sessions.classes` / `sessions.pt`. It owns the granularity control. Header comment:

```tsx
// Sessions delivered over the tab's window, split by what was delivered.
//
// Both series are work done, so the secondary is drawn in the NEUTRAL tone: a
// trainer base that has shifted from group classes to one-to-one has not
// developed a problem, it has changed shape, and the error tone would say
// otherwise.
//
// A class with no trainer assigned is in neither series — somebody taught it and
// this tab does not know who. The gaps card counts those rather than guessing.
```

- [ ] tsc + lint → PASS → commit `feat(admin): add the Staff KPI strip and sessions trend`.

---

### Task 7: The three snapshots and the gaps card

**Files:** `trainer-utilization-card.tsx`, `sessions-per-trainer-card.tsx`, `shift-coverage-card.tsx`, `staff-gaps-card.tsx`.

- [ ] **Utilization** — `BarChart` over trainers that HAVE a rate, `formatValue: (v) => `${v}%``, plus the excluded caption when any were dropped:

```tsx
const rated = trainers.filter(
  (trainer): trainer is TrainerDelivery & { utilizationRate: number } =>
    trainer.utilizationRate !== null,
);
const excluded = trainers.length - rated.length;
```

Header comment:

```tsx
// Delivered hours against the hours each trainer said they were available.
//
// Trainers with no availability set are ABSENT from the chart rather than shown
// at 0%: the missing figure is a configuration gap, and drawing it as a red bar
// blames the trainer for the gym's unfilled form. The caption counts them.
```

- [ ] **Sessions per trainer** — `class-insights/top-class-types-card.tsx`'s shape: bars by `sessions`, rows repeating `perTrainer.row` with classes, PT and hours.
- [ ] **Shift coverage** — `BarChart` over seven days, labels from `coverage.weekday.*`, `formatValue: (v) => `${v}h``, caption `coverage.caption`. Header comment:

```tsx
// The standing weekly rota: scheduled hours per weekday, and how many staff are
// on each.
//
// SCHEDULED, never worked — nothing in the schema records whether a shift was
// kept, and the title says the word it can defend. Nor is this window-scoped: a
// recurring rota carries no dates, so it reads the same whatever the chart above
// is showing, and the caption says that too.
//
// Approved leave is NOT subtracted. A date-ranged absence taken out of a dateless
// weekly pattern would produce a number that is neither the rota nor the reality;
// the gaps card reports it beside this instead.
```

- [ ] **Gaps** — a plain definition list of the five counts, each row hidden when zero, with `gaps.none` when all five are:

```tsx
const rows = [
  { key: 'leave', value: gaps.leaveStaffDays },
  { key: 'noShifts', value: gaps.staffWithoutShifts },
  { key: 'noAvailability', value: gaps.trainersWithoutAvailability },
  { key: 'noTrainer', value: gaps.classesWithoutTrainer },
  { key: 'invalidShifts', value: gaps.invalidShiftSlots },
].filter((row) => row.value > 0);
```

Header comment:

```tsx
// What this tab cannot count, in one place.
//
// Every figure above has an exclusion behind it — a trainer with no availability,
// a class with no trainer, a shift that does not move forward, leave that cannot
// be subtracted from a dateless rota. Scattering those as five small caveats
// would let each one be missed; gathering them here makes the tab's blind spots
// a thing the owner can act on rather than a footnote.
```

- [ ] tsc + lint → PASS → commit `feat(admin): add the Staff snapshots and gaps card`.

---

### Task 8: Assemble the tab

**Files:** `staff-insights/staff-view.tsx`, `staff-view.test.tsx`.

- [ ] **Step 1: the failing test** — copy `class-insights/classes-view.test.tsx`, swap the fixture, keep every case, and add:

```tsx
it('leaves an unrated trainer out of the utilization chart and says so', async () => {
  loadStaffAction.mockResolvedValue({
    ok: true,
    data: response({
      trainers: [
        { name: 'Ana', classes: 4, pt: 2, sessions: 6, hours: 8, utilizationRate: 40 },
        { name: 'Bo', classes: 1, pt: 0, sessions: 1, hours: 1, utilizationRate: null },
      ],
    }),
  });
  renderView();
  expect(await screen.findByRole('heading', { name: 'Trainer utilization' })).toBeInTheDocument();
  expect(screen.getByText('1 trainers have no availability set')).toBeInTheDocument();
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: the view** — copy `class-insights/classes-view.tsx`, one control, cache keyed on the granularity alone. Layout:

```tsx
        <div {...stylex.props(styles.column)}>
          <div {...stylex.props(step(1))}>
            <SessionsTrendCard … />
          </div>
          <div {...stylex.props(step(2))}>
            <TrainerUtilizationCard trainers={data.trainers} />
          </div>
          <div {...stylex.props(step(3))}>
            <ShiftCoverageCard days={data.shiftCoverage} />
          </div>
        </div>

        {/*
          The rail carries the per-trainer detail and the tab's own blind spots.
          The shift card sits on the LEFT with the trends despite being a snapshot:
          it is the staff half of the tab, and burying the rota in a narrow column
          would read as an afterthought rather than as the second of two halves.
        */}
        <div {...stylex.props(styles.rail)}>
          <div {...stylex.props(step(2))}>
            <SessionsPerTrainerCard trainers={data.trainers} />
          </div>
          <div {...stylex.props(step(3))}>
            <StaffGapsCard gaps={data.gaps} />
          </div>
        </div>
```

- [ ] **Step 4:** run → PASS → commit `feat(admin): assemble the Staff tab view`.

---

### Task 9: Retire the widget grid — contracts

**Files:** `packages/types/src/dashboard-segments.{ts,spec.ts}`.

- [ ] **Step 1:** Rewrite `dashboard-segments.ts` down to what the tab bar needs:

```ts
// @fit/types — the admin dashboard's tab list.
//
// Was a widget CATALOGUE: segments whose contents a gym could choose from a
// picker, each widget a named reference to a Reports drill-down section. Every
// segment outgrew that shape within one iteration — each of the six tabs now
// answers questions no report section had — so the indirection, its picker, its
// API and its stored rows have gone. What is left is the list of tabs and the
// `?segment=` contract, which is all the shell ever needed.

import { z } from 'zod';

/**
 * Every dashboard tab, in display order. Each renders its own hand-built view;
 * adding one means writing that view, a contract and a service, which is what the
 * catalogue was supposed to save and never did.
 */
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

/** The tab shown when `?segment=` is absent or unrecognised. */
export const DEFAULT_DASHBOARD_SEGMENT: DashboardSegment = 'overview';
```

- [ ] **Step 2:** Reduce the spec file to the three cases that still have a subject: the tab order, the default segment, and `?segment=` parsing (an unknown value fails `safeParse`). Delete the catalogue cases with one comment recording that the catalogue itself is gone, not merely untested.
- [ ] **Step 3:** `pnpm --filter @fit/types test` → PASS (the rest of the package is untouched). Commit `refactor(types)!: retire the dashboard widget catalogue`.

---

### Task 10: Retire the widget grid — API, admin, shell

**Delete:**

```
apps/api/src/dashboard/dashboard-segments.controller.ts
apps/api/src/dashboard/dashboard-segments.controller.spec.ts
apps/api/src/dashboard/dashboard-segments.service.ts
apps/api/src/dashboard/dashboard-segments.service.spec.ts
apps/admin/app/(dashboard)/segments/actions.ts
apps/admin/app/(dashboard)/segments/add-widget-dialog.tsx
apps/admin/app/(dashboard)/segments/add-widget-dialog.test.tsx
apps/admin/app/(dashboard)/segments/segment-panel.tsx
apps/admin/app/(dashboard)/segments/segment-panel.test.tsx
apps/admin/app/(dashboard)/segments/widget-grid.tsx
```

**Edit:**

- [ ] `dashboard.module.ts` — drop the segments controller and service; the module now serves `/dashboard` alone.
- [ ] `apps/admin/lib/api.ts` — drop `fetchDashboardSegment` and `saveDashboardSegmentWidgets` and their imports.
- [ ] `apps/admin/app/(dashboard)/page.tsx` — drop `selectedKeys`, `widgetsForSegment` and `CONFIGURABLE_DASHBOARD_SEGMENTS`; keep `parseRange` and keep passing `range` to `fetchDashboardOverview`; stop passing `selectedKeys` and `range` to the shell.
- [ ] `segmented-dashboard.tsx` — reduce to: parse `?segment=`, render the tab bar, render one of six views. No `configurableSegment`, `lastSegment`, `savedAt`, `selections`, `noteSelection`, `onSaved`, no hidden mounted panel, no `range` prop. Rewrite the header comment: the panel-cache paragraph describes machinery that no longer exists.
- [ ] `dashboard-header.tsx` — drop the `range` prop, the `RANGE_VALUES` list, `selectRange`, and the `isHandBuiltSegment` branch. The period control renders on Overview; every other tab gets no control. Rewrite the comment block, which currently explains a range/period split that is gone.
- [ ] Both locales — delete `admin.dashboard.widgets`, `admin.dashboard.picker`, and `admin.dashboard.segments.{loadError,retry,empty}`. **Keep** `admin.dashboard.segments.aria` and the six tab names: the tab bar still reads them.

**Tests:**

- [ ] `segmented-dashboard.test.tsx` — rewrite. It asserted panel mounting, picker visibility and selection plumbing, none of which exist. What survives, and what it must now say:

```tsx
  it.each(DASHBOARD_SEGMENTS)('renders the %s tab’s own view', (segment) => { … });

  it('prefers the live query over the segment the server first rendered', () => { … });

  it('falls back to the default segment on an unrecognised query value', () => { … });

  it('drops the segment param entirely when returning to the default tab', async () => { … });

  it('writes the chosen segment to the query without touching the other params', async () => { … });
```

- [ ] `dashboard-header.test.tsx` — delete every range case; keep the title, the period control on Overview, the "no control elsewhere" case (now covering all five), the custom-range write and the stale-window clear.
- [ ] `segment-tabs.test.tsx` — untouched; the bar is unchanged.

- [ ] **Verify:** `pnpm type-check && pnpm test && pnpm lint && pnpm format:check`, then `rm -rf apps/admin/.next && pnpm --filter @fit/admin build`.
- [ ] **Commit** `refactor!: retire the dashboard widget grid`, with a body naming what a reader will otherwise go looking for: the `DashboardWidget` table is intentionally left in place, and `?range=` is still the Overview revenue card's param.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
pnpm format:check
rm -rf apps/admin/.next && pnpm --filter @fit/admin build
```

Then confirm by hand that nothing references the removed exports:

```bash
grep -rn "widgetsForSegment\|DASHBOARD_WIDGET_CATALOG\|ConfigurableDashboardSegment\|isHandBuiltSegment\|SegmentPanel\|AddWidgetDialog" apps packages --include='*.ts' --include='*.tsx' | grep -v generated
```

Expected: no matches outside `packages/db/generated`.
