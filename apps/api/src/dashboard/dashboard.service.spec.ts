import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GymMemberStatus,
  LocationStatus,
  ProductStatus,
  Role,
  TrainerStatus,
  PaymentStatus,
  SubscriptionStatus,
} from '@fit/db';
import type { DashboardRecentMember, DashboardSecondaryKpis } from '@fit/types';
import { DashboardService, resolvePeriodWindow, type PeriodWindow } from './dashboard.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
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

/** The subset of the Prisma count arg the assertions inspect. */
interface CountArgs {
  where?: Record<string, unknown>;
}

/**
 * Stub the four scoped models' `count`, each returning a fixed number per call in
 * the order the service issues them: active first, then total. The tenant
 * extension (gym scoping) is exercised by the real client in integration; here we
 * assert the service's own filters (`role` / `status`) and projection.
 */
function setup(counts?: Partial<Record<string, number>>) {
  const make = (active: number, total: number) => {
    const fn = vi.fn<(args?: CountArgs) => Promise<number>>();
    fn.mockResolvedValueOnce(active).mockResolvedValueOnce(total);
    return fn;
  };

  const gymMember = make(counts?.membersActive ?? 0, counts?.membersTotal ?? 0);
  const trainer = make(counts?.trainersActive ?? 0, counts?.trainersTotal ?? 0);
  const location = make(counts?.locationsActive ?? 0, counts?.locationsTotal ?? 0);
  const product = make(counts?.productsActive ?? 0, counts?.productsTotal ?? 0);

  const client = {
    gymMember: { count: gymMember },
    trainer: { count: trainer },
    location: { count: location },
    product: { count: product },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  // `getStats` never touches the tenant context; a minimal stub satisfies the
  // constructor for these unit tests (the overview's tenant-scoped reads are
  // exercised against the real client in integration).
  const tenant = { gymId: 'gym_test', userId: 'user_test', role: Role.MANAGER } as TenantContext;

  return {
    service: new DashboardService(prisma, tenant, stubLocale()),
    gymMember,
    trainer,
    location,
    product,
  };
}

describe('DashboardService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('getStats', () => {
    it('projects each entity as an active/total pair', async () => {
      const { service } = setup({
        membersActive: 42,
        membersTotal: 50,
        trainersActive: 6,
        trainersTotal: 7,
        locationsActive: 2,
        locationsTotal: 3,
        productsActive: 9,
        productsTotal: 12,
      });

      const result = await service.getStats();

      expect(result).toEqual({
        members: { active: 42, total: 50 },
        trainers: { active: 6, total: 7 },
        locations: { active: 2, total: 3 },
        products: { active: 9, total: 12 },
      });
    });

    it('counts only MEMBER-role memberships, active filtered by status', async () => {
      const { service, gymMember } = setup();

      await service.getStats();

      // First call: the active figure — MEMBER role + ACTIVE status, live only.
      expect(gymMember.mock.calls[0]?.[0]?.where).toEqual({
        role: Role.MEMBER,
        status: GymMemberStatus.ACTIVE,
        deletedAt: null,
      });
      // Second call: the total — MEMBER role, all statuses, trashed excluded.
      expect(gymMember.mock.calls[1]?.[0]?.where).toEqual({ role: Role.MEMBER, deletedAt: null });
    });

    it('filters the active count of each catalogue entity by its ACTIVE status', async () => {
      const { service, trainer, location, product } = setup();

      await service.getStats();

      expect(trainer.mock.calls[0]?.[0]?.where).toEqual({ status: TrainerStatus.ACTIVE });
      expect(location.mock.calls[0]?.[0]?.where).toEqual({ status: LocationStatus.ACTIVE });
      expect(product.mock.calls[0]?.[0]?.where).toEqual({ status: ProductStatus.ACTIVE });
    });

    it('counts every record for the total of each catalogue entity (no filter)', async () => {
      const { service, trainer, location, product } = setup();

      await service.getStats();

      expect(trainer.mock.calls[1]?.[0]).toBeUndefined();
      expect(location.mock.calls[1]?.[0]).toBeUndefined();
      expect(product.mock.calls[1]?.[0]).toBeUndefined();
    });
  });

  describe('secondaryKpis', () => {
    function setupSecondary() {
      const gymMemberCount = vi.fn().mockResolvedValueOnce(120); // activeMembers
      const paymentAggregate = vi
        .fn()
        .mockResolvedValueOnce({ _sum: { amount: 500000 } }) // this month
        .mockResolvedValueOnce({ _sum: { amount: 400000 } }); // last month
      const subscriptionCount = vi
        .fn()
        .mockResolvedValueOnce(7) // overdue (PAST_DUE)
        .mockResolvedValueOnce(15) // expiring soon
        .mockResolvedValueOnce(30); // renewals due
      const classInstanceCount = vi.fn().mockResolvedValueOnce(9); // classes today

      const client = {
        gymMember: { count: gymMemberCount },
        payment: { aggregate: paymentAggregate },
        subscription: { count: subscriptionCount },
        classInstance: { count: classInstanceCount },
      };
      const prisma = { client } as unknown as TenantPrismaService;
      const tenant = { gymId: 'gym_test' } as TenantContext;
      const service = new DashboardService(prisma, tenant, stubLocale());
      return { service, subscriptionCount, paymentAggregate };
    }

    it('projects the six figures with a real month-over-month revenue delta', async () => {
      const { service } = setupSecondary();
      const result: DashboardSecondaryKpis = await (
        service as unknown as { secondaryKpis(win: PeriodWindow): Promise<DashboardSecondaryKpis> }
      ).secondaryKpis(resolvePeriodWindow({ period: 'today' }, new Date()));

      expect(result).toEqual({
        activeMembers: 120,
        revenueThisMonth: { value: 500000, deltaPct: 25 },
        overduePayments: 7,
        classesToday: 9,
        expiringSoon: 15,
        renewalsDue: 30,
      });
    });

    it('counts overdue as PAST_DUE subscriptions', async () => {
      const { service, subscriptionCount } = setupSecondary();
      await (
        service as unknown as { secondaryKpis(win: PeriodWindow): Promise<DashboardSecondaryKpis> }
      ).secondaryKpis(resolvePeriodWindow({ period: 'today' }, new Date()));
      expect(subscriptionCount.mock.calls[0]?.[0]).toEqual({
        where: { status: SubscriptionStatus.PAST_DUE },
      });
    });

    it('sums this-month revenue from CAPTURED payments only', async () => {
      const { service, paymentAggregate } = setupSecondary();
      await (
        service as unknown as { secondaryKpis(win: PeriodWindow): Promise<DashboardSecondaryKpis> }
      ).secondaryKpis(resolvePeriodWindow({ period: 'today' }, new Date()));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentAggregate.mock.calls[0]?.[0].where.status).toBe(PaymentStatus.CAPTURED);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(paymentAggregate.mock.calls[0]?.[0]._sum).toEqual({ amount: true });
    });
  });

  describe('recentMembers', () => {
    it('maps the latest joiners, falling back to email when unnamed', async () => {
      const findMany = vi.fn().mockResolvedValueOnce([
        {
          id: 'gm_1',
          status: 'ACTIVE',
          joinedAt: new Date('2026-07-01T10:00:00.000Z'),
          user: { name: null, email: 'sarah.j@email.com' },
          subscriptions: [
            {
              currentPeriodEnd: new Date('2026-12-15T00:00:00.000Z'),
              plan: { name: 'Premium Annual' },
            },
          ],
        },
      ]);
      const client = { gymMember: { findMany } };
      const prisma = { client } as unknown as TenantPrismaService;
      const tenant = { gymId: 'gym_test' } as TenantContext;
      const service = new DashboardService(prisma, tenant, stubLocale());

      const result: DashboardRecentMember[] = await (
        service as unknown as { recentMembers(): Promise<DashboardRecentMember[]> }
      ).recentMembers();

      expect(result).toEqual([
        {
          id: 'gm_1',
          name: 'sarah.j@email.com',
          email: 'sarah.j@email.com',
          planName: 'Premium Annual',
          status: 'ACTIVE',
          joinedAt: '2026-07-01T10:00:00.000Z',
          expiresAt: '2026-12-15T00:00:00.000Z',
        },
      ]);
    });
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local `YYYY-MM-DD` for an assertion (mirrors the service's own formatter). */
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

describe('resolvePeriodWindow', () => {
  // A fixed mid-afternoon "now" (Wed 15 Jul 2026, local) so the cases are stable.
  const now = new Date(2026, 6, 15, 13, 30, 0);

  it('today → the single calendar day, delta vs. yesterday', () => {
    const win = resolvePeriodWindow({ period: 'today' }, now);
    expect(win.period).toBe('today');
    expect(win.start).toEqual(new Date(2026, 6, 15));
    expect(win.end).toEqual(new Date(2026, 6, 16));
    expect(win.fromISO).toBe('2026-07-15');
    expect(win.toISO).toBe('2026-07-15');
    // Previous window is the immediately preceding equal-length (1 day) window.
    expect(win.prevEnd).toEqual(win.start);
    expect(win.prevStart).toEqual(new Date(2026, 6, 14));
  });

  it('week → a Monday-started 7-day window', () => {
    const win = resolvePeriodWindow({ period: 'week' }, now);
    expect(win.start.getDay()).toBe(1); // Monday
    expect(win.end.getTime() - win.start.getTime()).toBe(7 * DAY_MS);
    expect(win.fromISO).toBe(iso(win.start));
    expect(win.toISO).toBe(iso(new Date(win.end.getTime() - DAY_MS)));
    expect(win.prevStart.getTime()).toBe(win.start.getTime() - 7 * DAY_MS);
  });

  it('month → the whole calendar month, inclusive last day', () => {
    const win = resolvePeriodWindow({ period: 'month' }, now);
    expect(win.start).toEqual(new Date(2026, 6, 1));
    expect(win.end).toEqual(new Date(2026, 7, 1));
    expect(win.fromISO).toBe('2026-07-01');
    expect(win.toISO).toBe('2026-07-31');
  });

  it('custom → inclusive from/to, end exclusive of the day after `to`', () => {
    const win = resolvePeriodWindow(
      { period: 'custom', from: '2026-07-03', to: '2026-07-10' },
      now,
    );
    expect(win.start).toEqual(new Date(2026, 6, 3));
    expect(win.end).toEqual(new Date(2026, 6, 11)); // day after the inclusive `to`
    expect(win.fromISO).toBe('2026-07-03');
    expect(win.toISO).toBe('2026-07-10');
  });

  it('custom with a reversed range swaps the bounds so the window is valid', () => {
    const win = resolvePeriodWindow(
      { period: 'custom', from: '2026-07-10', to: '2026-07-03' },
      now,
    );
    expect(win.fromISO).toBe('2026-07-03');
    expect(win.toISO).toBe('2026-07-10');
    expect(win.start.getTime()).toBeLessThan(win.end.getTime());
  });

  it('custom with a missing side falls back to today for that side', () => {
    const win = resolvePeriodWindow({ period: 'custom', from: '2026-07-13' }, now);
    expect(win.fromISO).toBe('2026-07-13');
    expect(win.toISO).toBe('2026-07-15'); // `to` defaults to today
  });
});

/*
 * "Today" is a calendar question, and this surface used to answer it in the
 * SERVER'S zone (`new Date(d.getFullYear(), …)`). That is the one answer that is
 * wrong everywhere: it made today's revenue depend on which region the container
 * runs in, and would have changed the numbers silently if the deployment moved.
 */
describe('resolvePeriodWindow — the gym clock', () => {
  const NOON_UTC = new Date('2026-08-07T12:00:00.000Z');

  it('starts "today" at the gym midnight, not the server one', () => {
    const win = resolvePeriodWindow({ period: 'today' }, NOON_UTC, 'Asia/Tbilisi');
    // Tbilisi is UTC+4, so its day began at 20:00 the previous day in UTC.
    expect(win.start.toISOString()).toBe('2026-08-06T20:00:00.000Z');
    expect(win.end.toISOString()).toBe('2026-08-07T20:00:00.000Z');
    // And the label the client shows is the gym's date, not UTC's.
    expect(win.fromISO).toBe('2026-08-07');
  });

  // 21:00 UTC is already tomorrow in Tbilisi. A gym looking at its dashboard
  // late in the evening was being shown yesterday's window.
  it('has already rolled over when the gym date has', () => {
    const win = resolvePeriodWindow(
      { period: 'today' },
      new Date('2026-08-07T21:00:00.000Z'),
      'Asia/Tbilisi',
    );
    expect(win.fromISO).toBe('2026-08-08');
  });

  it('anchors the week to the gym Monday', () => {
    const win = resolvePeriodWindow({ period: 'week' }, NOON_UTC, 'Asia/Tbilisi');
    // 2026-08-07 is a Friday; its week began Monday the 3rd, at Tbilisi midnight.
    expect(win.fromISO).toBe('2026-08-03');
    expect(win.start.toISOString()).toBe('2026-08-02T20:00:00.000Z');
  });

  it('anchors the month to the gym first', () => {
    const win = resolvePeriodWindow({ period: 'month' }, NOON_UTC, 'Asia/Tbilisi');
    expect(win.fromISO).toBe('2026-08-01');
    expect(win.start.toISOString()).toBe('2026-07-31T20:00:00.000Z');
    expect(win.end.toISOString()).toBe('2026-08-31T20:00:00.000Z');
  });

  // A custom range is typed as gym dates, so both ends have to be read that way
  // or the last day gets clipped four hours short.
  it('reads a custom range as gym dates, inclusive of the last one', () => {
    const win = resolvePeriodWindow(
      { period: 'custom', from: '2026-08-01', to: '2026-08-03' },
      NOON_UTC,
      'Asia/Tbilisi',
    );
    expect(win.start.toISOString()).toBe('2026-07-31T20:00:00.000Z');
    expect(win.end.toISOString()).toBe('2026-08-03T20:00:00.000Z');
    expect(win.toISO).toBe('2026-08-03');
  });

  // Defaulting to UTC is deliberate, so a caller that has not been given the
  // gym's zone yet gets a fixed answer rather than the machine's.
  it('defaults to UTC rather than to the machine', () => {
    expect(resolvePeriodWindow({ period: 'today' }, NOON_UTC).start.toISOString()).toBe(
      '2026-08-07T00:00:00.000Z',
    );
  });
});

/* -------------------------------------------------------------------------- */
/*  The branch filter (Stage 1, multi-branch)                                   */
/* -------------------------------------------------------------------------- */

/**
 * A whole-overview stub: every model method `getOverview` reaches for, each
 * returning an empty/neutral result. The assertions below are about the `where`
 * the service SENDS, not the rows it gets back — the point of these specs is that
 * a branch filter lands on exactly the reads that can carry one, and on no others.
 */
function setupOverview() {
  const paymentAggregate = vi.fn().mockResolvedValue({ _sum: { amount: 0 } });
  const paymentFindMany = vi.fn().mockResolvedValue([]);
  const paymentFindFirst = vi.fn().mockResolvedValue(null);
  const classInstanceCount = vi.fn().mockResolvedValue(0);
  const classInstanceFindMany = vi.fn().mockResolvedValue([]);
  const checkInCount = vi.fn().mockResolvedValue(0);
  const checkInFindMany = vi.fn().mockResolvedValue([]);
  const gymMemberCount = vi.fn().mockResolvedValue(0);
  const gymMemberFindMany = vi.fn().mockResolvedValue([]);
  const subscriptionCount = vi.fn().mockResolvedValue(0);
  const subscriptionGroupBy = vi.fn().mockResolvedValue([]);
  const locationFindMany = vi.fn().mockResolvedValue([]);

  const client = {
    gym: { findFirst: vi.fn().mockResolvedValue({ name: 'Test Gym' }) },
    gymMember: {
      findFirst: vi.fn().mockResolvedValue({
        role: Role.MANAGER,
        user: { name: 'Staffer', email: 's@example.com' },
      }),
      count: gymMemberCount,
      findMany: gymMemberFindMany,
    },
    location: { findMany: locationFindMany },
    classTemplate: { groupBy: vi.fn().mockResolvedValue([]) },
    checkIn: { count: checkInCount, findMany: checkInFindMany },
    payment: {
      aggregate: paymentAggregate,
      findMany: paymentFindMany,
      findFirst: paymentFindFirst,
    },
    classInstance: { count: classInstanceCount, findMany: classInstanceFindMany },
    subscription: { count: subscriptionCount, groupBy: subscriptionGroupBy },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym_test', userId: 'user_test', role: Role.MANAGER } as TenantContext;

  return {
    service: new DashboardService(prisma, tenant, stubLocale()),
    /** Every read that CAN carry a branch, through its order. */
    paymentReads: [paymentAggregate, paymentFindMany, paymentFindFirst],
    /** Every read that CAN carry a branch, on its own column. */
    classInstanceReads: [classInstanceCount, classInstanceFindMany],
    /** Every read that carries the member's HOME branch on its own column. */
    memberReads: [gymMemberCount, gymMemberFindMany],
    /** Every read that reaches the home branch through `member` (Stage 2). */
    memberHopReads: [subscriptionCount, subscriptionGroupBy],
    /** Every read that carries the branch WALKED INTO on its own column (Stage 3). */
    checkInReads: [checkInCount, checkInFindMany],
    /**
     * The occupancy card's branch list. `Location` IS the branch, so it narrows on
     * its primary key — a `locationId` clause here would filter a column the model
     * does not have.
     */
    locationReads: [locationFindMany],
  };
}

/** The `where` each recorded call was issued with. */
function wheres(fn: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return fn.mock.calls.map(
    (call) => (call[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {},
  );
}

const BASE_QUERY = { range: '7d', period: 'today' } as const;

describe('DashboardService.getOverview — the branch filter', () => {
  afterEach(() => vi.clearAllMocks());

  // Inverted by Stage 5, which gave `payments` the `locationId` the previous
  // version of this test said it lacked. The property is unchanged and is the one
  // that matters: EVERY payment read on this endpoint narrows, so no card ends up
  // half branch-scoped. Only the path changed.
  it('filters every payment read on the payment’s own branch column', async () => {
    const { service, paymentReads } = setupOverview();

    await service.getOverview({ ...BASE_QUERY, locationId: 'loc_1' });

    for (const read of paymentReads) {
      expect(read).toHaveBeenCalled();
      for (const where of wheres(read)) {
        expect(where.locationId).toBe('loc_1');
        // The order hop is gone: it could not use `(gymId, locationId, createdAt)`,
        // and it re-read the order live where the column is a write-time snapshot.
        expect(where).not.toHaveProperty('order');
      }
    }
  });

  it('filters class occurrences on their own column', async () => {
    const { service, classInstanceReads } = setupOverview();

    await service.getOverview({ ...BASE_QUERY, locationId: 'loc_1' });

    for (const read of classInstanceReads) {
      expect(read).toHaveBeenCalled();
      for (const where of wheres(read)) {
        // Plain equality, not `OR IS NULL`: Stage 0 backfilled every row.
        expect(where.locationId).toBe('loc_1');
      }
    }
  });

  // Stage 2 gave `GymMember` a home branch, so the member counts and the recent
  // joiners now filter it directly. This assertion is the inverse of the one that
  // stood here before; what it pins is unchanged — every member read moves
  // together, so `newMembers7d`, `activeMembers` and the joiners table can never
  // describe different populations.
  it('filters every member read on the home branch', async () => {
    const { service, memberReads } = setupOverview();

    await service.getOverview({ ...BASE_QUERY, locationId: 'loc_1' });

    for (const read of memberReads) {
      expect(read).toHaveBeenCalled();
      for (const where of wheres(read)) {
        // Plain equality on `GymMember.locationId`, served by
        // `@@index([gymId, locationId, status])`.
        expect(where.locationId).toBe('loc_1');
      }
    }
  });

  // A `Subscription` has no `locationId` of its own and reaches one only through
  // its member — which, since Stage 2, has one. Attribution is the member's HOME
  // branch, the same fragment the Revenue tab's MRR and the Members tab's cohorts
  // read, so the dunning and renewal counts are about the same people.
  it('reaches the home branch through the member on every subscription read', async () => {
    const { service, memberHopReads } = setupOverview();

    await service.getOverview({ ...BASE_QUERY, locationId: 'loc_1' });

    for (const read of memberHopReads) {
      expect(read).toHaveBeenCalled();
      for (const where of wheres(read)) {
        expect(where).not.toHaveProperty('locationId');
        expect(where.member).toEqual({ locationId: 'loc_1' });
      }
    }
  });

  // The inverse of the assertion that stood here before, and it protects the same
  // property from the other side: every check-in surface on the overview moves
  // TOGETHER, so `kpis.checkInsToday`, the occupancy card and the recent-arrivals
  // feed can never describe different populations. Stage 3 gave `CheckIn.locationId`
  // an FK and a write path, so what used to be a fabricated empty card is now a
  // smaller, true one.
  it('narrows every check-in read to the branch walked into', async () => {
    const { service, checkInReads } = setupOverview();

    await service.getOverview({ ...BASE_QUERY, locationId: 'loc_1' });

    for (const read of checkInReads) {
      expect(read).toHaveBeenCalled();
      for (const where of wheres(read)) {
        // The branch on the ARRIVAL, never the member's home branch: a visit
        // happens at a place, and a home branch does not say which door was used.
        expect(where.locationId).toBe('loc_1');
        expect(where).not.toHaveProperty('member');
      }
    }
  });

  // The occupancy card's denominator comes from this read. If it stayed gym-wide
  // the donut would count one branch's bodies against every branch's capacity, and
  // the card would list 0/N bars for the branches the operator just filtered out.
  it('narrows the occupancy card branch list on the location primary key', async () => {
    const { service, locationReads } = setupOverview();

    await service.getOverview({ ...BASE_QUERY, locationId: 'loc_1' });

    for (const read of locationReads) {
      expect(read).toHaveBeenCalled();
      for (const where of wheres(read)) {
        expect(where.id).toBe('loc_1');
        expect(where).not.toHaveProperty('locationId');
      }
    }
  });

  it('sends no branch clause at all when no branch is selected', async () => {
    const {
      service,
      paymentReads,
      classInstanceReads,
      memberReads,
      memberHopReads,
      checkInReads,
      locationReads,
    } = setupOverview();

    await service.getOverview(BASE_QUERY);

    // Not `locationId: undefined` — an absent branch must leave the original,
    // index-served `where` byte-for-byte unchanged. For `check_ins` specifically
    // that is what keeps "All locations" — the console's default — on
    // `(gymId, checkedInAt)` rather than on the wider composite, which cannot serve
    // the time range without first scanning every branch's slice.
    for (const read of [...paymentReads, ...classInstanceReads, ...memberReads, ...checkInReads]) {
      for (const where of wheres(read)) {
        expect(where).not.toHaveProperty('locationId');
        expect(where).not.toHaveProperty('order');
      }
    }
    // And the branch list stays every active branch.
    for (const read of locationReads) {
      for (const where of wheres(read)) {
        expect(where).not.toHaveProperty('id');
      }
    }
    // The member hop leaves no empty `member` key behind either.
    for (const read of memberHopReads) {
      for (const where of wheres(read)) {
        expect(where).not.toHaveProperty('member');
      }
    }
  });

  // Inverted at Stage 3. What this pins is unchanged in kind — where an arrival
  // with no branch ends up — but the answer is now "nowhere", not "areas[0]". The
  // fold-in existed only to paper over a column nothing wrote; with the backfill and
  // the write path landed, it would report one named branch's occupancy inflated by
  // everybody else's members.
  it('leaves a branchless arrival out of every area, and in the live count', async () => {
    const locationFindMany = vi.fn().mockResolvedValue([
      { id: 'loc_1', name: 'Downtown' },
      { id: 'loc_2', name: 'Riverside' },
    ]);
    // `locationId` goes back to NULL when a branch is deleted (`onDelete: SetNull`),
    // so this row is reachable however complete the write path is.
    const checkInFindMany = vi.fn().mockResolvedValue([
      { gymMemberId: 'gm_1', locationId: 'loc_1' },
      { gymMemberId: 'gm_2', locationId: null },
    ]);
    const client = {
      location: { findMany: locationFindMany },
      checkIn: { findMany: checkInFindMany },
      classTemplate: {
        groupBy: vi.fn().mockResolvedValue([
          { locationId: 'loc_1', _max: { capacity: 20 } },
          { locationId: 'loc_2', _max: { capacity: 10 } },
        ]),
      },
    };
    const prisma = { client } as unknown as TenantPrismaService;
    const tenant = { gymId: 'gym_test' } as TenantContext;
    const service = new DashboardService(prisma, tenant, stubLocale());

    const result = await inGymNowOf(service)('UTC');

    // Both people were really in the building, so both are in the headline count.
    expect(result.current).toBe(2);
    // The unattributed one is in NEITHER bar — above all, not in Downtown's.
    expect(result.areas).toEqual([
      { name: 'Downtown', capacity: 20, occupancy: 1 },
      { name: 'Riverside', capacity: 10, occupancy: 0 },
    ]);
    // The bars therefore sum to less than `current`. That gap is the honest signal
    // that somebody's branch is unknown; the fold-in used to close it by lying.
    expect(result.areas.reduce((n, a) => n + a.occupancy, 0)).toBeLessThan(result.current);
  });

  // With a branch selected the whole card is that branch: the donut's numerator,
  // its denominator and the single bar all come from the same one place. Leaving the
  // location read gym-wide would count one branch's bodies against every branch's
  // capacity and print 0/N bars for the branches that were just filtered out.
  it('narrows occupancy to the selected branch alone — count, capacity and bar', async () => {
    const locationFindMany = vi.fn().mockResolvedValue([{ id: 'loc_2', name: 'Riverside' }]);
    const checkInFindMany = vi
      .fn()
      .mockResolvedValue([{ gymMemberId: 'gm_2', locationId: 'loc_2' }]);
    const classTemplateGroupBy = vi
      .fn()
      .mockResolvedValue([{ locationId: 'loc_2', _max: { capacity: 10 } }]);
    const client = {
      location: { findMany: locationFindMany },
      checkIn: { findMany: checkInFindMany },
      classTemplate: { groupBy: classTemplateGroupBy },
    };
    const prisma = { client } as unknown as TenantPrismaService;
    const tenant = { gymId: 'gym_test' } as TenantContext;
    const service = new DashboardService(prisma, tenant, stubLocale());

    const result = await inGymNowOf(service)('UTC', 'loc_2');

    expect(result.current).toBe(1);
    // Riverside's headroom, not Riverside + Downtown.
    expect(result.capacity).toBe(10);
    expect(result.areas).toEqual([{ name: 'Riverside', capacity: 10, occupancy: 1 }]);
    // The capacity lookup is asked about the selected branch only.
    expect(classTemplateGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { locationId: { in: ['loc_2'] } } }),
    );
  });
});

/** Reach the private occupancy builder without loosening its signature. */
function inGymNowOf(service: DashboardService) {
  return (
    service as unknown as {
      inGymNow(
        zone: string,
        locationId?: string,
      ): Promise<{
        current: number;
        capacity: number;
        areas: { name: string; capacity: number; occupancy: number }[];
      }>;
    }
  ).inGymNow.bind(service);
}
