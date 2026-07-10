import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingStatus,
  LeadSource,
  LeadStatus,
  LoyaltyRedemptionStatus,
  LoyaltyRewardType,
  OpportunityStatus,
  PaymentMethod,
  SubscriptionStatus,
} from '@fit/db';
import type {
  ReportBreakdownSection,
  ReportHeatmapSection,
  ReportSeriesSection,
  ReportSplitSection,
  ReportTableSection,
} from '@fit/types';
import { ReportDrilldownService } from './report-drilldown.service';
import { rate } from './report-window.util';
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
  const classInstanceFindMany = vi.fn().mockResolvedValue([]);
  const bookingFindMany = vi.fn().mockResolvedValue([]);
  const reviewFindMany = vi.fn().mockResolvedValue([]);
  const leadFindMany = vi.fn().mockResolvedValue([]);
  const opportunityFindMany = vi.fn().mockResolvedValue([]);
  const loyaltyLedgerEntryFindMany = vi.fn().mockResolvedValue([]);
  const loyaltyRedemptionFindMany = vi.fn().mockResolvedValue([]);

  const client = {
    payment: { findMany: paymentFindMany, findFirst: paymentFindFirst },
    gymMember: { findMany: gymMemberFindMany, count: gymMemberCount },
    subscription: { findMany: subscriptionFindMany },
    checkIn: { findMany: checkInFindMany },
    classInstance: { findMany: classInstanceFindMany },
    booking: { findMany: bookingFindMany },
    review: { findMany: reviewFindMany },
    lead: { findMany: leadFindMany },
    opportunity: { findMany: opportunityFindMany },
    loyaltyLedgerEntry: { findMany: loyaltyLedgerEntryFindMany },
    loyaltyRedemption: { findMany: loyaltyRedemptionFindMany },
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
    classInstanceFindMany,
    bookingFindMany,
    reviewFindMany,
    leadFindMany,
    opportunityFindMany,
    loyaltyLedgerEntryFindMany,
    loyaltyRedemptionFindMany,
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

/** A booking row as the classes report's `select` projects it (title on the instance). */
function booking(status: BookingStatus, startsAt: string, title: string) {
  return {
    status,
    classInstance: { startsAt: new Date(startsAt), template: { title } },
  };
}

/** A booking row as the staff report's `select` projects it (trainer on the template). */
function trainerBooking(status: BookingStatus, trainer: string | null) {
  return {
    status,
    classInstance: {
      template: { trainer: trainer === null ? null : { name: trainer } },
    },
  };
}

/** A captured-payment row as the POS report's `select` projects it. */
function posPayment(
  amount: number,
  refundedAmount: number,
  method: PaymentMethod,
  createdAt: string,
  items: { label: string; amount: number }[],
  currency = 'GEL',
) {
  return {
    amount,
    refundedAmount,
    currency,
    method,
    createdAt: new Date(createdAt),
    order: { items },
  };
}

/** A lead row as the CRM report's `select` projects it. */
function lead(
  source: LeadSource,
  status: LeadStatus,
  expectedValue: number,
  probability: number,
  createdAt: string,
) {
  return { source, status, expectedValue, probability, createdAt: new Date(createdAt) };
}

/** A redemption row as the loyalty report's `select` projects it. */
function redemption(
  rewardName: string,
  rewardType: LoyaltyRewardType,
  pointsSpent: number,
  status: LoyaltyRedemptionStatus,
  redeemedAt = '2026-05-20T09:00:00.000Z',
) {
  return { rewardName, rewardType, pointsSpent, status, redeemedAt: new Date(redeemedAt) };
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

  describe('classes', () => {
    it('aggregates popularity, the attendance split, cancellation trend, and per-class table', async () => {
      const { service, classInstanceFindMany, bookingFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        { capacityOverride: null, bookedCount: 3, template: { title: 'Yoga', capacity: 10 } },
        { capacityOverride: 5, bookedCount: 2, template: { title: 'Spin', capacity: 12 } },
      ]);
      bookingFindMany.mockResolvedValue([
        booking(BookingStatus.ATTENDED, '2026-05-20T09:00:00.000Z', 'Yoga'),
        booking(BookingStatus.ATTENDED, '2026-05-20T09:00:00.000Z', 'Yoga'),
        booking(BookingStatus.NO_SHOW, '2026-05-20T09:00:00.000Z', 'Yoga'),
        booking(BookingStatus.CANCELED, '2026-05-21T09:00:00.000Z', 'Spin'),
      ]);

      const result = await service.run('classes', { range: '30d' });

      expect(result.metric).toBe('classes');
      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['classes-held']).toBe(2);
      expect(kpis['total-booked']).toBe(5); // 3 + 2 bookedCount
      // Attendance rate = attended / (attended + no-show) = 2 / 3.
      expect(kpis['attendance-rate']).toBe(rate(2, 3));
      // Cancellation rate = 1 cancelled / 4 bookings.
      expect(kpis['cancellation-rate']).toBe(rate(1, 4));

      const popular = result.sections.find(
        (s) => s.id === 'most-popular-classes',
      ) as ReportBreakdownSection;
      expect(popular.items).toEqual([
        { label: 'Yoga', value: 3 },
        { label: 'Spin', value: 2 },
      ]);

      const split = result.sections.find(
        (s) => s.id === 'attendance-distribution',
      ) as ReportSplitSection;
      expect(split.slices).toEqual([
        { label: 'Attended', value: 2, tone: 'positive' },
        { label: 'No-show', value: 1, tone: 'negative' },
        { label: 'Cancelled', value: 1, tone: 'neutral' },
      ]);

      const trend = result.sections.find(
        (s) => s.id === 'cancellation-rate-trend',
      ) as ReportSeriesSection;
      expect(trend.unit).toBe('percent');
      // The one cancellation landed on 2026-05-21, whose only booking was cancelled → 100%.
      expect(trend.points.find((p) => p.label === '2026-05-21')?.value).toBe(100);

      const table = result.sections.find((s) => s.id === 'class-performance') as ReportTableSection;
      const yoga = table.rows.find((r) => r.class === 'Yoga');
      expect(yoga).toMatchObject({ sessions: 1, booked: 3, attended: 2, noShow: 1 });
      // Fill rate = booked / capacity = 3 / 10.
      expect(yoga?.fillRate).toBe(rate(3, 10));
    });
  });

  describe('staff', () => {
    it('attributes classes / attendance / bookings per trainer and folds in ratings', async () => {
      const { service, classInstanceFindMany, bookingFindMany, reviewFindMany } = setup();
      classInstanceFindMany.mockResolvedValue([
        { template: { trainer: { name: 'Ana' } } },
        { template: { trainer: { name: 'Ana' } } },
        { template: { trainer: null } }, // → Unassigned
      ]);
      bookingFindMany.mockResolvedValue([
        trainerBooking(BookingStatus.ATTENDED, 'Ana'),
        trainerBooking(BookingStatus.ATTENDED, 'Ana'),
        trainerBooking(BookingStatus.NO_SHOW, 'Ana'),
        trainerBooking(BookingStatus.CANCELED, 'Ana'), // not a confirmed seat
      ]);
      reviewFindMany.mockResolvedValue([
        { trainer: { name: 'Ana' }, rating: 5 },
        { trainer: { name: 'Ana' }, rating: 4 },
        { trainer: null, rating: 3 }, // trainerless review is ignored
      ]);

      const result = await service.run('staff', { range: '30d' });

      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['trainers']).toBe(2); // Ana + Unassigned both taught
      expect(kpis['classes-held']).toBe(3);
      expect(kpis['total-booked']).toBe(3); // 2 attended + 1 no-show held seats

      const taught = result.sections.find(
        (s) => s.id === 'classes-taught-per-trainer',
      ) as ReportBreakdownSection;
      expect(taught.items).toEqual([
        { label: 'Ana', value: 2 },
        { label: 'Unassigned', value: 1 },
      ]);

      const table = result.sections.find((s) => s.id === 'staff-performance') as ReportTableSection;
      const ana = table.rows.find((r) => r.trainer === 'Ana');
      expect(ana).toMatchObject({ classes: 2, booked: 3, attended: 2, noShow: 1, rating: 4.5 });
      expect(ana?.attendanceRate).toBe(rate(2, 3));
    });
  });

  describe('pos', () => {
    it('reports daily sales, method + product breakdowns, and end-of-day summaries', async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        posPayment(10000, 0, PaymentMethod.CARD, '2026-05-20T09:00:00.000Z', [
          { label: 'Protein bar', amount: 6000 },
          { label: 'Shaker', amount: 4000 },
        ]),
        posPayment(5000, 1000, PaymentMethod.CASH, '2026-05-20T15:00:00.000Z', [
          { label: 'Protein bar', amount: 5000 },
          { label: 'Discount', amount: -1000 },
        ]),
      ]);

      const result = await service.run('pos', { range: '30d' });

      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['gross-sales']).toBe(15000);
      expect(kpis['net-sales']).toBe(14000); // 15000 - 1000 refunded
      expect(kpis['transactions']).toBe(2);

      const byMethod = result.sections.find(
        (s) => s.id === 'sales-by-method',
      ) as ReportBreakdownSection;
      // Card net 10000, Cash net 4000 (5000 - 1000).
      expect(byMethod.items).toEqual([
        { label: 'Card', value: 10000 },
        { label: 'Cash', value: 4000 },
      ]);

      const byProduct = result.sections.find(
        (s) => s.id === 'product-sales',
      ) as ReportBreakdownSection;
      // Protein bar 6000 + 5000 = 11000; Shaker 4000; the -1000 discount line is excluded.
      expect(byProduct.items).toEqual([
        { label: 'Protein bar', value: 11000 },
        { label: 'Shaker', value: 4000 },
      ]);

      const eod = result.sections.find((s) => s.id === 'end-of-day') as ReportTableSection;
      expect(eod.rows).toEqual([
        { date: '2026-05-20', transactions: 2, gross: 15000, refunded: 1000, net: 14000 },
      ]);
    });
  });

  describe('crm', () => {
    it('reports leads by source, the funnel, pipeline trend, and source performance', async () => {
      const { service, leadFindMany, opportunityFindMany } = setup();
      leadFindMany.mockResolvedValue([
        lead(LeadSource.INSTAGRAM, LeadStatus.CONVERTED, 100000, 100, '2026-05-20T09:00:00.000Z'),
        lead(LeadSource.INSTAGRAM, LeadStatus.NEW, 50000, 40, '2026-05-21T09:00:00.000Z'),
        lead(LeadSource.REFERRAL, LeadStatus.LOST, 30000, 0, '2026-05-22T09:00:00.000Z'),
      ]);
      opportunityFindMany.mockResolvedValue([
        {
          status: OpportunityStatus.PROPOSAL_SENT,
          value: 20000,
          probability: 50,
          createdAt: new Date('2026-05-23T09:00:00.000Z'),
        },
      ]);

      const result = await service.run('crm', { range: '30d' });

      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['new-leads']).toBe(3);
      expect(kpis['converted']).toBe(1);
      expect(kpis['conversion-rate']).toBe(rate(1, 3));
      // Open pipeline = NEW lead (50000×40%) + open opp (20000×50%) = 20000 + 10000.
      expect(kpis['open-pipeline']).toBe(30000);

      const bySource = result.sections.find(
        (s) => s.id === 'leads-by-source',
      ) as ReportBreakdownSection;
      expect(bySource.items).toEqual([
        { label: 'Instagram', value: 2 },
        { label: 'Referral', value: 1 },
      ]);

      const funnel = result.sections.find(
        (s) => s.id === 'conversion-funnel',
      ) as ReportBreakdownSection;
      // Preserves funnel order (New → Converted → Lost), dropping empty stages.
      expect(funnel.items).toEqual([
        { label: 'New', value: 1 },
        { label: 'Converted', value: 1 },
        { label: 'Lost', value: 1 },
      ]);

      const table = result.sections.find(
        (s) => s.id === 'lead-source-performance',
      ) as ReportTableSection;
      const insta = table.rows.find((r) => r.source === 'Instagram');
      expect(insta).toMatchObject({ leads: 2, converted: 1, wonValue: 100000 });
      expect(insta?.conversionRate).toBe(rate(1, 2));
    });
  });

  describe('loyalty', () => {
    it('reports points issued over time, the issued-vs-redeemed split, and redemptions', async () => {
      const { service, loyaltyLedgerEntryFindMany, loyaltyRedemptionFindMany } = setup();
      loyaltyLedgerEntryFindMany.mockResolvedValue([
        { delta: 100, createdAt: new Date('2026-05-20T09:00:00.000Z') },
        { delta: 50, createdAt: new Date('2026-05-20T12:00:00.000Z') },
        { delta: -80, createdAt: new Date('2026-05-21T09:00:00.000Z') },
      ]);
      loyaltyRedemptionFindMany.mockResolvedValue([
        redemption('Free PT', LoyaltyRewardType.pt_session, 80, LoyaltyRedemptionStatus.fulfilled),
        redemption(
          'Cancelled drink',
          LoyaltyRewardType.drink,
          20,
          LoyaltyRedemptionStatus.cancelled,
        ),
      ]);

      const result = await service.run('loyalty', { range: '30d' });

      const kpis = Object.fromEntries(result.kpis.map((k) => [k.id, k.value]));
      expect(kpis['points-issued']).toBe(150);
      expect(kpis['points-redeemed']).toBe(80);
      expect(kpis['net-points']).toBe(70);
      expect(kpis['redemptions']).toBe(1); // cancelled redemption excluded

      const issued = result.sections.find(
        (s) => s.id === 'points-issued-over-time',
      ) as ReportSeriesSection;
      expect(issued.points.find((p) => p.label === '2026-05-20')?.value).toBe(150);

      const split = result.sections.find(
        (s) => s.id === 'points-issued-vs-redeemed',
      ) as ReportSplitSection;
      expect(split.slices).toEqual([
        { label: 'Issued', value: 150, tone: 'positive' },
        { label: 'Redeemed', value: 80, tone: 'negative' },
      ]);

      const byType = result.sections.find(
        (s) => s.id === 'redemptions-by-reward-type',
      ) as ReportBreakdownSection;
      expect(byType.items).toEqual([{ label: 'PT session', value: 1 }]);

      const recent = result.sections.find(
        (s) => s.id === 'recent-redemptions',
      ) as ReportTableSection;
      // Both redemptions are listed (cancelled included), newest-first from the query.
      expect(recent.rows).toHaveLength(2);
      expect(recent.rows[0]).toMatchObject({ reward: 'Free PT', status: 'Fulfilled' });
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
