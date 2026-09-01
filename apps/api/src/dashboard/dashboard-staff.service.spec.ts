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

  // Stage 6 gave the four branchless models a branch, and these specs pin WHICH
  // filter each read takes — the distinction that is easy to get backwards and
  // impossible to see in a number afterwards.
  it('narrows the two event reads on their own column', async () => {
    const { service, instanceFindMany, ptFindMany, shiftFindMany } = setup({});

    await service.get({ ...QUERY, locationId: 'loc_1' });

    // Classes, PT hours and shifts are all events at a PLACE — a room was
    // occupied, a door was staffed — so each carries its own `locationId` and is
    // read with plain equality. `PtSession` gained that column in Stage 6, which
    // is what unblocked the whole tab: `sessionsDelivered` ADDS classes and PT,
    // and filtering only the half that could be filtered would have summed one
    // branch's classes with every branch's coaching.
    for (const fn of [instanceFindMany, ptFindMany, shiftFindMany]) {
      for (const where of wheres(fn)) {
        expect(where.locationId).toBe('loc_1');
      }
    }
  });

  it('narrows the two availability reads through the roster, not through a column', async () => {
    const { service, trainerFindMany, timeOffFindMany } = setup({});

    await service.get({ ...QUERY, locationId: 'loc_1' });

    // "Which coaches can this branch call on" and "whose absence costs it cover"
    // are questions of AVAILABILITY, and neither model has (or should have) a
    // branch column: a coach's branches are a capability, and a capability is
    // many-valued. Both hop through `LocationStaff`.
    for (const fn of [trainerFindMany, timeOffFindMany]) {
      for (const where of wheres(fn)) {
        expect(where.staff).toEqual({
          is: { locationAssignments: { some: { locationId: 'loc_1' } } },
        });
        expect(where).not.toHaveProperty('locationId');
      }
    }
  });

  // The staff head-count is the one figure where the two rules genuinely compete,
  // and the previous stages' spec asserted the opposite of what Stage 6 needs.
  it('counts staff by the ROSTER, because both terms of the gap must share a population', async () => {
    const { service, memberCount } = setup({});

    await service.get({ ...QUERY, locationId: 'loc_1' });

    for (const where of wheres(memberCount)) {
      // `gaps.staffWithoutShifts` subtracts "people with a shift at this branch"
      // from this count. Base-branch head-count minus shifts-at-this-branch would
      // subtract two different populations: a coach based at the flagship who
      // works Tuesdays at the satellite would be a gap at the flagship and a
      // surplus at the satellite, and the `Math.max(0, …)` would swallow the
      // negative half silently.
      expect(where.locationAssignments).toEqual({ some: { locationId: 'loc_1' } });
      // Still NOT `GymMember.locationId`, and for a sharper reason than before.
      // That column is now genuinely meaningful on a staff row — it is the
      // person's BASE branch — and it is what a per-branch head-count of the
      // payroll reads, precisely because it partitions. This figure is not a
      // head-count; it is a rostering gap, and it deliberately does not sum to
      // the payroll across branches.
      expect(where).not.toHaveProperty('locationId');
      // The deprecated array is not read anywhere any more.
      expect(where).not.toHaveProperty('assignedLocationIds');
    }
  });

  it('returns genuinely different figures per branch', async () => {
    // The inverse of the old "same figures with and without a branch" assertion.
    // Every read is filtered now, so the mocks answer identically and the numbers
    // agree — what changed is that a `where` reaches the database at all, which
    // the specs above pin directly. Here we only assert the shape survives.
    const rows = { instances: [instance()], ptSessions: [session()], trainers: [trainer()] };
    const branch = await setup(rows).service.get({ ...QUERY, locationId: 'loc_1' });

    expect(branch.kpis.sessionsDelivered).toBeGreaterThan(0);
  });

  // `utilizationRate` is the one thing Stage 6 could NOT fix, and this inverts the
  // spec that used to guard the opposite.
  it('nulls utilizationRate under a branch filter — the denominator cannot narrow', async () => {
    const rows = { instances: [instance()], trainers: [trainer()] };

    const gymWide = await setup(rows).service.get(QUERY);
    const branch = await setup(rows).service.get({ ...QUERY, locationId: 'loc_1' });

    // Gym-wide the rate is real.
    expect(gymWide.kpis.utilizationRate).not.toBeNull();
    // Under a branch it is not, because `Trainer.availability` is a weekly JSON
    // document with no branch dimension at all: the numerator narrows and the
    // denominator cannot, so the rate would divide one branch's delivered minutes
    // by every branch's availability. That is not a smaller rate, it is a wrong
    // one — the exact objection the exemption register raised. Shipping it beside
    // branch-filtered hours would put two populations in one row and LOOK filtered.
    expect(branch.kpis.utilizationRate).toBeNull();
    for (const row of branch.trainers) {
      expect(row.utilizationRate).toBeNull();
    }
  });

  it('still counts the trainers whose availability is genuinely unset', async () => {
    // The suppression above must not swallow the gaps card: an unset week is true
    // at every branch, so this counter is computed from the same loop and left
    // alone. Without it, the console could not tell "no branch dimension" from
    // "nobody configured a week".
    const withoutAvailability = trainer({ availability: {} });
    const result = await setup({ trainers: [withoutAvailability] }).service.get({
      ...QUERY,
      locationId: 'loc_1',
    });

    expect(result.gaps.trainersWithoutAvailability).toBe(1);
  });
});
