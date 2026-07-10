import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionStatus } from '@fit/db';
import type {
  ReportBreakdownSection,
  ReportHeatmapSection,
  ReportSeriesSection,
  ReportSplitSection,
  ReportTableSection,
} from '@fit/types';
import { ReportDrilldownService } from './report-drilldown.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/**
 * Stub the tenant-scoped Prisma delegates the drill-down reads. Gym scoping is the
 * tenant extension's job (exercised in integration); here we assert the service's
 * own aggregation, bucketing, and section shaping over a pinned clock.
 */
function setup() {
  const paymentFindMany = vi.fn().mockResolvedValue([]);
  const paymentFindFirst = vi.fn().mockResolvedValue(null);
  const gymMemberFindMany = vi.fn().mockResolvedValue([]);
  const gymMemberCount = vi.fn().mockResolvedValue(0);
  const subscriptionFindMany = vi.fn().mockResolvedValue([]);
  const checkInFindMany = vi.fn().mockResolvedValue([]);

  const client = {
    payment: { findMany: paymentFindMany, findFirst: paymentFindFirst },
    gymMember: { findMany: gymMemberFindMany, count: gymMemberCount },
    subscription: { findMany: subscriptionFindMany },
    checkIn: { findMany: checkInFindMany },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;

  return {
    service: new ReportDrilldownService(prisma, tenant),
    paymentFindMany,
    paymentFindFirst,
    gymMemberFindMany,
    gymMemberCount,
    subscriptionFindMany,
    checkInFindMany,
  };
}

/** A captured-payment row as the revenue `select` projects it. */
function payment(
  amount: number,
  refundedAmount: number,
  createdAt: string,
  plan: string | null,
  location: string | null,
  currency = 'GEL',
) {
  return {
    amount,
    refundedAmount,
    currency,
    createdAt: new Date(createdAt),
    order: {
      package: plan === null ? null : { name: plan },
      location: location === null ? null : { name: location },
    },
  };
}

describe('ReportDrilldownService', () => {
  // Pin the clock so `resolveWindow('30d')` is a fixed [2026-05-16, 2026-06-15) day
  // window and every bucket key is deterministic.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('revenue', () => {
    it('aggregates captured takings into trend, plan/location breakdowns, monthly table, and KPIs', async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        payment(10000, 0, '2026-05-20T09:00:00.000Z', 'Gold', 'Downtown'),
        payment(5000, 1000, '2026-05-20T15:00:00.000Z', 'Gold', 'Uptown'),
        payment(3000, 0, '2026-06-01T10:00:00.000Z', null, 'Downtown'),
      ]);

      const result = await service.run('revenue', { range: '30d' });

      expect(result.metric).toBe('revenue');
      expect(result.currency).toBe('GEL');

      // KPIs: net = (10000) + (5000-1000) + (3000) = 17000; orders 3; refunded 1000.
      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['total-revenue']).toBe(17000);
      expect(kpis['orders']).toBe(3);
      expect(kpis['refunded']).toBe(1000);
      expect(kpis['avg-order']).toBe(Math.round(17000 / 3));

      const trend = result.sections.find(
        (s) => s.id === 'revenue-over-time',
      ) as ReportSeriesSection;
      expect(trend.kind).toBe('series');
      // Dense daily buckets across the 30-day window.
      expect(trend.points.length).toBeGreaterThan(20);
      expect(trend.points.reduce((sum, p) => sum + p.value, 0)).toBe(17000);
      expect(trend.points.find((p) => p.label === '2026-05-20')?.value).toBe(14000);

      const byPlan = result.sections.find(
        (s) => s.id === 'revenue-by-plan',
      ) as ReportBreakdownSection;
      // Gold = 10000 + 4000 = 14000; Retail (null plan) = 3000; richest first.
      expect(byPlan.items).toEqual([
        { label: 'Gold', value: 14000 },
        { label: 'Retail', value: 3000 },
      ]);

      const byLoc = result.sections.find(
        (s) => s.id === 'revenue-by-location',
      ) as ReportBreakdownSection;
      // Downtown = 10000 + 3000 = 13000; Uptown = 4000.
      expect(byLoc.items).toEqual([
        { label: 'Downtown', value: 13000 },
        { label: 'Uptown', value: 4000 },
      ]);

      const monthly = result.sections.find((s) => s.id === 'revenue-monthly') as ReportTableSection;
      expect(monthly.kind).toBe('table');
      expect(monthly.rows).toEqual([
        { period: '2026-05-01', orders: 2, gross: 15000, refunded: 1000, net: 14000 },
        { period: '2026-06-01', orders: 1, gross: 3000, refunded: 0, net: 3000 },
      ]);
    });

    it('falls back to the latest captured payment currency when the window is empty', async () => {
      const { service, paymentFindMany, paymentFindFirst } = setup();
      paymentFindMany.mockResolvedValue([]);
      paymentFindFirst.mockResolvedValue({ currency: 'EUR' });

      const result = await service.run('revenue', { range: '30d' });

      expect(result.currency).toBe('EUR');
      expect(result.kpis.find((k) => k.id === 'orders')?.value).toBe(0);
      const byPlan = result.sections.find(
        (s) => s.id === 'revenue-by-plan',
      ) as ReportBreakdownSection;
      expect(byPlan.items).toEqual([]);
    });
  });

  describe('members', () => {
    it('reports new-members trend, active-vs-expired split, and total-members KPI', async () => {
      const { service, gymMemberFindMany, gymMemberCount, subscriptionFindMany } = setup();
      gymMemberFindMany.mockResolvedValue([
        { joinedAt: new Date('2026-04-01T00:00:00.000Z') }, // before window → baseline
        { joinedAt: new Date('2026-05-20T00:00:00.000Z') }, // in window
        { joinedAt: new Date('2026-06-02T00:00:00.000Z') }, // in window
      ]);
      gymMemberCount.mockResolvedValue(3);
      subscriptionFindMany.mockResolvedValue([
        {
          memberId: 'm1',
          status: SubscriptionStatus.ACTIVE,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          canceledAt: null,
          updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        },
        {
          memberId: 'm2',
          status: SubscriptionStatus.CANCELED,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          canceledAt: new Date('2026-05-25T00:00:00.000Z'),
          updatedAt: new Date('2026-05-25T00:00:00.000Z'),
        },
      ]);

      const result = await service.run('members', { range: '30d' });

      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['total-members']).toBe(3);
      expect(kpis['new-members']).toBe(2);
      expect(kpis['active-members']).toBe(1);

      const split = result.sections.find((s) => s.id === 'active-vs-expired') as ReportSplitSection;
      expect(split.kind).toBe('split');
      expect(split.slices).toEqual([
        { label: 'Active', value: 1, tone: 'positive' },
        { label: 'Expired', value: 1, tone: 'negative' },
      ]);

      const trend = result.sections.find(
        (s) => s.id === 'new-members-over-time',
      ) as ReportSeriesSection;
      expect(trend.points.reduce((sum, p) => sum + p.value, 0)).toBe(2);
      expect(trend.points.find((p) => p.label === '2026-05-20')?.value).toBe(1);

      // The cancelled sub churned inside the window → churn trend has a non-zero point.
      const churn = result.sections.find((s) => s.id === 'churn-rate-trend') as ReportSeriesSection;
      expect(churn.unit).toBe('percent');
      expect(churn.points.some((p) => p.value > 0)).toBe(true);
    });
  });

  describe('attendance', () => {
    it('buckets check-ins over time, fills a 7×24 heatmap, and lists a daily table', async () => {
      const { service, checkInFindMany } = setup();
      checkInFindMany.mockResolvedValue([
        { gymMemberId: 'm1', checkedInAt: new Date('2026-05-20T07:00:00.000Z') }, // Wed 07:00
        { gymMemberId: 'm2', checkedInAt: new Date('2026-05-20T07:30:00.000Z') }, // Wed 07:00
        { gymMemberId: 'm1', checkedInAt: new Date('2026-05-21T18:00:00.000Z') }, // Thu 18:00
      ]);

      const result = await service.run('attendance', { range: '30d' });

      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['total-checkins']).toBe(3);
      expect(kpis['unique-members']).toBe(2);

      const heatmap = result.sections.find((s) => s.id === 'peak-hours') as ReportHeatmapSection;
      expect(heatmap.kind).toBe('heatmap');
      expect(heatmap.rowLabels).toHaveLength(7);
      expect(heatmap.colLabels).toHaveLength(24);
      // Wednesday (index 2) at 07:00 has two arrivals.
      expect(heatmap.cells[2]?.[7]).toBe(2);
      // Thursday (index 3) at 18:00 has one.
      expect(heatmap.cells[3]?.[18]).toBe(1);

      const daily = result.sections.find((s) => s.id === 'attendance-daily') as ReportTableSection;
      expect(daily.rows).toEqual([
        { date: '2026-05-20', checkIns: 2, uniqueMembers: 2 },
        { date: '2026-05-21', checkIns: 1, uniqueMembers: 1 },
      ]);
    });
  });

  describe('resolveSection', () => {
    it('returns a section by id with the report currency', async () => {
      const { service, checkInFindMany } = setup();
      checkInFindMany.mockResolvedValue([]);

      const resolved = await service.resolveSection('attendance', 'peak-hours', { range: '30d' });

      expect(resolved).not.toBeNull();
      expect(resolved?.section.id).toBe('peak-hours');
      expect(resolved?.currency).toBe('USD');
    });

    it('returns null for an unknown section id', async () => {
      const { service } = setup();
      const resolved = await service.resolveSection('revenue', 'does-not-exist', { range: '30d' });
      expect(resolved).toBeNull();
    });
  });
});
