import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingStatus,
  LoyaltyRedemptionStatus,
  LoyaltyRewardType,
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
import type { GymLocaleService } from '../gyms/gym-locale.service';

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
  const loyaltyLedgerEntryFindMany = vi.fn().mockResolvedValue([]);
  const loyaltyRedemptionFindMany = vi.fn().mockResolvedValue([]);
  const refundFindMany = vi.fn().mockResolvedValue([]);
  const orderFindMany = vi.fn().mockResolvedValue([]);

  const client = {
    payment: { findMany: paymentFindMany, findFirst: paymentFindFirst },
    gymMember: { findMany: gymMemberFindMany, count: gymMemberCount },
    subscription: { findMany: subscriptionFindMany },
    checkIn: { findMany: checkInFindMany },
    classInstance: { findMany: classInstanceFindMany },
    booking: { findMany: bookingFindMany },
    review: { findMany: reviewFindMany },
    loyaltyLedgerEntry: { findMany: loyaltyLedgerEntryFindMany },
    loyaltyRedemption: { findMany: loyaltyRedemptionFindMany },
    refund: { findMany: refundFindMany },
    order: { findMany: orderFindMany },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;
  // The gym's configured currency (Settings → General) — what a report falls back
  // to when its window holds no money rows to read a currency off.
  const locale = {
    get: () => Promise.resolve({ language: 'en', currency: 'GEL', timezone: 'Asia/Tbilisi' }),
  } as unknown as GymLocaleService;

  return {
    service: new ReportDrilldownService(prisma, tenant, locale),
    paymentFindMany,
    paymentFindFirst,
    gymMemberFindMany,
    gymMemberCount,
    subscriptionFindMany,
    checkInFindMany,
    classInstanceFindMany,
    bookingFindMany,
    reviewFindMany,
    loyaltyLedgerEntryFindMany,
    loyaltyRedemptionFindMany,
    refundFindMany,
    orderFindMany,
  };
}

/** A captured-payment row as the SALES drill-down's `select` projects it. */
function salePayment(
  amount: number,
  createdAt: string,
  method: PaymentMethod,
  seller: { id: string; first: string; last: string } | null,
) {
  return {
    amount,
    currency: 'GEL',
    method,
    createdAt: new Date(createdAt),
    order: {
      soldById: seller?.id ?? null,
      soldBy: seller ? { firstName: seller.first, lastName: seller.last, user: null } : null,
    },
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
    // The plan still comes off the order; the BRANCH is the payment's own column
    // since Stage 5 — the same one the `where` filters, so the breakdown cannot
    // disagree with the filter that produced it.
    order: { package: plan === null ? null : { name: plan } },
    location: location === null ? null : { name: location },
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

  describe('sales', () => {
    it('subtracts a refund on the day it was ISSUED, not from the sale that earned it', async () => {
      const { service, paymentFindMany, refundFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        salePayment(10_000, '2026-05-20T09:00:00.000Z', PaymentMethod.CARD, null),
      ]);
      // The refund lands eight days after the sale — a different bucket.
      refundFindMany.mockResolvedValue([
        {
          amount: 4_000,
          createdAt: new Date('2026-05-28T09:00:00.000Z'),
          orderId: 'cmzzzzzzzzwxyz9876',
          reason: 'Returned',
          processedBy: { firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
      ]);

      const result = await service.run('sales', { range: '30d' });

      const series = result.sections.find(
        (s) => s.id === 'net-sales-over-time',
      ) as ReportSeriesSection;
      const saleDay = series.points.find((p) => p.label === '2026-05-20');
      const refundDay = series.points.find((p) => p.label === '2026-05-28');
      // The sale's own day keeps its full value; the refund shows as a negative on
      // its own. Netting it back onto 2026-05-20 would restate a reported day.
      expect(saleDay?.value).toBe(10_000);
      expect(refundDay?.value).toBe(-4_000);
      expect(result.kpis).toEqual([
        { id: 'gross-sales', label: 'Gross sales', value: 10_000, unit: 'money' },
        { id: 'refunds', label: 'Refunds', value: 4_000, unit: 'money' },
        { id: 'net-sales', label: 'Net sales', value: 6_000, unit: 'money' },
        { id: 'sale-count', label: 'Sales', value: 1, unit: 'count' },
      ]);
    });

    it('splits the settlement mix and gives sales with no seller their own bar', async () => {
      const { service, paymentFindMany } = setup();
      const mariam = { id: 'staff-1', first: 'Mariam', last: 'Beridze' };
      paymentFindMany.mockResolvedValue([
        salePayment(9_000, '2026-05-20T09:00:00.000Z', PaymentMethod.CARD, mariam),
        salePayment(2_500, '2026-05-21T09:00:00.000Z', PaymentMethod.CASH, mariam),
        // A self-serve online purchase — captured, but nobody sold it.
        salePayment(12_000, '2026-05-22T09:00:00.000Z', PaymentMethod.CARD, null),
      ]);

      const result = await service.run('sales', { range: '30d' });

      const method = result.sections.find(
        (s) => s.id === 'sales-mix-by-method',
      ) as ReportBreakdownSection;
      expect(method.items).toEqual([
        { label: 'Card', value: 21_000 },
        { label: 'Cash', value: 2_500 },
      ]);

      const seller = result.sections.find(
        (s) => s.id === 'sales-by-seller',
      ) as ReportBreakdownSection;
      expect(seller.items).toEqual([
        { label: 'Unattributed', value: 12_000 },
        { label: 'Mariam Beridze', value: 11_500 },
      ]);
    });

    it('lists recent refunds with the operator who issued each one', async () => {
      const { service, refundFindMany } = setup();
      refundFindMany.mockResolvedValue([
        {
          amount: 4_500,
          createdAt: new Date('2026-06-07T10:30:00.000Z'),
          orderId: 'cmabcdefgh12345678',
          reason: 'Wrong size, one returned',
          processedBy: { firstName: 'Mariam', lastName: 'Beridze', user: null },
        },
      ]);

      const result = await service.run('sales', { range: '30d' });

      const table = result.sections.find((s) => s.id === 'recent-refunds') as ReportTableSection;
      expect(table.rows[0]).toEqual({
        date: '2026-06-07',
        order: '12345678',
        amount: 4_500,
        reason: 'Wrong size, one returned',
        processedBy: 'Mariam Beridze',
      });
    });
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

    it("falls back to the gym's configured currency when the window is empty", async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([]);

      const result = await service.run('revenue', { range: '30d' });

      expect(result.currency).toBe('GEL');
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

  /**
   * The branch filter (roadmap Stage 1). As in the catalogue service, thehalf
   * that matters most is the metrics that CANNOT narrow: they must ignore the
   * parameter rather than filter on a column nothing writes.
   */
  describe('branch filter', () => {
    /** The `where` the nth call to a stubbed delegate was issued with. */
    const whereOf = (mock: { mock: { calls: unknown[][] } }, call = 0) =>
      (mock.mock.calls[call]?.[0] as { where?: Record<string, unknown> } | undefined)?.where ?? {};

    it('adds no location predicate at all when no branch is selected', async () => {
      const { service, paymentFindMany } = setup();

      await service.run('revenue', { range: '30d' });

      expect(whereOf(paymentFindMany)).not.toHaveProperty('order');
    });

    // Inverted by Stage 5: all three money tables now carry the branch on the row,
    // so every read here is one equality. The property is unchanged — the three
    // money metrics narrow by the branch that RANG THE SALE UP — and the relation
    // shape is now what must never reappear.
    it('scopes the money metrics on each row’s own branch column', async () => {
      const { service, paymentFindMany, refundFindMany, orderFindMany } = setup();

      await service.run('revenue', { range: '30d', locationId: 'loc-1' });
      await service.run('pos', { range: '30d', locationId: 'loc-1' });
      await service.run('sales', { range: '30d', locationId: 'loc-1' });

      for (const call of [0, 1, 2]) {
        expect(whereOf(paymentFindMany, call).locationId).toBe('loc-1');
        expect(whereOf(paymentFindMany, call)).not.toHaveProperty('order');
      }
      expect(whereOf(refundFindMany).locationId).toBe('loc-1');
      expect(whereOf(refundFindMany)).not.toHaveProperty('order');
      // The sales metric's plan orders read `Order` directly — its own column, and
      // the one place an `order` key is still legitimate here.
      expect(whereOf(orderFindMany).locationId).toBe('loc-1');
    });

    it('scopes the class metrics through the instance, on both sides', async () => {
      const { service, classInstanceFindMany, bookingFindMany } = setup();

      await service.run('classes', { range: '30d', locationId: 'loc-1' });

      // Instances and bookings must come from the SAME population, or the seat
      // counts stop reconciling with the session counts in the same table.
      expect(whereOf(classInstanceFindMany).locationId).toBe('loc-1');
      expect(whereOf(bookingFindMany).classInstance).toMatchObject({ locationId: 'loc-1' });
    });

    it('narrows a trainer’s delivery but not their rating', async () => {
      const { service, classInstanceFindMany, bookingFindMany, reviewFindMany } = setup();

      await service.run('staff', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(classInstanceFindMany).locationId).toBe('loc-1');
      expect(whereOf(bookingFindMany).classInstance).toMatchObject({ locationId: 'loc-1' });
      // A review is written about a TRAINER and carries no branch — an average
      // rating is a property of the person, not a quantity produced at a branch.
      expect(whereOf(reviewFindMany)).not.toHaveProperty('locationId');
    });

    // Stage 2 gave `GymMember` a home branch. This assertion is the inverse of the
    // one that stood here — `members` and `loyalty` moved out of the gym-wide list,
    // `attendance` did not — and the property it pins is the same: every read
    // inside one metric moves together, or a rate ends up with a numerator and a
    // denominator drawn from different populations.
    it('narrows members and loyalty by the home branch, on every read', async () => {
      const {
        service,
        gymMemberFindMany,
        gymMemberCount,
        subscriptionFindMany,
        loyaltyLedgerEntryFindMany,
        loyaltyRedemptionFindMany,
      } = setup();

      await service.run('members', { range: '30d', locationId: 'loc-1' });
      await service.run('loyalty', { range: '30d', locationId: 'loc-1' });

      // `GymMember` owns the column; everything else hops through `member`.
      expect(whereOf(gymMemberFindMany).locationId).toBe('loc-1');
      expect(whereOf(gymMemberCount).locationId).toBe('loc-1');
      expect(whereOf(subscriptionFindMany).member).toEqual({ locationId: 'loc-1' });
      // `memberId` is NOT NULL on both loyalty tables, so the hop drops no row and
      // the branches still sum to the gym's own ledger.
      expect(whereOf(loyaltyLedgerEntryFindMany).member).toEqual({ locationId: 'loc-1' });
      expect(whereOf(loyaltyRedemptionFindMany).member).toEqual({ locationId: 'loc-1' });
    });

    // Stage 3 gave `CheckIn` a real branch and a write path, so this assertion is
    // the inverse of the one that stood here. The property it protects is the one
    // that made the old exemption right and now makes the filter right: a check-in
    // is an event at a PLACE, so it narrows by the door the visitor came through
    // and NEVER by the member hop — a home branch says whose member they are, not
    // where they walked in, and a heatmap built the second way would be read as
    // this branch's footfall and used to roster staff against it.
    it('narrows attendance by the branch each arrival walked into', async () => {
      const { service, checkInFindMany } = setup();

      await service.run('attendance', { range: '30d', locationId: 'loc-1' });

      expect(whereOf(checkInFindMany).locationId).toBe('loc-1');
      expect(whereOf(checkInFindMany)).not.toHaveProperty('member');
      // Redundant since `CheckIn` joined the tenant extension's model set, kept as
      // belt and braces on the one read here that would leak another gym's visits.
      expect(whereOf(checkInFindMany).gymId).toBe('gym-1');
    });

    // "All branches" must leave the read's original, index-served plan untouched —
    // no `locationId: undefined` key, which would narrow to the un-homed visits.
    it('sends no location clause on attendance when no branch is selected', async () => {
      const { service, checkInFindMany } = setup();

      await service.run('attendance', { range: '30d' });

      expect(whereOf(checkInFindMany)).not.toHaveProperty('locationId');
      expect(whereOf(checkInFindMany).gymId).toBe('gym-1');
    });

    // The export and the pinned-section routes both go through `compute`, so the
    // file and the widget cannot show a different branch from the screen they came
    // from. Asserted on `attendance` specifically because it is the metric that
    // just gained the filter, and the one whose exports were previously immune.
    it('carries the branch into a resolved attendance section', async () => {
      const { service, checkInFindMany } = setup();

      await service.resolveSection('attendance', 'peak-hours', {
        range: '30d',
        locationId: 'loc-1',
      });

      expect(whereOf(checkInFindMany).locationId).toBe('loc-1');
    });

    // Not `locationId: undefined`, and no empty `member` key: "all branches" must
    // leave each read's original, index-served plan untouched.
    it('sends no member clause at all when no branch is selected', async () => {
      const { service, gymMemberFindMany, subscriptionFindMany, loyaltyLedgerEntryFindMany } =
        setup();

      await service.run('members', { range: '30d' });
      await service.run('loyalty', { range: '30d' });

      expect(whereOf(gymMemberFindMany)).not.toHaveProperty('locationId');
      expect(whereOf(subscriptionFindMany)).not.toHaveProperty('member');
      expect(whereOf(loyaltyLedgerEntryFindMany)).not.toHaveProperty('member');
    });

    it('collapses the revenue-by-location section to the selected branch', async () => {
      const { service, paymentFindMany } = setup();
      paymentFindMany.mockResolvedValue([
        {
          amount: 10_000,
          refundedAmount: 0,
          currency: 'GEL',
          createdAt: new Date(),
          order: { package: null },
          location: { name: 'Vake' },
        },
      ]);

      const result = await service.run('revenue', { range: '30d', locationId: 'loc-1' });

      const byLocation = result.sections.find(
        (s) => s.id === 'revenue-by-location',
      ) as ReportBreakdownSection;
      // A breakdown of one thing is one item — the section's contract fixes its
      // shape, not its length.
      expect(byLocation.items).toEqual([{ label: 'Vake', value: 10_000 }]);
    });

    // A downloaded file that disagrees with the screen it came from is worse than
    // no filter, and a pinned dashboard widget is the same hazard by another route.
    it('applies the same filter to the exports and to a pinned section', async () => {
      const { service, paymentFindMany } = setup();

      for await (const _chunk of service.streamDrilldownCsv('revenue', {
        range: '30d',
        locationId: 'loc-1',
      })) {
        // drained so the generator actually issues its query
      }
      await service.buildDrilldownXlsx('revenue', {
        range: '30d',
        locationId: 'loc-1',
      });
      await service.resolveSection('revenue', 'revenue-over-time', {
        range: '30d',
        locationId: 'loc-1',
      });

      for (const call of [0, 1, 2]) {
        expect(whereOf(paymentFindMany, call).locationId).toBe('loc-1');
      }
    });
  });

  describe('resolveSection', () => {
    it('returns a section by id with the report currency', async () => {
      const { service, checkInFindMany } = setup();
      checkInFindMany.mockResolvedValue([]);

      const resolved = await service.resolveSection('attendance', 'peak-hours', { range: '30d' });

      expect(resolved).not.toBeNull();
      expect(resolved?.section.id).toBe('peak-hours');
      expect(resolved?.currency).toBe('GEL');
    });

    it('returns null for an unknown section id', async () => {
      const { service } = setup();
      const resolved = await service.resolveSection('revenue', 'does-not-exist', { range: '30d' });
      expect(resolved).toBeNull();
    });
  });
});
