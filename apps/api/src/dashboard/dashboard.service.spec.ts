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
