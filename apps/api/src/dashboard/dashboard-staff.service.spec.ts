import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceStatus, Role, TimeOffStatus, TrainerStatus } from '@fit/db';
import { DashboardStaffService } from './dashboard-staff.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { GymLocaleService } from '../gyms/gym-locale.service';

/**
 * A stub gym locale. Every calendar bound on this surface — "today", "this
 * month", the bucket a payment lands in — is now asked of the GYM'S zone rather
 * than the server's, so a spec that pins a date has to say which zone it means.
 * `UTC` here keeps the existing fixtures' arithmetic unchanged; the specs that
 * care about the zone pass their own.
 */
function stubLocale(timezone = 'UTC', currency = 'GEL') {
  return {
    get: vi.fn().mockResolvedValue({ language: 'ka', currency, timezone }),
  } as unknown as GymLocaleService;
}

/** Frozen "now" — a Friday — so every weekday count in the window is exact. */
const NOW = new Date('2026-08-07T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** An instant `offset` days from today's UTC start, at `hour` UTC. */
function at(offset: number, hour = 10): Date {
  const base = new Date('2026-08-07T00:00:00.000Z').getTime() + offset * DAY;
  return new Date(base + hour * 60 * 60 * 1000);
}

function setup(
  rows: {
    instances?: unknown[];
    ptSessions?: unknown[];
    trainers?: unknown[];
    shiftSlots?: unknown[];
    timeOff?: unknown[];
    staffCount?: number;
  },
  locales: GymLocaleService = stubLocale(),
) {
  const instanceFindMany = vi.fn().mockResolvedValue(rows.instances ?? []);
  const ptFindMany = vi.fn().mockResolvedValue(rows.ptSessions ?? []);
  const trainerFindMany = vi.fn().mockResolvedValue(rows.trainers ?? []);
  const shiftFindMany = vi.fn().mockResolvedValue(rows.shiftSlots ?? []);
  const timeOffFindMany = vi.fn().mockResolvedValue(rows.timeOff ?? []);
  const memberCount = vi.fn().mockResolvedValue(rows.staffCount ?? 0);

  const client = {
    classInstance: { findMany: instanceFindMany },
    ptSession: { findMany: ptFindMany },
    trainer: { findMany: trainerFindMany },
    shiftSlot: { findMany: shiftFindMany },
    timeOffRequest: { findMany: timeOffFindMany },
    gymMember: { count: memberCount },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  return {
    service: new DashboardStaffService(prisma, locales),
    instanceFindMany,
    ptFindMany,
    trainerFindMany,
    shiftFindMany,
    timeOffFindMany,
    memberCount,
  };
}

/** A class occurrence: one hour, taught by `t1`, yesterday. */
function instance(over: Record<string, unknown> = {}) {
  return {
    trainerId: 't1',
    startsAt: at(-1, 10),
    endsAt: at(-1, 11),
    ...over,
  };
}

function session(over: Record<string, unknown> = {}) {
  return { trainerId: 't1', startsAt: at(-1, 12), endsAt: at(-1, 13), ...over };
}

/** A trainer available Mondays 09:00–17:00. */
function trainer(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    name: 'Ana',
    availability: { mon: { available: true, windows: [{ start: '09:00', end: '17:00' }] } },
    ...over,
  };
}

const QUERY = { granularity: 'daily' } as const;

describe('DashboardStaffService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* -- Availability arithmetic ------------------------------------------ */

  // A weekday's windows multiply by how many times that weekday falls in the
  // window — the whole point of comparing a WEEKLY availability against a 30-day
  // delivery record.
  it('multiplies each weekday of availability by its count in the window', async () => {
    const { service } = setup({
      trainers: [trainer()],
      instances: [instance({ startsAt: at(-1, 9), endsAt: at(-1, 13) })],
    });
    const result = await service.get(QUERY);
    // The 2026-07-08…2026-08-07 window holds FOUR Mondays — Jul 13, 20, 27 and
    // Aug 3 — so 4 x 8h = 32h available against 4h delivered.
    expect(result.trainers[0]?.hours).toBe(4);
    expect(result.trainers[0]?.utilizationRate).toBe(12.5);
  });

  it('sums two windows in a day and ignores an unavailable one', async () => {
    const { service } = setup({
      trainers: [
        trainer({
          availability: {
            mon: {
              available: true,
              windows: [
                { start: '09:00', end: '11:00' },
                { start: '14:00', end: '16:00' },
              ],
            },
            tue: { available: false, windows: [{ start: '09:00', end: '17:00' }] },
          },
        }),
      ],
      instances: [instance({ startsAt: at(-1, 9), endsAt: at(-1, 11) })],
    });
    const result = await service.get(QUERY);
    // Four Mondays x 4h = 16h available, 2h delivered.
    expect(result.trainers[0]?.utilizationRate).toBe(12.5);
  });

  // The stored default for a new trainer is `{}`, and a Json column can hold
  // anything. Neither is 0% utilization, and neither may throw.
  it('yields null for an unset or malformed availability and counts it', async () => {
    const { service } = setup({
      trainers: [
        trainer({ availability: {} }),
        trainer({ id: 't2', name: 'Bo', availability: { mon: 'nonsense' } }),
      ],
      instances: [instance()],
    });
    const result = await service.get(QUERY);
    expect(result.trainers.every((row) => row.utilizationRate === null)).toBe(true);
    expect(result.kpis.utilizationRate).toBeNull();
    expect(result.gaps.trainersWithoutAvailability).toBe(2);
  });

  // Weighted by hours, not averaged across rates: one trainer with two available
  // hours must not swing the gym's number like one with forty.
  it('weights the gym-wide rate by hours and excludes the unrated', async () => {
    const { service } = setup({
      trainers: [
        trainer(),
        trainer({
          id: 't2',
          name: 'Bo',
          availability: { mon: { available: true, windows: [{ start: '09:00', end: '10:00' }] } },
        }),
        trainer({ id: 't3', name: 'Cy', availability: {} }),
      ],
      // 4h against Ana's 32h; 5h against Bo's 4h — Bo is over his stated hours,
      // which is exactly the case a mean-of-rates would hide.
      instances: [
        instance({ startsAt: at(-1, 9), endsAt: at(-1, 13) }),
        instance({ trainerId: 't2', startsAt: at(-1, 9), endsAt: at(-1, 14) }),
      ],
    });
    const result = await service.get(QUERY);
    // 9h delivered against 36h available = 25%, not the mean of 12.5% and 125%.
    expect(result.kpis.utilizationRate).toBe(25);
  });

  /* -- Delivery ---------------------------------------------------------- */

  it('splits the trend into classes and PT', async () => {
    const { service } = setup({
      trainers: [trainer()],
      instances: [instance(), instance()],
      ptSessions: [session()],
    });
    const result = await service.get(QUERY);
    const bucket = result.sessionsOverTime.find((point) => point.label === '2026-08-06');
    expect(bucket).toEqual({ label: '2026-08-06', classes: 2, pt: 1 });
    expect(result.kpis.sessionsDelivered).toBe(3);
    expect(result.trainers[0]).toMatchObject({ classes: 2, pt: 1, sessions: 3, hours: 3 });
  });

  it('asks the database to exclude cancelled classes and sessions', async () => {
    const { service, instanceFindMany, ptFindMany } = setup({});
    await service.get(QUERY);
    for (const spy of [instanceFindMany, ptFindMany]) {
      expect(spy.mock.calls[0]?.[0]).toMatchObject({
        where: { status: { not: InstanceStatus.CANCELED } },
      });
    }
  });

  // Somebody taught it; this tab does not know who, and will not guess.
  it('leaves an unassigned class out of both series and counts it', async () => {
    const { service } = setup({
      trainers: [trainer()],
      instances: [instance({ trainerId: null })],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.sessionsDelivered).toBe(0);
    expect(result.gaps.classesWithoutTrainer).toBe(1);
  });

  it('counts an occurrence that ends after the window closes at its full length', async () => {
    const { service } = setup({
      trainers: [trainer()],
      instances: [instance({ startsAt: at(0, 11), endsAt: at(0, 14) })],
    });
    const result = await service.get(QUERY);
    expect(result.trainers[0]?.hours).toBe(3);
  });

  it('ranks trainers by sessions and caps the list at eight', async () => {
    const { service } = setup({
      trainers: Array.from({ length: 10 }, (_, i) =>
        trainer({ id: `t${i}`, name: `T${i}`, availability: {} }),
      ),
      instances: Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: i + 1 }, () => instance({ trainerId: `t${i}` })),
      ).flat(),
    });
    const result = await service.get(QUERY);
    expect(result.trainers).toHaveLength(8);
    expect(result.trainers[0]?.name).toBe('T9');
    expect(result.kpis.trainersDelivering).toBe(10);
  });

  /* -- The rota ---------------------------------------------------------- */

  it('sums scheduled hours per weekday and counts the staff on each', async () => {
    const { service } = setup({
      shiftSlots: [
        { staffId: 's1', dayOfWeek: 0, startTime: '09:00', endTime: '17:00' },
        { staffId: 's2', dayOfWeek: 0, startTime: '12:00', endTime: '20:00' },
        { staffId: 's1', dayOfWeek: 3, startTime: '09:00', endTime: '12:30' },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.shiftCoverage).toHaveLength(7);
    expect(result.shiftCoverage[0]).toEqual({ dayOfWeek: 0, hours: 16, staffCount: 2 });
    expect(result.shiftCoverage[3]).toEqual({ dayOfWeek: 3, hours: 3.5, staffCount: 1 });
    expect(result.shiftCoverage[1]).toEqual({ dayOfWeek: 1, hours: 0, staffCount: 0 });
    expect(result.kpis.scheduledHoursPerWeek).toBe(19.5);
  });

  // An overnight shift or a typo. Counted, not wrapped into a negative day.
  it('rejects a shift that does not move forward into the gaps', async () => {
    const { service } = setup({
      shiftSlots: [
        { staffId: 's1', dayOfWeek: 0, startTime: '22:00', endTime: '06:00' },
        { staffId: 's1', dayOfWeek: 1, startTime: '09:00', endTime: '09:00' },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.scheduledHoursPerWeek).toBe(0);
    expect(result.gaps.invalidShiftSlots).toBe(2);
  });

  it('counts staff with no shift at all', async () => {
    const { service, memberCount } = setup({
      staffCount: 5,
      shiftSlots: [
        { staffId: 's1', dayOfWeek: 0, startTime: '09:00', endTime: '17:00' },
        { staffId: 's2', dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.gaps.staffWithoutShifts).toBe(3);
    expect(memberCount.mock.calls[0]?.[0]).toMatchObject({
      where: { role: { not: Role.MEMBER }, deletedAt: null },
    });
  });

  /* -- Leave -------------------------------------------------------------- */

  it('counts approved leave in staff-days, clipped to the window', async () => {
    const { service, timeOffFindMany } = setup({
      timeOff: [
        // Three days, entirely inside the window.
        { startDate: at(-5), endDate: at(-3) },
        // Opened before the window; only the days inside it count.
        { startDate: at(-60), endDate: at(-29) },
      ],
    });
    const result = await service.get(QUERY);
    // 3 + the 2026-07-08…2026-07-09 overlap.
    expect(result.gaps.leaveStaffDays).toBe(5);
    expect(timeOffFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: TimeOffStatus.approved },
    });
  });

  it('counts a single-day request as one staff-day', async () => {
    const { service } = setup({ timeOff: [{ startDate: at(-2), endDate: at(-2) }] });
    expect((await service.get(QUERY)).gaps.leaveStaffDays).toBe(1);
  });

  /* -- Envelope ------------------------------------------------------------ */

  it('reads only active trainers', async () => {
    const { service, trainerFindMany } = setup({});
    await service.get(QUERY);
    expect(trainerFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: TrainerStatus.ACTIVE },
    });
  });

  it('zero-fills an empty window and echoes the query', async () => {
    const { service } = setup({});
    const result = await service.get(QUERY);
    expect(result.granularity).toBe('daily');
    expect(result.sessionsOverTime).toHaveLength(31);
    expect(result.sessionsOverTime.every((p) => p.classes === 0 && p.pt === 0)).toBe(true);
    expect(result.kpis).toEqual({
      trainersDelivering: 0,
      sessionsDelivered: 0,
      utilizationRate: null,
      scheduledHoursPerWeek: 0,
    });
    expect(result.trainers).toEqual([]);
    expect(result.shiftCoverage).toHaveLength(7);
    expect(result.gaps).toEqual({
      leaveStaffDays: 0,
      staffWithoutShifts: 0,
      trainersWithoutAvailability: 0,
      classesWithoutTrainer: 0,
      invalidShiftSlots: 0,
    });
  });
});

describe('DashboardStaffService.get — the branch filter', () => {
  afterEach(() => vi.clearAllMocks());

  /** Every `where` a mocked read was issued with. */
  function wheres(fn: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
    return fn.mock.calls.map(
      (call) => (call[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {},
    );
  }

  // Of the six reads this tab issues, exactly one — `ClassInstance` — can answer
  // "which branch". Filtering it alone would not make the tab per-branch; it would
  // make `sessionsDelivered` one branch's classes plus every branch's PT, and
  // `utilizationRate` one branch's delivered minutes over every trainer's gym-wide
  // availability. Both would LOOK filtered. So nothing is filtered until Stage 6,
  // and this spec pins that decision rather than leaving it to be re-litigated.
  //
  // Stage 2 did NOT change this, and `memberCount` below is the read that proves
  // it: `GymMember.locationId` now exists, so the staff head-count is technically
  // filterable — and must not be. That column is the member's HOME branch, and for
  // a staff row it is a backfill artefact pointing every employee at the gym's
  // default branch. Filtering it would report the whole payroll at one branch and
  // zero staff everywhere else. Where somebody WORKS is
  // `GymMember.assignedLocationIds`, which Stage 6 replaces with a real join table.
  it('is accepted and applied to nothing, including the one read that could carry it', async () => {
    const {
      service,
      instanceFindMany,
      ptFindMany,
      trainerFindMany,
      shiftFindMany,
      timeOffFindMany,
      memberCount,
    } = setup({});

    await service.get({ ...QUERY, locationId: 'loc_1' });

    for (const fn of [
      instanceFindMany,
      ptFindMany,
      trainerFindMany,
      shiftFindMany,
      timeOffFindMany,
      memberCount,
    ]) {
      for (const where of wheres(fn)) {
        expect(where).not.toHaveProperty('locationId');
        expect(where).not.toHaveProperty('order');
      }
    }
  });

  // Explicitly: the home branch is not the work assignment. This is the assertion
  // most at risk of being "fixed" now that the column exists.
  it('does not mistake a staff member’s home branch for their work assignment', async () => {
    const { service, memberCount } = setup({});

    await service.get({ ...QUERY, locationId: 'loc_1' });

    for (const where of wheres(memberCount)) {
      expect(where).not.toHaveProperty('locationId');
      expect(where).not.toHaveProperty('assignedLocationIds');
    }
  });

  it('returns the same figures with and without a branch, until Stage 6', async () => {
    const rows = { instances: [instance()], ptSessions: [session()], trainers: [trainer()] };
    const gymWide = await setup(rows).service.get(QUERY);
    const branch = await setup(rows).service.get({ ...QUERY, locationId: 'loc_1' });

    expect(branch.kpis).toEqual(gymWide.kpis);
    expect(branch.trainers).toEqual(gymWide.trainers);
  });

  // Not nulled to signal "not split by branch": `utilizationRate`'s `null` already
  // means "no availability to divide by", and overloading it would swap one wrong
  // reading for another. The console captions the tab instead.
  it('does not overload utilizationRate null to mean "not branch-filterable"', async () => {
    const { service } = setup({ instances: [instance()], trainers: [trainer()] });

    const result = await service.get({ ...QUERY, locationId: 'loc_1' });

    expect(result.kpis.utilizationRate).not.toBeNull();
  });
});
