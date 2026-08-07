import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvoiceStatus,
  LocationStatus,
  PaymentStatus,
  SubscriptionInterval,
  SubscriptionStatus,
} from '@fit/db';
import { DashboardRevenueService } from './dashboard-revenue.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { GymLocaleService } from '../gyms/gym-locale.service';

/**
 * A stub gym locale. The tab's currency comes from the gym's SETTINGS now, not
 * from whichever payment row Postgres returned last, so every spec states it
 * here explicitly rather than seeding a currency onto the fixture rows.
 */
function stubLocale(currency = 'GEL', timezone = 'UTC') {
  return {
    get: vi.fn().mockResolvedValue({ language: 'ka', currency, timezone }),
  } as unknown as GymLocaleService;
}

/** Frozen "now", so every window and projection boundary in this file is exact. */
const NOW = new Date('2026-08-07T12:00:00.000Z');
const TODAY = new Date('2026-08-07T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** A day offset from today's UTC start, as a Date. */
function day(offset: number): Date {
  return new Date(TODAY.getTime() + offset * DAY);
}

function setup(
  rows: {
    payments?: unknown[];
    paidInvoices?: unknown[];
    unsettled?: unknown[];
    subscriptions?: unknown[];
    locations?: number;
  },
  locales: GymLocaleService = stubLocale(),
) {
  const paymentFindMany = vi.fn().mockResolvedValue(rows.payments ?? []);
  // The two invoice reads are distinguished by their `where.status` shape: the
  // paid read names one status, the unsettled read names an `in` list.
  const invoiceFindMany = vi.fn((args: { where: { status: unknown } }) =>
    Promise.resolve(
      args.where.status === InvoiceStatus.PAID ? (rows.paidInvoices ?? []) : (rows.unsettled ?? []),
    ),
  );
  const subscriptionFindMany = vi.fn().mockResolvedValue(rows.subscriptions ?? []);
  const locationCount = vi.fn().mockResolvedValue(rows.locations ?? 1);

  const client = {
    payment: { findMany: paymentFindMany },
    invoice: { findMany: invoiceFindMany },
    subscription: { findMany: subscriptionFindMany },
    location: { count: locationCount },
  };
  const prisma = { client } as unknown as TenantPrismaService;
  return {
    service: new DashboardRevenueService(prisma, locales),
    paymentFindMany,
    invoiceFindMany,
    subscriptionFindMany,
    locationCount,
  };
}

function payment(over: Record<string, unknown> = {}) {
  return {
    amount: 100_00,
    refundedAmount: 0,
    currency: 'GEL',
    createdAt: day(-1),
    order: { location: { name: 'Vake' } },
    ...over,
  };
}

function invoice(over: Record<string, unknown> = {}) {
  return { amount: 50_00, currency: 'GEL', issuedAt: day(-1), ...over };
}

function subscription(over: Record<string, unknown> = {}) {
  return {
    memberId: 'm1',
    status: SubscriptionStatus.ACTIVE,
    createdAt: day(-90),
    canceledAt: null,
    updatedAt: day(-90),
    priceAmount: 60_00,
    interval: SubscriptionInterval.MONTH,
    currentPeriodEnd: day(3),
    cancelAtPeriodEnd: false,
    ...over,
  };
}

const QUERY = { granularity: 'daily', projectionWindow: '7' } as const;

describe('DashboardRevenueService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /* -- Streams --------------------------------------------------------- */

  // The whole double-count guard: a POS order mints a Payment AND may mint an
  // Invoice carrying its orderId. Only `orderId: null` invoices are recurring.
  it('reads subscription revenue with orderId null, so order invoices cannot double-count', async () => {
    const { service, invoiceFindMany } = setup({});
    await service.get(QUERY);
    const paidRead = invoiceFindMany.mock.calls.find(
      ([args]) => args.where.status === InvoiceStatus.PAID,
    );
    expect(paidRead?.[0]).toMatchObject({ where: { orderId: null } });
  });

  it('splits the trend into recurring and one-off, net of refunds', async () => {
    const { service } = setup({
      payments: [payment({ amount: 100_00, refundedAmount: 20_00, createdAt: day(-1) })],
      paidInvoices: [invoice({ amount: 50_00, issuedAt: day(-1) })],
    });
    const result = await service.get(QUERY);
    const bucket = result.revenueOverTime.find((point) => point.label === '2026-08-06');
    expect(bucket).toEqual({ label: '2026-08-06', recurring: 50_00, oneOff: 80_00 });
    expect(result.kpis.totalRevenue).toBe(130_00);
  });

  // 31, not 30: `resolveWindow('30d')` opens 30x24h before a mid-day "now", and
  // `emptyBuckets` anchors the first bucket to that instant's own UTC day — so the
  // part-day at each end is a bucket of its own.
  it('zero-fills every bucket of a window with no revenue', async () => {
    const { service } = setup({});
    const result = await service.get(QUERY);
    expect(result.revenueOverTime).toHaveLength(31);
    expect(result.revenueOverTime[0]?.label).toBe('2026-07-08');
    expect(result.revenueOverTime[30]?.label).toBe('2026-08-07');
    expect(result.revenueOverTime.every((p) => p.recurring === 0 && p.oneOff === 0)).toBe(true);
    expect(result.mrrOverTime).toHaveLength(31);
  });

  /* -- MRR ------------------------------------------------------------- */

  it('normalises a yearly plan to a month', async () => {
    const { service } = setup({
      subscriptions: [subscription({ interval: SubscriptionInterval.YEAR, priceAmount: 1200_00 })],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.mrr).toBe(100_00);
  });

  it('excludes a trial, a past-due and a frozen plan from current MRR', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ status: SubscriptionStatus.TRIAL, updatedAt: day(-2) }),
        subscription({ memberId: 'm2', status: SubscriptionStatus.PAST_DUE, updatedAt: day(-2) }),
        subscription({ memberId: 'm3', status: SubscriptionStatus.FROZEN, updatedAt: day(-2) }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.mrr).toBe(0);
  });

  // Without the updatedAt boundary a gym that churned half its base would draw a
  // flat, low line for its whole history.
  it('counts a since-cancelled plan in the buckets before it churned', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.CANCELED,
          canceledAt: day(-5),
          updatedAt: day(-5),
        }),
      ],
    });
    const result = await service.get(QUERY);
    const before = result.mrrOverTime.find((p) => p.label === '2026-08-01');
    const after = result.mrrOverTime.find((p) => p.label === '2026-08-06');
    expect(before?.value).toBe(60_00);
    expect(after?.value).toBe(0);
    expect(result.kpis.mrr).toBe(0);
  });

  /* -- Revenue per member ---------------------------------------------- */

  it('divides window revenue by the members live at the window end', async () => {
    const { service } = setup({
      payments: [payment({ amount: 100_00 })],
      subscriptions: [subscription(), subscription({ memberId: 'm2' })],
    });
    const result = await service.get(QUERY);
    expect(result.kpis.revenuePerMember).toBe(50_00);
  });

  it('reports zero rather than dividing by no members', async () => {
    const { service } = setup({ payments: [payment({ amount: 100_00 })] });
    const result = await service.get(QUERY);
    expect(result.kpis.revenuePerMember).toBe(0);
  });

  /* -- Outstanding ------------------------------------------------------ */

  it('counts pending and failed invoices, with overdue and failed as subsets', async () => {
    const { service } = setup({
      unsettled: [
        { amount: 10_00, status: InvoiceStatus.PENDING, dueDate: day(-1) },
        { amount: 20_00, status: InvoiceStatus.PENDING, dueDate: day(3) },
        { amount: 30_00, status: InvoiceStatus.FAILED, dueDate: null },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.outstanding).toEqual({
      count: 3,
      total: 60_00,
      overdueCount: 1,
      overdueTotal: 10_00,
      failedCount: 1,
      failedTotal: 30_00,
    });
    expect(result.kpis.outstandingTotal).toBe(60_00);
  });

  // The boundary: due at today's UTC start is due TODAY, not late.
  it('treats a due date at today start as not yet overdue', async () => {
    const { service } = setup({
      unsettled: [
        { amount: 10_00, status: InvoiceStatus.PENDING, dueDate: TODAY },
        { amount: 20_00, status: InvoiceStatus.PENDING, dueDate: new Date(TODAY.getTime() - 1) },
      ],
    });
    const result = await service.get(QUERY);
    expect(result.outstanding.overdueCount).toBe(1);
    expect(result.outstanding.overdueTotal).toBe(20_00);
  });

  it('never calls an invoice with no due date overdue', async () => {
    const { service } = setup({
      unsettled: [{ amount: 10_00, status: InvoiceStatus.PENDING, dueDate: null }],
    });
    const result = await service.get(QUERY);
    expect(result.outstanding.count).toBe(1);
    expect(result.outstanding.overdueCount).toBe(0);
  });

  /* -- Projection ------------------------------------------------------- */

  it('buckets an upcoming charge on the day it falls due', async () => {
    const { service } = setup({ subscriptions: [subscription({ currentPeriodEnd: day(3) })] });
    const result = await service.get(QUERY);
    expect(result.projected.points).toHaveLength(7);
    expect(result.projected.points.find((p) => p.label === '2026-08-10')?.value).toBe(60_00);
    expect(result.projected.total).toBe(60_00);
  });

  it('excludes a charge beyond the window and one already scheduled to end', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ currentPeriodEnd: day(9) }),
        subscription({ memberId: 'm2', currentPeriodEnd: day(2), cancelAtPeriodEnd: true }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.projected.total).toBe(0);
  });

  it('includes a trial converting inside the window and excludes a frozen plan', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.TRIAL,
          priceAmount: 40_00,
          currentPeriodEnd: day(2),
        }),
        subscription({
          memberId: 'm2',
          status: SubscriptionStatus.FROZEN,
          priceAmount: 90_00,
          currentPeriodEnd: day(2),
        }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.projected.total).toBe(40_00);
  });

  it('reports past-due plans beside the projection, never inside it', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.PAST_DUE,
          priceAmount: 25_00,
          currentPeriodEnd: day(1),
        }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.projected.total).toBe(0);
    expect(result.projected.atRiskCount).toBe(1);
    expect(result.projected.atRiskTotal).toBe(25_00);
  });

  it('covers thirty days when the wider window is asked for', async () => {
    const { service } = setup({ subscriptions: [subscription({ currentPeriodEnd: day(20) })] });
    const result = await service.get({ granularity: 'daily', projectionWindow: '30' });
    expect(result.projected.points).toHaveLength(30);
    expect(result.projected.total).toBe(60_00);
  });

  /* -- Locations -------------------------------------------------------- */

  it('reports no location breakdown at all for a single-location gym', async () => {
    const { service, locationCount } = setup({ payments: [payment()], locations: 1 });
    const result = await service.get(QUERY);
    expect(result.byLocation).toBeNull();
    expect(locationCount).toHaveBeenCalledWith({ where: { status: LocationStatus.ACTIVE } });
  });

  it('ranks locations by net takings for a multi-location gym', async () => {
    const { service } = setup({
      locations: 2,
      payments: [
        payment({ amount: 40_00, order: { location: { name: 'Vake' } } }),
        payment({ amount: 90_00, order: { location: { name: 'Saburtalo' } } }),
        payment({ amount: 10_00, order: { location: null } }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.byLocation).toEqual([
      { location: 'Saburtalo', value: 90_00 },
      { location: 'Vake', value: 40_00 },
      { location: 'No location', value: 10_00 },
    ]);
  });

  /* -- Envelope --------------------------------------------------------- */

  it('echoes the query back', async () => {
    const { service } = setup({});
    const result = await service.get(QUERY);
    expect(result.granularity).toBe('daily');
    expect(result.projectionWindow).toBe('7');
  });

  // The currency is the GYM'S, from settings. It used to be read off the last
  // row of an unordered `findMany`, which made the label on every money figure
  // whichever row Postgres happened to return last — and left a gym that had
  // taken no money at all with a hardcoded default instead of its own setting.
  it('labels money with the currency the gym is configured in', async () => {
    const { service } = setup({}, stubLocale('EUR'));
    expect((await service.get(QUERY)).currency).toBe('EUR');
  });

  it('ignores the currency stamped on the payment rows', async () => {
    const { service } = setup({ payments: [payment({ currency: 'USD' })] }, stubLocale('GEL'));
    expect((await service.get(QUERY)).currency).toBe('GEL');
  });

  it('scopes the money read to the window and the CAPTURED status', async () => {
    const { service, paymentFindMany } = setup({});
    await service.get(QUERY);
    expect(paymentFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { status: PaymentStatus.CAPTURED, createdAt: { lt: NOW } },
    });
  });

  // Trashed members are not billing; their subscriptions must not inflate MRR,
  // the projection, or the per-member denominator.
  it('excludes trashed members from the subscription read', async () => {
    const { service, subscriptionFindMany } = setup({});
    await service.get(QUERY);
    expect(subscriptionFindMany.mock.calls[0]?.[0]).toMatchObject({
      where: { member: { deletedAt: null } },
    });
  });
});
