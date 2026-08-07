import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, InstanceStatus } from '@fit/db';
import { DashboardClassesService } from './dashboard-classes.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** Frozen "now" — a Friday — so weekday and finished/unfinished are exact. */
const NOW = new Date('2026-08-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** An instant `offset` days from today's UTC start, at `hour` UTC. */
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
    status: InstanceStatus.COMPLETED,
    capacityOverride: null,
    template: { title: 'Yoga', capacity: 10 },
    classType: null,
    ...over,
  };
}

function booking(over: Record<string, unknown> = {}) {
  const { instance: inst, ...rest } = over as { instance?: Record<string, unknown> };
  return {
    status: BookingStatus.ATTENDED,
    classInstance: {
      startsAt: at(-1),
      endsAt: new Date(at(-1).getTime() + 60 * 60 * 1000),
      template: { title: 'Yoga' },
      classType: null,
      ...inst,
    },
    ...rest,
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
      instances: [instance(), instance({ startsAt: at(2) })],
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
      instances: [instance({ startsAt: at(2) })],
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
