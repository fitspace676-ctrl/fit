import { describe, expect, it, vi } from 'vitest';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { AnalyticsService } from './analytics.service';

const DAY = 24 * 60 * 60 * 1000;

/**
 * The service resolves its window off `new Date()`, so the two equal-length
 * windows are ~[now-30d, now) (current) and ~[now-60d, now-30d) (previous). A
 * midpoint 45 days back cleanly separates a `gte` in the current window from one
 * in the previous, letting the mocks answer per-window without pinning the clock.
 */
function isCurrent(date: Date, now: number): boolean {
  return date.getTime() > now - 45 * DAY;
}

interface Config {
  latestPaymentCurrency?: string | null;
  revenue?: { current: number; previous: number };
  members?: { active: number; joinedNow: number; joinedPrev: number };
  attendance?: {
    attendedNow: number;
    noShowNow: number;
    attendedPrev: number;
    noShowPrev: number;
  };
  churn?: { churnedNow: number; baseNow: number; churnedPrev: number; basePrev: number };
  seriesRows?: Array<{ amount: number; createdAt: Date }>;
  channelRows?: Array<{ provider: string | null; _sum: { amount: number | null } }>;
  planGroups?: Array<{ planId: string | null; _count: { _all: number } }>;
  plans?: Array<{ id: string; name: string }>;
  bookingRows?: Array<{ classInstance: { templateId: string } }>;
  templates?: Array<{ id: string; title: string }>;
}

function setup(config: Config = {}) {
  const now = Date.now();
  const c: Required<Config> = {
    latestPaymentCurrency: 'GEL',
    revenue: { current: 10000, previous: 5000 },
    members: { active: 120, joinedNow: 10, joinedPrev: 5 },
    attendance: { attendedNow: 8, noShowNow: 2, attendedPrev: 6, noShowPrev: 4 },
    churn: { churnedNow: 3, baseNow: 30, churnedPrev: 2, basePrev: 40 },
    seriesRows: [
      { amount: 6000, createdAt: new Date(now - DAY) },
      { amount: 4000, createdAt: new Date(now - 2 * DAY) },
    ],
    channelRows: [
      { provider: 'pos', _sum: { amount: 3000 } },
      { provider: 'stub', _sum: { amount: 7000 } },
    ],
    planGroups: [
      { planId: 'p1', _count: { _all: 5 } },
      { planId: null, _count: { _all: 2 } },
      { planId: 'p2', _count: { _all: 3 } },
    ],
    plans: [{ id: 'p1', name: 'Premium' }],
    bookingRows: [
      ...Array.from({ length: 3 }, () => ({ classInstance: { templateId: 't1' } })),
      ...Array.from({ length: 2 }, () => ({ classInstance: { templateId: 't2' } })),
      { classInstance: { templateId: 'gone' } },
    ],
    templates: [
      { id: 't1', title: 'HIIT' },
      { id: 't2', title: 'Yoga' },
    ],
    ...config,
  };

  const payment = {
    findFirst: vi
      .fn()
      .mockResolvedValue(
        c.latestPaymentCurrency === null ? null : { currency: c.latestPaymentCurrency },
      ),
    aggregate: vi.fn((args: { where: { createdAt: { gte: Date } } }) => {
      const amount = isCurrent(args.where.createdAt.gte, now)
        ? c.revenue.current
        : c.revenue.previous;
      return Promise.resolve({ _sum: { amount } });
    }),
    findMany: vi.fn().mockResolvedValue(c.seriesRows),
    groupBy: vi.fn().mockResolvedValue(c.channelRows),
  };

  const gymMember = {
    count: vi.fn((args: { where: { joinedAt?: { gte: Date } } }) => {
      if (!args.where.joinedAt) return Promise.resolve(c.members.active);
      return Promise.resolve(
        isCurrent(args.where.joinedAt.gte, now) ? c.members.joinedNow : c.members.joinedPrev,
      );
    }),
  };

  const booking = {
    count: vi.fn(
      (args: { where: { status: string; classInstance: { startsAt: { gte: Date } } } }) => {
        const cur = isCurrent(args.where.classInstance.startsAt.gte, now);
        const attended = cur ? c.attendance.attendedNow : c.attendance.attendedPrev;
        const noShow = cur ? c.attendance.noShowNow : c.attendance.noShowPrev;
        return Promise.resolve(args.where.status === 'ATTENDED' ? attended : noShow);
      },
    ),
    findMany: vi.fn().mockResolvedValue(c.bookingRows),
  };

  const subscription = {
    count: vi.fn(
      (args: {
        where: { OR?: Array<{ canceledAt: { gte: Date } }>; createdAt?: { lt: Date } };
      }) => {
        if (args.where.OR) {
          return Promise.resolve(
            isCurrent(args.where.OR[0]!.canceledAt.gte, now)
              ? c.churn.churnedNow
              : c.churn.churnedPrev,
          );
        }
        return Promise.resolve(
          isCurrent(args.where.createdAt!.lt, now) ? c.churn.baseNow : c.churn.basePrev,
        );
      },
    ),
    groupBy: vi.fn().mockResolvedValue(c.planGroups),
    findFirst: vi.fn(),
  };

  const subscriptionPlan = { findMany: vi.fn().mockResolvedValue(c.plans) };
  const classTemplate = { findMany: vi.fn().mockResolvedValue(c.templates) };

  const prisma = {
    client: { payment, gymMember, booking, subscription, subscriptionPlan, classTemplate },
  } as unknown as TenantPrismaService;

  return { service: new AnalyticsService(prisma) };
}

describe('AnalyticsService', () => {
  it('assembles a full snapshot with real KPIs, series and breakdowns', async () => {
    const { service } = setup();
    const result = await service.getAnalytics('30d');

    expect(result.range).toBe('30d');
    expect(result.currency).toBe('GEL');
    expect(result.kpis.revenue).toEqual({ value: 10000, deltaPct: 100 });
    expect(result.kpis.activeMembers).toEqual({ value: 120, deltaPct: 100 });
    // 8/(8+2)=80% vs 6/(6+4)=60% → delta (80-60)/60 = 33.3%.
    expect(result.kpis.attendanceRate).toEqual({ value: 80, deltaPct: 33.3 });
    // 3/30=10% vs 2/40=5% → delta 100%.
    expect(result.kpis.churn).toEqual({ value: 10, deltaPct: 100 });

    // Dense zero-filled series whose values sum to the captured total.
    expect(result.revenueSeries.reduce((sum, p) => sum + p.value, 0)).toBe(10000);
  });

  it('defaults the range to 30d when none is passed', async () => {
    const { service } = setup();
    const result = await service.getAnalytics();
    expect(result.range).toBe('30d');
  });

  it('falls back to USD when the gym has taken no payments', async () => {
    const { service } = setup({ latestPaymentCurrency: null });
    const result = await service.getAnalytics('30d');
    expect(result.currency).toBe('USD');
  });

  it('hides the revenue delta chip when there is no prior baseline', async () => {
    const { service } = setup({ revenue: { current: 1000, previous: 0 } });
    const result = await service.getAnalytics('30d');
    expect(result.kpis.revenue.deltaPct).toBeNull();
  });

  it('reports a zero attendance rate with a null delta when no bookings exist', async () => {
    const { service } = setup({
      attendance: { attendedNow: 0, noShowNow: 0, attendedPrev: 0, noShowPrev: 0 },
    });
    const result = await service.getAnalytics('30d');
    expect(result.kpis.attendanceRate).toEqual({ value: 0, deltaPct: null });
  });

  it('reports a null churn delta when the prior base is empty', async () => {
    const { service } = setup({
      churn: { churnedNow: 1, baseNow: 10, churnedPrev: 0, basePrev: 0 },
    });
    const result = await service.getAnalytics('30d');
    expect(result.kpis.churn.deltaPct).toBeNull();
  });

  it('derives the channel mix from the provider key and sorts by amount', async () => {
    const { service } = setup();
    const result = await service.getAnalytics('30d');
    expect(result.channelMix).toEqual([
      { channel: 'ONLINE', amount: 7000 },
      { channel: 'POS', amount: 3000 },
    ]);
  });

  it('labels live plans, deleted plans and no-plan subscriptions, ranked by size', async () => {
    const { service } = setup();
    const result = await service.getAnalytics('30d');
    expect(result.planMix).toEqual([
      { planId: 'p1', name: 'Premium', subscribers: 5 },
      { planId: 'p2', name: 'Deleted plan', subscribers: 3 },
      { planId: null, name: 'No plan', subscribers: 2 },
    ]);
  });

  it('returns an empty plan mix when no subscriptions are live', async () => {
    const { service } = setup({ planGroups: [] });
    const result = await service.getAnalytics('30d');
    expect(result.planMix).toEqual([]);
  });

  it('ranks the top classes by booking volume and labels deleted templates', async () => {
    const { service } = setup();
    const result = await service.getAnalytics('30d');
    expect(result.topClasses).toEqual([
      { templateId: 't1', title: 'HIIT', bookings: 3 },
      { templateId: 't2', title: 'Yoga', bookings: 2 },
      { templateId: 'gone', title: 'Deleted class', bookings: 1 },
    ]);
  });

  it('caps the top classes at five', async () => {
    const { service } = setup({
      bookingRows: Array.from({ length: 7 }, (_, i) => ({
        classInstance: { templateId: `t${i}` },
      })),
      templates: Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, title: `Class ${i}` })),
    });
    const result = await service.getAnalytics('30d');
    expect(result.topClasses).toHaveLength(5);
  });

  it('returns an empty top-classes list when nothing was booked', async () => {
    const { service } = setup({ bookingRows: [] });
    const result = await service.getAnalytics('30d');
    expect(result.topClasses).toEqual([]);
  });
});
