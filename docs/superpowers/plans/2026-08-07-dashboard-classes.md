# Dashboard Classes Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Classes tab's two-widget grid with a hand-built view answering six questions: when demand lands, whether it turns up, how much of it was ever marked, how full the committed capacity ran, whether PT is growing, and which hours of the week the timetable actually serves.

**Architecture:** The fourth hand-built tab, built exactly like Revenue — one `GET /dashboard/classes` returning the whole tab, one granularity control owned by the view, cache keyed on it, error-as-banner once data is on screen.

**Tech Stack:** NestJS + Prisma (tenant-scoped client), Zod contracts in `@fit/types`, Next.js App Router + StyleX + Astryx in `apps/admin`, Vitest everywhere.

**Spec:** [`docs/superpowers/specs/2026-08-07-dashboard-classes-design.md`](../specs/2026-08-07-dashboard-classes-design.md)

**Reference implementation:** the Revenue tab, shipped in commits `444e6a3..fa51af1`. Every UI task below names the `revenue-insights/` file it copies its structure from; open that file rather than inventing a second house style.

## Global Constraints

- No schema migrations. Every figure derives from existing columns.
- No new design tokens. Existing `var(--color-*)` / `var(--font-family-*)` only.
- Every API read goes through `TenantPrismaService`; no query passes or trusts a `gymId`.
- Percentages are 0–100 via the existing `rate()` helper from `report-window.util`. A rate with no denominator is `null`, never `0`.
- Counts are densely zero-filled; a quiet bucket is a real zero.
- Query schemas use `.catch(default)`, never `.default()`.
- i18n keys land in **both** locales. The API stays locale-free — weekday names never go on the wire.
- `pnpm lint` runs with `--max-warnings 0`; run `pnpm exec prettier --write <files>` before committing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

### Task 1: The wire contract

**Files:**

- Create: `packages/types/src/dashboard-classes.ts`
- Test: `packages/types/src/dashboard-classes.spec.ts`
- Modify: `packages/types/index.ts` (export beside `./src/dashboard-members`)

**Interfaces:**

- Consumes: `salesGranularitySchema` from `./dashboard-sales`; `reportSeriesPointSchema` from `./reports-drilldown`.
- Produces: `dashboardClassesQuerySchema`, `DashboardClassesQuery`, `dashboardClassesResponseSchema`, `DashboardClassesResponse`, `ClassesGranularity`, `DEFAULT_CLASSES_GRANULARITY`, `ClassesRatePoint`, `ClassTypeSlice`, `ClassesKpis`, `HEATMAP_ROWS`, `HEATMAP_COLS`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  dashboardClassesQuerySchema,
  dashboardClassesResponseSchema,
  DEFAULT_CLASSES_GRANULARITY,
  HEATMAP_COLS,
  HEATMAP_ROWS,
} from './dashboard-classes';

function response() {
  return {
    granularity: 'daily',
    kpis: { classesHeld: 12, seatsBooked: 80, noShowRate: 12.5, utilizationRate: 66.7 },
    bookingsOverTime: [{ label: '2026-08-01', value: 80 }],
    attendanceOverTime: [{ label: '2026-08-01', value: 87.5 }],
    utilizationOverTime: [{ label: '2026-08-01', value: 66.7 }],
    ptSessionsOverTime: [{ label: '2026-08-01', value: 4 }],
    topClassTypes: [{ name: 'Yoga', seatsBooked: 40, sessions: 5, utilizationRate: 80 }],
    demandByHour: Array.from({ length: HEATMAP_ROWS }, () =>
      new Array<number>(HEATMAP_COLS).fill(0),
    ),
    markedCoverage: 62.5,
  };
}

describe('dashboard classes contract', () => {
  it('falls back to the default on an unknown granularity', () => {
    expect(dashboardClassesQuerySchema.parse({ granularity: 'hourly' }).granularity).toBe(
      DEFAULT_CLASSES_GRANULARITY,
    );
  });

  it('accepts an omitted query entirely', () => {
    expect(dashboardClassesQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_CLASSES_GRANULARITY,
    });
  });

  it('describes a seven-by-twenty-four grid', () => {
    expect([HEATMAP_ROWS, HEATMAP_COLS]).toEqual([7, 24]);
  });

  it('round-trips a full response', () => {
    expect(dashboardClassesResponseSchema.parse(response())).toEqual(response());
  });

  // `null` is "nothing to measure"; `0` is "measured, and it was zero". A rate
  // that collapses the two would report a 0% attendance nobody observed.
  it('keeps a null rate distinct from zero', () => {
    const parsed = dashboardClassesResponseSchema.parse({
      ...response(),
      kpis: { classesHeld: 0, seatsBooked: 0, noShowRate: null, utilizationRate: null },
      attendanceOverTime: [{ label: '2026-08-01', value: null }],
      markedCoverage: null,
    });
    expect(parsed.kpis.noShowRate).toBeNull();
    expect(parsed.attendanceOverTime[0]?.value).toBeNull();
    expect(parsed.markedCoverage).toBeNull();
  });

  it('refuses a response missing a KPI', () => {
    const broken = response();
    // @ts-expect-error deleting a required key is the point of the case
    delete broken.kpis.utilizationRate;
    expect(dashboardClassesResponseSchema.safeParse(broken).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @fit/types test -- dashboard-classes`
Expected: FAIL — cannot resolve `./dashboard-classes`.

- [ ] **Step 3: Write the contract**

```ts
// @fit/types — the hand-built Classes dashboard tab's contract (Zod schemas).
//
// Sibling of `./dashboard-sales`, `./dashboard-members` and `./dashboard-revenue`.
// Where Revenue answers "what did we take?", this one answers "what did we commit
// a trainer and a room to, and did anybody come?"
//
// Percentages are 0–100 and NULLABLE throughout. A `null` rate is "there was
// nothing to measure"; `0` is "measured, and it was zero". Collapsing the two
// would report an attendance rate of 0% for a week with no marked bookings — a
// confident claim about a fact nobody recorded.
//
// The heatmap travels as CELLS ONLY. Weekday names are i18n keys resolved
// client-side, so this contract stays locale-free like every sibling; the Reports
// drill-down puts English row labels on the wire and this deliberately does not
// copy that.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';
import { reportSeriesPointSchema } from './reports-drilldown';

export const classesGranularitySchema = salesGranularitySchema;
export type ClassesGranularity = z.infer<typeof classesGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_CLASSES_GRANULARITY: ClassesGranularity = 'daily';

export const dashboardClassesQuerySchema = z.object({
  granularity: classesGranularitySchema.catch(DEFAULT_CLASSES_GRANULARITY),
});
export type DashboardClassesQuery = z.infer<typeof dashboardClassesQuerySchema>;

/** Demand heatmap dimensions: Monday–Sunday by hour 0–23, UTC. */
export const HEATMAP_ROWS = 7;
export const HEATMAP_COLS = 24;

/** One bucket of a percentage trend. `null` — nothing to measure, not 0%. */
export const classesRatePointSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
});
export type ClassesRatePoint = z.infer<typeof classesRatePointSchema>;

/** One row of the class-type ranking. */
export const classTypeSliceSchema = z.object({
  name: z.string(),
  seatsBooked: z.number(),
  sessions: z.number(),
  /** `null` when the type's occurrences resolved no capacity at all. */
  utilizationRate: z.number().nullable(),
});
export type ClassTypeSlice = z.infer<typeof classTypeSliceSchema>;

/**
 * The tab's four headline figures. Two counts and two rates; the rates are
 * nullable for the reason in this module's header.
 *
 * `noShowRate` rather than the attendance rate it complements: they share a
 * denominator, so one is `100 −` the other, and the tile carries the one an owner
 * acts on while the trend carries the one that reads better as a line.
 */
export const classesKpisSchema = z.object({
  classesHeld: z.number(),
  seatsBooked: z.number(),
  noShowRate: z.number().nullable(),
  utilizationRate: z.number().nullable(),
});
export type ClassesKpis = z.infer<typeof classesKpisSchema>;

/**
 * `GET /dashboard/classes` response — the whole tab in one round trip, so its
 * granularity control never leaves one card describing a different window from
 * its neighbour.
 */
export const dashboardClassesResponseSchema = z.object({
  granularity: classesGranularitySchema,
  kpis: classesKpisSchema,
  /** Seats booked per bucket, keyed by the occurrence's start — dense. */
  bookingsOverTime: z.array(reportSeriesPointSchema),
  /** Attended share of the marked bookings per bucket. */
  attendanceOverTime: z.array(classesRatePointSchema),
  /** Seats booked against resolved capacity per bucket. */
  utilizationOverTime: z.array(classesRatePointSchema),
  /** Non-cancelled PT sessions per bucket — dense. */
  ptSessionsOverTime: z.array(reportSeriesPointSchema),
  /** Ranked by seats booked, capped at eight rows. */
  topClassTypes: z.array(classTypeSliceSchema),
  /** {@link HEATMAP_ROWS} x {@link HEATMAP_COLS} seat counts, Mon–Sun x hour, UTC. */
  demandByHour: z.array(z.array(z.number())),
  /**
   * Share of FINISHED, uncancelled bookings carrying an attendance outcome.
   * `null` when no occurrence in the window has ended yet — a tab opened on a week
   * of future classes has nothing to have marked, which is not 0% coverage.
   */
  markedCoverage: z.number().nullable(),
});
export type DashboardClassesResponse = z.infer<typeof dashboardClassesResponseSchema>;
```

- [ ] **Step 4: Export, run, commit**

Add `export * from './src/dashboard-classes';` to `packages/types/index.ts`.

Run: `pnpm --filter @fit/types test -- dashboard-classes` → PASS (6 tests).

```bash
pnpm exec prettier --write packages/types/
git add packages/types/
git commit -m "feat(types): add the Classes dashboard tab contract"
```

---

### Task 2: The Classes aggregation service

**Files:**

- Create: `apps/api/src/dashboard/dashboard-classes.service.ts`
- Test: `apps/api/src/dashboard/dashboard-classes.service.spec.ts`

**Interfaces:**

- Consumes: `resolveWindow`, `emptyBuckets`, `bucketKey`, `rate` from `../reports/report-window.util`; `SALES_GRANULARITY_RANGE`, `HEATMAP_ROWS`, `HEATMAP_COLS` from `@fit/types`.
- Produces: `class DashboardClassesService { constructor(prisma: TenantPrismaService); get(query: DashboardClassesQuery): Promise<DashboardClassesResponse> }`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, InstanceStatus } from '@fit/db';
import { DashboardClassesService } from './dashboard-classes.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** Frozen "now" — a Friday — so weekday and finished/unfinished are exact. */
const NOW = new Date('2026-08-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** An instant `offset` days from now, at `hour` UTC. */
function at(offset: number, hour = 10): Date {
  const base = new Date('2026-08-07T00:00:00.000Z').getTime() + offset * DAY;
  return new Date(base + hour * 60 * 60 * 1000);
}

function setup(rows: { instances?: unknown[]; bookings?: unknown[]; ptSessions?: unknown[] }) {
  const instanceFindMany = vi.fn().mockResolvedValue(rows.instances ?? []);
  const bookingFindMany = vi.fn().mockResolvedValue(rows.bookings ?? []);
  const ptFindMany = vi.fn().mockResolvedValue(rows.ptSessions ?? []);
  const client = {
    classInstance: { findMany: instanceFindMany },
    booking: { findMany: bookingFindMany },
    ptSession: { findMany: ptFindMany },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  return {
    service: new DashboardClassesService(prisma),
    instanceFindMany,
    bookingFindMany,
    ptFindMany,
  };
}

function instance(over: Record<string, unknown> = {}) {
  return {
    startsAt: at(-1),
    endsAt: new Date(at(-1).getTime() + 60 * 60 * 1000),
    status: InstanceStatus.COMPLETED,
    capacityOverride: null,
    template: { title: 'Yoga', capacity: 10 },
    classType: null,
    ...over,
  };
}

function booking(over: Record<string, unknown> = {}) {
  const inst = (over.instance as Record<string, unknown>) ?? {};
  delete over.instance;
  return {
    status: BookingStatus.ATTENDED,
    classInstance: {
      startsAt: at(-1),
      endsAt: new Date(at(-1).getTime() + 60 * 60 * 1000),
      status: InstanceStatus.COMPLETED,
      template: { title: 'Yoga' },
      classType: null,
      ...inst,
    },
    ...over,
  };
}

const QUERY = { granularity: 'daily' } as const;

describe('DashboardClassesService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* -- Capacity and utilization ---------------------------------------- */

  it('resolves capacity override, then template, then type', async () => {
    const { service } = setup({
      instances: [
        instance({ capacityOverride: 5, template: { title: 'A', capacity: 10 } }),
        instance({ capacityOverride: null, template: { title: 'B', capacity: 10 } }),
        instance({
          capacityOverride: null,
          template: null,
          classType: { name: 'C', capacity: 20 },
        }),
      ],
      bookings: [booking()],
    });
    const result = await service.get(QUERY);
    // 5 + 10 + 20 seats of capacity, one seat booked.
    expect(result.kpis.utilizationRate).toBe(2.9);
  });

  it('reports null utilization rather than zero when nothing had capacity', async () => {
    const { service } = setup({
      instances: [instance({ capacityOverride: null, template: null, classType: null })],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.utilizationRate).toBeNull();
    expect(result.utilizationOverTime.every((point) => point.value === null)).toBe(true);
  });

  // A cancelled occurrence released its room and its trainer, so it never
  // committed the cost the metric exists to expose.
  it('drops a cancelled occurrence from utilization and from classes held', async () => {
    const { service } = setup({
      instances: [
        instance({ status: InstanceStatus.CANCELED, template: { title: 'A', capacity: 50 } }),
        instance({ template: { title: 'B', capacity: 10 } }),
      ],
      bookings: [booking()],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.classesHeld).toBe(1);
    expect(result.kpis.utilizationRate).toBe(10);
  });

  /* -- Which bookings count -------------------------------------------- */

  it('counts every booking that held a seat and no others', async () => {
    const { service } = setup({
      instances: [instance({ template: { title: 'Yoga', capacity: 10 } })],
      bookings: [
        booking({ status: BookingStatus.BOOKED }),
        booking({ status: BookingStatus.ATTENDED }),
        booking({ status: BookingStatus.NO_SHOW }),
        booking({ status: BookingStatus.WAITLIST }),
        booking({ status: BookingStatus.CANCELED }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.seatsBooked).toBe(3);
    expect(result.bookingsOverTime.find((p) => p.label === '2026-08-06')?.value).toBe(3);
  });

  /* -- Attendance and coverage ------------------------------------------ */

  it('rates attendance over the marked bookings alone', async () => {
    const { service } = setup({
      instances: [instance()],
      bookings: [
        booking({ status: BookingStatus.ATTENDED }),
        booking({ status: BookingStatus.ATTENDED }),
        booking({ status: BookingStatus.ATTENDED }),
        booking({ status: BookingStatus.NO_SHOW }),
        booking({ status: BookingStatus.BOOKED }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.attendanceOverTime.find((p) => p.label === '2026-08-06')?.value).toBe(75);
    expect(result.kpis.noShowRate).toBe(25);
  });

  it('reports a null attendance bucket rather than a zero one', async () => {
    const { service } = setup({
      instances: [instance()],
      bookings: [booking({ status: BookingStatus.BOOKED })],
    });
    const result = await service.get(QUERY);
    expect(result.attendanceOverTime.every((point) => point.value === null)).toBe(true);
    expect(result.kpis.noShowRate).toBeNull();
  });

  // Coverage is the honesty check on the rate above: it counts only what could
  // have been marked, which is a booking whose class has actually ended.
  it('measures coverage over finished occurrences only', async () => {
    const future = { startsAt: at(2), endsAt: at(2, 11) };
    const { service } = setup({
      instances: [instance(), instance(future)],
      bookings: [
        booking({ status: BookingStatus.ATTENDED }),
        booking({ status: BookingStatus.BOOKED }),
        booking({ status: BookingStatus.BOOKED, instance: future }),
        booking({ status: BookingStatus.BOOKED, instance: future }),
      ],
    });
    const result = await service.get(QUERY);
    // Two finished bookings, one marked — the two future ones are not countable.
    expect(result.markedCoverage).toBe(50);
  });

  it('reports null coverage when nothing has finished', async () => {
    const future = { startsAt: at(2), endsAt: at(2, 11) };
    const { service } = setup({
      instances: [instance(future)],
      bookings: [booking({ status: BookingStatus.BOOKED, instance: future })],
    });
    expect((await service.get(QUERY)).markedCoverage).toBeNull();
  });

  /* -- Ranking ----------------------------------------------------------- */

  it('ranks class types by seats booked and carries each ones utilization', async () => {
    const { service } = setup({
      instances: [
        instance({ template: { title: 'Yoga', capacity: 10 } }),
        instance({ template: null, classType: { name: 'Spin', capacity: 4 } }),
      ],
      bookings: [
        booking({ instance: { template: { title: 'Yoga' }, classType: null } }),
        booking({ instance: { template: null, classType: { name: 'Spin' } } }),
        booking({ instance: { template: null, classType: { name: 'Spin' } } }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.topClassTypes).toEqual([
      { name: 'Spin', seatsBooked: 2, sessions: 1, utilizationRate: 50 },
      { name: 'Yoga', seatsBooked: 1, sessions: 1, utilizationRate: 10 },
    ]);
  });

  it('caps the ranking at eight rows', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `Class ${i}`);
    const { service } = setup({
      instances: names.map((title) => instance({ template: { title, capacity: 10 } })),
      bookings: names.flatMap((title, i) =>
        Array.from({ length: i + 1 }, () =>
          booking({ instance: { template: { title }, classType: null } }),
        ),
      ),
    });
    const result = await service.get(QUERY);
    expect(result.topClassTypes).toHaveLength(8);
    expect(result.topClassTypes[0]?.name).toBe('Class 11');
  });

  /* -- Heatmap ----------------------------------------------------------- */

  it('lands a booking in its UTC weekday and hour', async () => {
    // at(-1) is Thursday 2026-08-06, 10:00 UTC — row 3 (Mon = 0), column 10.
    const { service } = setup({ instances: [instance()], bookings: [booking()] });
    const result = await service.get(QUERY);
    expect(result.demandByHour).toHaveLength(7);
    expect(result.demandByHour[0]).toHaveLength(24);
    expect(result.demandByHour[3]?.[10]).toBe(1);
    expect(result.demandByHour.flat().reduce((sum, n) => sum + n, 0)).toBe(1);
  });

  /* -- PT ---------------------------------------------------------------- */

  it('trends PT sessions and asks the database to exclude cancelled ones', async () => {
    const { service, ptFindMany } = setup({
      ptSessions: [{ startsAt: at(-1) }, { startsAt: at(-1) }],
    });
    const result = await service.get(QUERY);
    expect(result.ptSessionsOverTime.find((p) => p.label === '2026-08-06')?.value).toBe(2);
    expect(ptFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: { not: InstanceStatus.CANCELED } },
    });
  });

  /* -- Envelope ---------------------------------------------------------- */

  it('zero-fills an empty window and echoes the query', async () => {
    const { service } = setup({});
    const result = await service.get(QUERY);
    expect(result.granularity).toBe('daily');
    expect(result.bookingsOverTime).toHaveLength(31);
    expect(result.bookingsOverTime.every((p) => p.value === 0)).toBe(true);
    expect(result.ptSessionsOverTime.every((p) => p.value === 0)).toBe(true);
    expect(result.attendanceOverTime.every((p) => p.value === null)).toBe(true);
    expect(result.kpis).toEqual({
      classesHeld: 0,
      seatsBooked: 0,
      noShowRate: null,
      utilizationRate: null,
    });
    expect(result.topClassTypes).toEqual([]);
    expect(result.markedCoverage).toBeNull();
  });

  it('scopes both reads to the window', async () => {
    const { service, instanceFindMany, bookingFindMany } = setup({});
    await service.get(QUERY);
    expect(instanceFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { startsAt: { lt: NOW } },
    });
    expect(bookingFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { classInstance: { startsAt: { lt: NOW } } },
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter api test -- dashboard-classes`
Expected: FAIL — cannot resolve `./dashboard-classes.service`.

- [ ] **Step 3: Write the service**

```ts
import { Injectable } from '@nestjs/common';
import { BookingStatus, InstanceStatus } from '@fit/db';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  SALES_GRANULARITY_RANGE,
  type ClassTypeSlice,
  type DashboardClassesQuery,
  type DashboardClassesResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { bucketKey, emptyBuckets, rate, resolveWindow } from '../reports/report-window.util';

/** How many class types the ranking shows. The card's caption states it. */
const TOP_CLASS_TYPES = 8;

/** Fallback name for an occurrence whose template and type are both gone. */
const UNNAMED_CLASS = 'Class';

/** The booking states that HELD a seat. A waitlist entry did not. */
const SEAT_HOLDING: readonly BookingStatus[] = [
  BookingStatus.BOOKED,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
];

/** Running totals for one class type. */
interface TypeAgg {
  seatsBooked: number;
  sessions: number;
  capacity: number;
}

/**
 * Read side of the hand-built Classes dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, four trends, the ranked
 * class-type list and the weekday x hour demand heatmap.
 *
 * Three rules decide every figure here:
 *
 * **A seat is a `Booking` row, everywhere.** `ClassInstance.bookedCount` is a
 * maintained denormalisation and the drill-down's fill rate reads it, but this tab
 * already holds the rows — and an owner comparing the utilization card against the
 * bookings chart beside it must never find two numbers.
 *
 * **A rate with no denominator is `null`, not `0`.** 0% attendance is the claim
 * "nobody who booked turned up"; a week with nothing marked has made no claim at
 * all. `markedCoverage` reports how much of the window was ever marked, so the
 * attendance rate can be read with the confidence it has earned.
 *
 * **A cancelled occurrence is not an empty room.** It released its trainer and its
 * room, so it leaves utilization and `classesHeld` entirely.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`.
 */
@Injectable()
export class DashboardClassesService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Build the whole Classes tab for one granularity. */
  async get(query: DashboardClassesQuery): Promise<DashboardClassesResponse> {
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity]);
    const now = new Date();

    const [instances, bookings, ptSessions] = await Promise.all([
      this.prisma.client.classInstance.findMany({
        where: { startsAt: { gte: win.start, lt: win.end } },
        select: {
          startsAt: true,
          status: true,
          capacityOverride: true,
          template: { select: { title: true, capacity: true } },
          classType: { select: { name: true, capacity: true } },
        },
      }),
      this.prisma.client.booking.findMany({
        where: { classInstance: { startsAt: { gte: win.start, lt: win.end } } },
        select: {
          status: true,
          classInstance: {
            select: {
              startsAt: true,
              endsAt: true,
              status: true,
              template: { select: { title: true } },
              classType: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.client.ptSession.findMany({
        where: {
          startsAt: { gte: win.start, lt: win.end },
          status: { not: InstanceStatus.CANCELED },
        },
        select: { startsAt: true },
      }),
    ]);

    const bookingBuckets = emptyBuckets(win);
    const ptBuckets = emptyBuckets(win);
    const seatBuckets = emptyBuckets(win);
    const capacityBuckets = emptyBuckets(win);
    const attendedBuckets = emptyBuckets(win);
    const markedBuckets = emptyBuckets(win);
    const demandByHour = Array.from({ length: HEATMAP_ROWS }, () =>
      new Array<number>(HEATMAP_COLS).fill(0),
    );
    const perType = new Map<string, TypeAgg>();

    /* -- Occurrences: capacity, sessions, classes held -------------------- */

    let classesHeld = 0;
    for (const instance of instances) {
      if (instance.status === InstanceStatus.CANCELED) continue;
      classesHeld += 1;

      const capacity =
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;
      const key = bucketKey(instance.startsAt, win.bucket);
      if (capacityBuckets.has(key)) {
        capacityBuckets.set(key, (capacityBuckets.get(key) ?? 0) + capacity);
      }

      const agg = typeAgg(perType, className(instance));
      agg.sessions += 1;
      agg.capacity += capacity;
    }

    /* -- Bookings: demand, attendance, coverage --------------------------- */

    let seatsBooked = 0;
    let attended = 0;
    let noShow = 0;
    let markedOnFinished = 0;
    let finished = 0;
    for (const row of bookings) {
      const occurrence = row.classInstance;
      const isMarked =
        row.status === BookingStatus.ATTENDED || row.status === BookingStatus.NO_SHOW;

      // Coverage asks what COULD have been marked: a seat-holding booking on an
      // occurrence that has actually ended. Counted separately from the rate's own
      // denominator, which is every marked booking in the window — the two differ
      // if staff mark a class before it finishes.
      if (SEAT_HOLDING.includes(row.status) && occurrence.endsAt < now) {
        finished += 1;
        if (isMarked) markedOnFinished += 1;
      }

      if (!SEAT_HOLDING.includes(row.status)) continue;
      seatsBooked += 1;
      if (row.status === BookingStatus.ATTENDED) attended += 1;
      if (row.status === BookingStatus.NO_SHOW) noShow += 1;

      const key = bucketKey(occurrence.startsAt, win.bucket);
      if (bookingBuckets.has(key)) {
        bookingBuckets.set(key, (bookingBuckets.get(key) ?? 0) + 1);
        seatBuckets.set(key, (seatBuckets.get(key) ?? 0) + 1);
        if (isMarked) {
          markedBuckets.set(key, (markedBuckets.get(key) ?? 0) + 1);
          if (row.status === BookingStatus.ATTENDED) {
            attendedBuckets.set(key, (attendedBuckets.get(key) ?? 0) + 1);
          }
        }
      }

      // Monday-first row, to match the weekday labels the client renders.
      const weekday = (occurrence.startsAt.getUTCDay() + 6) % 7;
      const hour = occurrence.startsAt.getUTCHours();
      const row_ = demandByHour[weekday];
      if (row_) row_[hour] = (row_[hour] ?? 0) + 1;

      typeAgg(perType, className(occurrence)).seatsBooked += 1;
    }

    for (const session of ptSessions) {
      const key = bucketKey(session.startsAt, win.bucket);
      if (ptBuckets.has(key)) {
        ptBuckets.set(key, (ptBuckets.get(key) ?? 0) + 1);
      }
    }

    const totalCapacity = [...capacityBuckets.values()].reduce((sum, n) => sum + n, 0);
    const markedTotal = attended + noShow;

    return {
      granularity: query.granularity,
      kpis: {
        classesHeld,
        seatsBooked,
        noShowRate: markedTotal === 0 ? null : rate(noShow, markedTotal),
        utilizationRate: totalCapacity === 0 ? null : rate(seatsBooked, totalCapacity),
      },
      bookingsOverTime: [...bookingBuckets.entries()].map(([label, value]) => ({ label, value })),
      attendanceOverTime: [...markedBuckets.entries()].map(([label, total]) => ({
        label,
        value: total === 0 ? null : rate(attendedBuckets.get(label) ?? 0, total),
      })),
      utilizationOverTime: [...capacityBuckets.entries()].map(([label, capacity]) => ({
        label,
        value: capacity === 0 ? null : rate(seatBuckets.get(label) ?? 0, capacity),
      })),
      ptSessionsOverTime: [...ptBuckets.entries()].map(([label, value]) => ({ label, value })),
      topClassTypes: [...perType.entries()]
        .map(
          ([name, agg]): ClassTypeSlice => ({
            name,
            seatsBooked: agg.seatsBooked,
            sessions: agg.sessions,
            utilizationRate: agg.capacity === 0 ? null : rate(agg.seatsBooked, agg.capacity),
          }),
        )
        .sort((a, b) => b.seatsBooked - a.seatsBooked)
        .slice(0, TOP_CLASS_TYPES),
      demandByHour,
      markedCoverage: finished === 0 ? null : rate(markedOnFinished, finished),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a class is CALLED. The same fallback `report-drilldown.service.ts` uses, so
 * one class is named the same thing on both surfaces.
 */
function className(row: {
  template: { title: string } | null;
  classType: { name: string } | null;
}): string {
  return row.template?.title ?? row.classType?.name ?? UNNAMED_CLASS;
}

/** The running totals for one class type, created on first use. */
function typeAgg(perType: Map<string, TypeAgg>, name: string): TypeAgg {
  let agg = perType.get(name);
  if (!agg) {
    agg = { seatsBooked: 0, sessions: 0, capacity: 0 };
    perType.set(name, agg);
  }
  return agg;
}
```

- [ ] **Step 4: Run and commit**

Run: `pnpm --filter api test -- dashboard-classes` → PASS (14 tests).

```bash
pnpm exec prettier --write apps/api/src/dashboard/
git add apps/api/src/dashboard/
git commit -m "feat(api): aggregate the Classes dashboard tab"
```

---

### Task 3: Expose it on the controller

**Files:**

- Modify: `apps/api/src/dashboard/dashboard.controller.ts`, `dashboard.module.ts`
- Test: `apps/api/src/dashboard/dashboard.controller.spec.ts`

Mirror the Revenue route exactly (see `@Get('revenue')`, added in `6f2715d`):

- [ ] **Step 1:** Extend `setup()` in the controller spec with a `classesGet` stub and a fourth constructor argument, then add three cases — passes a valid query through, defaults an absent query, falls back on an unknown granularity — modelled on the `DashboardController.revenue` block directly above them.
- [ ] **Step 2:** Run `pnpm --filter api test -- dashboard.controller` → FAIL (`controller.classes is not a function`).
- [ ] **Step 3:** Add `dashboardClassesQuerySchema` / `DashboardClassesResponse` to the `@fit/types` import, `DashboardClassesService` to the constructor as `classesTab`, and the handler:

```ts
  /**
   * `GET /dashboard/classes?granularity=` — the hand-built Classes tab in one
   * payload: four KPIs, the bookings / attendance / utilization / PT trends, the
   * class-type ranking and the demand heatmap.
   *
   * The granularity scopes the WHOLE response, which is why the tab is one round
   * trip: a partial refresh could leave two cards describing different windows.
   */
  @Get('classes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReportView)
  async classes(@Query() query: unknown): Promise<DashboardClassesResponse> {
    return this.classesTab.get(dashboardClassesQuerySchema.parse(query));
  }
```

Register `DashboardClassesService` in `dashboard.module.ts`'s providers and name it in the module doc-comment's list of hand-built tabs.

- [ ] **Step 4:** `pnpm --filter api test -- dashboard && pnpm --filter api exec tsc --noEmit` → PASS. Commit as `feat(api): serve GET /dashboard/classes`.

---

### Task 4: The admin data layer

**Files:**

- Modify: `apps/admin/lib/api.ts`
- Create: `apps/admin/app/(dashboard)/class-insights/actions.ts`

- [ ] **Step 1:** Add `fetchDashboardClasses` directly after `fetchDashboardRevenue`, same shape — one `granularity` query param, `cache: 'no-store'`, `unwrap<DashboardClassesResponse>`:

```ts
/**
 * `GET /dashboard/classes` — the hand-built Classes tab in one payload. The
 * granularity scopes the whole response, so the tab never shows two cards
 * describing different windows.
 */
export async function fetchDashboardClasses(
  query: DashboardClassesQuery,
): Promise<DashboardClassesResponse> {
  const qs = new URLSearchParams({ granularity: query.granularity });
  const res = await fetch(`${apiBaseUrl()}/dashboard/classes?${qs.toString()}`, {
    headers: await authHeaders(),
    // Class figures reflect live tenant state — never serve a stale snapshot.
    cache: 'no-store',
  });
  return unwrap<DashboardClassesResponse>(res);
}
```

- [ ] **Step 2:** Create `class-insights/actions.ts` as a copy of `revenue-insights/actions.ts` with `loadClassesAction`, the `admin.dashboard.classes` namespace, `dashboardClassesQuerySchema` and `fetchDashboardClasses`. Keep the comment about a Server Action being a POST endpoint in its own right.
- [ ] **Step 3:** `pnpm --filter @fit/admin exec tsc --noEmit` → PASS. Commit as `feat(admin): fetch the Classes dashboard tab`.

---

### Task 5: The tab's copy, in both locales

**Files:** `packages/i18n/locales/en.json`, `ka.json`

`admin.dashboard.classes` is FREE — check first with
`python3 -c "import json;print('classes' in json.load(open('packages/i18n/locales/en.json'))['admin']['dashboard'])"`.
If it is taken (as `revenue` was by the Overview card), rename the incumbent to
name what it actually is rather than namespacing the tab around it.

- [ ] **Step 1:** Insert this block after `admin.dashboard.revenue` in `en.json`:

```json
"classes": {
  "granularityLabel": "Granularity",
  "granularity": { "daily": "Daily", "weekly": "Weekly", "monthly": "Monthly" },
  "window": { "daily": "Last 30 days", "weekly": "Last 12 weeks", "monthly": "Last 12 months" },
  "kpi": {
    "classesHeld": "Classes held",
    "seatsBooked": "Seats booked",
    "noShowRate": "No-show rate",
    "utilizationRate": "Utilization"
  },
  "kpiCaption": "{window} · cancelled classes are excluded throughout",
  "noValue": "—",
  "bookings": {
    "title": "Bookings over time",
    "caption": "Seats held, by when the class runs",
    "chartAria": "Seats booked per period",
    "empty": "No bookings in this window."
  },
  "attendance": {
    "title": "Attendance rate",
    "caption": "Of the bookings that were marked",
    "chartAria": "Attendance rate per period",
    "coverage": "{coverage}% of finished bookings were marked",
    "coverageUnknown": "No classes have finished in this window yet",
    "gapNote": "Gaps are periods with nothing marked — not 0%.",
    "empty": "Nothing has been marked in this window."
  },
  "utilization": {
    "title": "Utilization",
    "caption": "Seats booked against seats offered",
    "chartAria": "Utilization per period",
    "gapNote": "Gaps are periods with no capacity to fill — not 0%.",
    "empty": "No classes with capacity in this window."
  },
  "pt": {
    "title": "PT sessions",
    "caption": "Booked one-to-one sessions",
    "chartAria": "PT sessions per period",
    "empty": "No PT sessions in this window."
  },
  "topTypes": {
    "title": "Most booked classes",
    "caption": "Top 8 by seats booked",
    "row": "{sessions} sessions · {utilization} full",
    "empty": "No classes booked in this window."
  },
  "heatmap": {
    "title": "When demand lands",
    "caption": "Seats booked by weekday and hour (UTC)",
    "chartAria": "Seats booked by weekday and hour",
    "weekday": {
      "mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu",
      "fri": "Fri", "sat": "Sat", "sun": "Sun"
    },
    "empty": "No bookings to map in this window."
  },
  "loadError": "Couldn't load classes.",
  "retry": "Retry"
}
```

- [ ] **Step 2:** The Georgian block, same keys:

```json
"classes": {
  "granularityLabel": "დეტალურობა",
  "granularity": { "daily": "დღიური", "weekly": "კვირეული", "monthly": "თვიური" },
  "window": { "daily": "ბოლო 30 დღე", "weekly": "ბოლო 12 კვირა", "monthly": "ბოლო 12 თვე" },
  "kpi": {
    "classesHeld": "ჩატარებული კლასები",
    "seatsBooked": "დაჯავშნილი ადგილები",
    "noShowRate": "გამოუცხადებლობა",
    "utilizationRate": "დატვირთვა"
  },
  "kpiCaption": "{window} · გაუქმებული კლასები ყველგან გამორიცხულია",
  "noValue": "—",
  "bookings": {
    "title": "ჯავშნები დროში",
    "caption": "დაკავებული ადგილები, კლასის ჩატარების დროით",
    "chartAria": "დაჯავშნილი ადგილები პერიოდებში",
    "empty": "ამ პერიოდში ჯავშანი არ არის."
  },
  "attendance": {
    "title": "დასწრების მაჩვენებელი",
    "caption": "მხოლოდ აღნიშნული ჯავშნებიდან",
    "chartAria": "დასწრება პერიოდებში",
    "coverage": "დასრულებული ჯავშნების {coverage}% არის აღნიშნული",
    "coverageUnknown": "ამ პერიოდში კლასი ჯერ არ დასრულებულა",
    "gapNote": "ღრეჩოები — პერიოდები, სადაც არაფერი აღნიშნულა; არა 0%.",
    "empty": "ამ პერიოდში არაფერი აღნიშნულა."
  },
  "utilization": {
    "title": "დატვირთვა",
    "caption": "დაჯავშნილი ადგილები შეთავაზებულთან",
    "chartAria": "დატვირთვა პერიოდებში",
    "gapNote": "ღრეჩოები — პერიოდები, სადაც შესავსები არაფერი იყო; არა 0%.",
    "empty": "ამ პერიოდში ტევადობის მქონე კლასი არ არის."
  },
  "pt": {
    "title": "PT სესიები",
    "caption": "დაჯავშნილი ინდივიდუალური სესიები",
    "chartAria": "PT სესიები პერიოდებში",
    "empty": "ამ პერიოდში PT სესია არ არის."
  },
  "topTypes": {
    "title": "ყველაზე დაჯავშნადი კლასები",
    "caption": "ტოპ 8 ადგილების მიხედვით",
    "row": "{sessions} სესია · {utilization} შევსება",
    "empty": "ამ პერიოდში კლასი არ დაჯავშნილა."
  },
  "heatmap": {
    "title": "როდის მოდის მოთხოვნა",
    "caption": "დაჯავშნილი ადგილები დღისა და საათის მიხედვით (UTC)",
    "chartAria": "დაჯავშნილი ადგილები დღისა და საათის მიხედვით",
    "weekday": {
      "mon": "ორშ", "tue": "სამ", "wed": "ოთხ", "thu": "ხუთ",
      "fri": "პარ", "sat": "შაბ", "sun": "კვი"
    },
    "empty": "ამ პერიოდში ასახვადი ჯავშანი არ არის."
  },
  "loadError": "კლასების ჩატვირთვა ვერ მოხერხდა.",
  "retry": "ხელახლა"
}
```

- [ ] **Step 3:** `pnpm --filter @fit/i18n test` → PASS. Commit as `feat(i18n): add the Classes dashboard tab copy`.

---

### Task 6: The KPI strip and the three main trends

**Files:** `class-insights/classes-kpi-strip.tsx`, `bookings-trend-card.tsx`, `attendance-rate-card.tsx`, `utilization-card.tsx`

**Interfaces:** `<ClassesKpiStrip kpis granularity />`, `<BookingsTrendCard points granularity onSelectGranularity disabled />`, `<AttendanceRateCard points coverage />`, `<UtilizationCard points />`.

- [ ] **Step 1: The KPI strip.** Copy `revenue-insights/revenue-kpi-strip.tsx`. It takes **no** `money` prop — this tab has no currency. Two tiles are counts and two are nullable rates, so the cell body branches:

`T` is the translator type `overview/format.ts` already exports — import it from
there rather than re-deriving `ReturnType<typeof useTranslations>`.

```tsx
/** The tiles, in reading order. `rate` marks the two carried as percentages. */
const TILES = [
  { key: 'classesHeld', rate: false },
  { key: 'seatsBooked', rate: false },
  { key: 'noShowRate', rate: true },
  { key: 'utilizationRate', rate: true },
] as const satisfies readonly { key: keyof ClassesKpis; rate: boolean }[];
```

```tsx
<span {...stylex.props(styles.value)}>
  {tile.rate
    ? // `null` is "nothing to measure" — rendering it as 0% would be a
      // claim about a fact nobody recorded.
      formatRate(t, kpis[tile.key])
    : (kpis[tile.key] ?? 0).toLocaleString()}
</span>
```

with, above the component:

```tsx
/** A nullable percentage as text: one decimal, or the em-dash placeholder. */
function formatRate(t: T, value: number | null): string {
  return value === null ? t('noValue') : `${value}%`;
}
```

- [ ] **Step 2: The bookings trend.** Copy `revenue-insights/recurring-revenue-card.tsx` (single `AreaChart`, no legend), add the `SegmentedControl` head from `revenue-trend-card.tsx`, and read `admin.dashboard.classes` with the `bookings.*` keys. It owns the granularity control; its state lives on the view.

- [ ] **Step 3: The attendance card.** Same single-`AreaChart` shape. Two differences that matter:

```tsx
const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
// A series that is null the whole way through has nothing to draw a gap AGAINST.
const hasData = data.some((point) => point.value !== null);
```

and, under the chart, the coverage line before the gap note:

```tsx
          <p {...stylex.props(styles.caption)}>
            {coverage === null
              ? t('attendance.coverageUnknown')
              : t('attendance.coverage', { coverage })}
          </p>
          <p {...stylex.props(styles.caption)}>{t('attendance.gapNote')}</p>
```

Header comment:

```tsx
// How many of the booked seats turned up.
//
// The denominator is the MARKED bookings alone — attended plus no-show. An
// unmarked booking on a past class is not a no-show, it is a class nobody wrote
// up, and counting it either way would make this rate a measure of staff
// diligence rather than member behaviour.
//
// Which is why the coverage line under the chart is not decoration: it says how
// much of the window was ever marked, so the rate above it can be read with the
// confidence it has actually earned. A gym marking nothing sees 0% coverage
// rather than a confident number built on three bookings.
//
// `AreaChart` draws a gap for a null bucket rather than a line through zero —
// the same treatment the Members tab's retention trend gets, for the same reason.
```

- [ ] **Step 4: The utilization card.** Identical shape to Step 3 minus the coverage line, with `utilization.*` keys and this header:

```tsx
// Seats booked against seats offered.
//
// The expensive number on this tab: a gym commits a trainer and a room to every
// occurrence whether or not anyone books it, so an hour at 20% is a paid hour
// mostly spent empty.
//
// Cancelled occurrences are excluded on both sides — a class called off released
// its room, so it never committed the cost this metric exists to expose. A bucket
// whose classes resolved NO capacity is a gap, not 0%: nothing to fill is a
// different fact from nothing filled.
```

- [ ] **Step 5:** `pnpm --filter @fit/admin exec tsc --noEmit && pnpm --filter @fit/admin lint` → PASS. Commit as `feat(admin): add the Classes KPI strip and its trends`.

---

### Task 7: The rail cards and the heatmap

**Files:** `class-insights/pt-sessions-card.tsx`, `top-class-types-card.tsx`, `demand-heatmap-card.tsx`

- [ ] **Step 1: PT sessions.** The bookings card without the control — title/caption/chart/axis only, `pt.*` keys.

- [ ] **Step 2: The ranked list.** Copy `revenue-insights/revenue-by-location-card.tsx`'s frame, but the rows carry a second line, so `BarChart` alone will not do. Render the bars with `BarChart` for the seat counts and put the per-row detail in the label:

```tsx
const data: BarDatum[] = slices.map((slice) => ({
  label: slice.name,
  value: slice.seatsBooked,
}));
```

and beneath the chart, the per-type detail as a plain list so the sessions count
and fill rate are readable without a tooltip:

```tsx
<ul {...stylex.props(styles.rows)}>
  {slices.map((slice) => (
    <li key={slice.name} {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.rowName)}>{slice.name}</span>
      <span {...stylex.props(styles.rowMeta)}>
        {t('topTypes.row', {
          sessions: slice.sessions,
          utilization: slice.utilizationRate === null ? t('noValue') : `${slice.utilizationRate}%`,
        })}
      </span>
    </li>
  ))}
</ul>
```

with `rows` (`display: flex; flexDirection: column; gap: 0.375rem; marginTop: 0.75rem`), `row` (`display: flex; justifyContent: space-between; gap: 0.5rem; fontSize: 0.75rem`), `rowName` (`color: var(--color-text-primary)`) and `rowMeta` (`fontFamily: var(--font-family-code); color: var(--color-text-secondary)`).

- [ ] **Step 3: The heatmap.** New card around the existing `Heatmap` primitive:

```tsx
'use client';

// When demand actually lands, by weekday and hour.
//
// Built from CLASS START TIMES, not check-ins: a check-in heatmap describes
// building traffic — every member who came for the floor — and `/reports/attendance`
// already draws exactly that. Two surfaces showing the same picture under
// different titles is worse than one.
//
// The grid is UTC, and the caption says so. Every bucket in this dashboard is,
// because `report-window.util` is; a gym-local grid is a timezone change across
// all of Reports rather than a fix belonging to this card.
//
// Weekday names come from i18n here rather than from the API, so the contract
// stays locale-free — the Reports drill-down puts English labels on the wire and
// this deliberately does not copy that.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { HEATMAP_COLS } from '@fit/types';
import { Heatmap } from '../charts';
import { EmptyState } from '../overview/format';

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function DemandHeatmapCard({ cells }: { cells: number[][] }) {
  const t = useTranslations('admin.dashboard.classes');
  const hasData = cells.some((row) => row.some((value) => value > 0));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('heatmap.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('heatmap.caption')}</p>
      </div>
      {hasData ? (
        <Heatmap
          rowLabels={WEEKDAY_KEYS.map((key) => t(`heatmap.weekday.${key}`))}
          colLabels={Array.from({ length: HEATMAP_COLS }, (_, hour) => String(hour))}
          cells={cells}
          ariaLabel={t('heatmap.chartAria')}
        />
      ) : (
        <EmptyState>{t('heatmap.empty')}</EmptyState>
      )}
    </Card>
  );
}
```

(with the same `card` / `head` / `title` / `caption` StyleX block every other card here uses).

- [ ] **Step 4:** type-check + lint → PASS. Commit as `feat(admin): add the Classes rail cards and demand heatmap`.

---

### Task 8: Assemble the tab

**Files:** `class-insights/classes-view.tsx`, `classes-view.test.tsx`

- [ ] **Step 1: Write the failing test.** Copy `revenue-insights/revenue-view.test.tsx` wholesale, swap the messages fixture for the `classes` block from Task 5, and the response fixture for:

```tsx
function response(over: Partial<DashboardClassesResponse> = {}): DashboardClassesResponse {
  return {
    granularity: 'daily',
    kpis: { classesHeld: 12, seatsBooked: 80, noShowRate: 12.5, utilizationRate: 66.7 },
    bookingsOverTime: [{ label: '2026-08-01', value: 80 }],
    attendanceOverTime: [{ label: '2026-08-01', value: 87.5 }],
    utilizationOverTime: [{ label: '2026-08-01', value: 66.7 }],
    ptSessionsOverTime: [{ label: '2026-08-01', value: 4 }],
    topClassTypes: [{ name: 'Yoga', seatsBooked: 40, sessions: 5, utilizationRate: 80 }],
    demandByHour: Array.from({ length: 7 }, () => new Array<number>(24).fill(0)).map((row, i) =>
      i === 3 ? row.map((_, hour) => (hour === 10 ? 5 : 0)) : row,
    ),
    markedCoverage: 62.5,
    ...over,
  };
}
```

Cases: loads and renders every card; refetches on a granularity change and serves a revisited value from cache; first-load failure is the tab with a Retry; a later failure is a banner over the previous figures; the action call rejecting still yields an alert. Plus the two this tab adds:

```tsx
// `null` means "nothing to measure". Rendering it as 0% would claim nobody
// turned up in a window where nobody was marked.
it('renders a null rate as a dash, never as zero', async () => {
  loadClassesAction.mockResolvedValue({
    ok: true,
    data: response({
      kpis: { classesHeld: 0, seatsBooked: 0, noShowRate: null, utilizationRate: null },
      markedCoverage: null,
    }),
  });
  renderView();
  expect(await screen.findByText('Bookings over time')).toBeInTheDocument();
  expect(screen.queryByText('0%')).not.toBeInTheDocument();
  expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText('No classes have finished in this window yet')).toBeInTheDocument();
});

it('labels the heatmap rows in the viewer locale', async () => {
  renderView();
  expect(await screen.findByLabelText('Seats booked by weekday and hour')).toBeInTheDocument();
  expect(screen.getByText('Mon')).toBeInTheDocument();
  expect(screen.getByText('Sun')).toBeInTheDocument();
});
```

- [ ] **Step 2:** Run → FAIL (cannot resolve `./classes-view`).

- [ ] **Step 3: Write the view.** Copy `revenue-insights/revenue-view.tsx` and change only:

- the header comment's first line and its control paragraph (one control here, not two);
- imports and state: `DEFAULT_CLASSES_GRANULARITY`, `ClassesGranularity`, `DashboardClassesResponse`, `loadClassesAction`, the seven card components;
- `const key = granularity;` and `shownKey = data === null ? '' : data.granularity;`
- **delete the `money` memo entirely** — this tab has no currency, so `useLocale` goes with it;
- the body:

```tsx
      <div {...stylex.props(step(0))}>
        <ClassesKpiStrip kpis={data.kpis} granularity={data.granularity} />
      </div>

      <div {...stylex.props(styles.workArea)}>
        <div {...stylex.props(styles.column)}>
          <div {...stylex.props(step(1))}>
            <BookingsTrendCard
              points={data.bookingsOverTime}
              granularity={granularity}
              onSelectGranularity={setGranularity}
              disabled={pending}
            />
          </div>
          <div {...stylex.props(step(2))}>
            <AttendanceRateCard points={data.attendanceOverTime} coverage={data.markedCoverage} />
          </div>
          <div {...stylex.props(step(3))}>
            <UtilizationCard points={data.utilizationOverTime} />
          </div>
          <div {...stylex.props(step(4))}>
            <DemandHeatmapCard cells={data.demandByHour} />
          </div>
        </div>

        {/*
          The rail is what the timetable looks like standing still — which classes
          fill, and whether the one-to-one side is growing. Both read fine in a
          narrow column; the heatmap does not, which is why it sits on the left.
        */}
        <div {...stylex.props(styles.rail)}>
          <div {...stylex.props(step(2))}>
            <TopClassTypesCard slices={data.topClassTypes} />
          </div>
          <div {...stylex.props(step(3))}>
            <PtSessionsCard points={data.ptSessionsOverTime} />
          </div>
        </div>
      </div>
```

- [ ] **Step 4:** `pnpm --filter @fit/admin test -- classes-view` → PASS. Commit as `feat(admin): assemble the Classes tab view`.

---

### Task 9: Promote the tab in the shell

**Files:** `packages/types/src/dashboard-segments.{ts,spec.ts}`, `segmented-dashboard.{tsx,test.tsx}`, `segment-panel.test.tsx`, `add-widget-dialog.test.tsx`, `dashboard-header.test.tsx`, `apps/api/src/dashboard/dashboard-segments.{service,controller}.spec.ts`, both locales.

- [ ] **Step 1: Write the failing tests.**
  - `dashboard-segments.spec.ts`: the catalogue case moves to `staff` (`widgetsForSegment('staff')` → `['staff.sessions-per-trainer']`); the tab-order assertion becomes `DASHBOARD_SEGMENTS.slice(0, 5)` → `['overview', 'sales', 'members', 'revenue', 'classes']`; add "no longer defines any classes widget".
  - `segmented-dashboard.test.tsx`: mock `../class-insights/classes-view`, add a "renders the hand-built classes view, not the widget panel" case, extend the hand-built loop to `['sales', 'members', 'revenue', 'classes']`, and move every remaining `classes` exemplar to `staff`.
  - `dashboard-header.test.tsx`: extend the `it.each` list to include `classes`; move the two `renderHeader('classes')` cases to `'staff'`.
- [ ] **Step 2:** Run both suites → FAIL.
- [ ] **Step 3: Make the change.**
  - `CONFIGURABLE_DASHBOARD_SEGMENTS = ['staff'] as const;`
  - `HAND_BUILT_SEGMENTS = ['overview', 'sales', 'members', 'revenue', 'classes'] as const;`
  - Delete the two `classes.*` catalogue entries and their `classesMostBooked` / `classesPeakHours` labels from both locales.
  - `segmented-dashboard.tsx`: import `ClassesView`, add `{active === 'classes' ? <ClassesView /> : null}`.
- [ ] **Step 4: Migrate the remaining fixtures.** `segment-panel.test.tsx`, `add-widget-dialog.test.tsx` and the two API segment specs use `classes` as their exemplar; move them to `staff` (widget `staff.sessions-per-trainer`, metric `staff`).

  Two cases lose their fixture and must be **deleted with a comment in their place**, not bent into passing:
  - `dashboard-segments.service.spec.ts` → "computes each distinct metric exactly once" (the cross-metric branch needed `classes`, whose two widgets spanned `classes` and `attendance`; `staff` has one widget).
  - `add-widget-dialog.test.tsx` → the arrow-key wrap and Home/End cases assume two or more tabs. With one configurable segment there is no bar to move within. Replace both with one case pinning what a single-segment picker actually does:

```tsx
// One configurable segment left: the tab bar has nothing to move within, and
// the roving-tabindex contract degenerates to "the only tab is the tab stop".
// Restore the arrow-key cases from git history if a second segment ever returns.
it('keeps the only segment tab in the tab order', async () => {
  renderDialog({ staff: ALL_STAFF });
  await userEvent.click(screen.getByRole('button', { name: 'Add widget' }));
  expect(screen.getAllByRole('tab')).toHaveLength(1);
  expect(screen.getByRole('tab', { name: 'Staff' })).toHaveAttribute('tabindex', '0');
});
```

Note `staff` has ONE catalogue widget, so the picker's "at least one widget" rule means its only checkbox is always disabled. Keep the `will not let the last widget in a segment be unchecked` case — it is now the normal state rather than an edge one — and drop `saves only the segments whose selection changed`, which cannot be exercised without a second checkbox to untick.

- [ ] **Step 5:** `pnpm type-check && pnpm test && pnpm lint && pnpm format:check` → PASS everywhere.
- [ ] **Step 6:** Commit as `feat(admin): route the Classes tab to its hand-built view`.

---

## Verification

```bash
pnpm type-check
pnpm test
pnpm lint
pnpm format:check
rm -rf apps/admin/.next && pnpm --filter @fit/admin build
```

The `.next` removal is not superstition: a stale cache makes `next build` fail on
unrelated routes with `PageNotFoundError`.
