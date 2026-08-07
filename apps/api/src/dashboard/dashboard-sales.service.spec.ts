import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentMethod } from '@fit/db';
import type { DashboardSalesQuery } from '@fit/types';
import { DashboardSalesService } from './dashboard-sales.service';
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

/** The shape the service selects from an order, on both the payment and refund reads. */
interface OrderStub {
  packageId: string | null;
  creditPack: { id: string } | null;
  items?: { label: string; amount: number }[];
}

/** A membership order: names a plan, minted no credit pack. */
const MEMBERSHIP: OrderStub = { packageId: 'plan-1', creditPack: null, items: [] };
/** A session-pass order: minted a credit pack. */
const SESSION_PACK: OrderStub = { packageId: 'plan-2', creditPack: { id: 'pack-1' }, items: [] };
/** A retail order: neither. */
const RETAIL: OrderStub = { packageId: null, creditPack: null, items: [] };

function payment(over: {
  amount: number;
  refundedAmount?: number;
  createdAt: string;
  method?: PaymentMethod;
  provider?: string;
  order?: OrderStub;
}) {
  return {
    amount: over.amount,
    refundedAmount: over.refundedAmount ?? 0,
    currency: 'GEL',
    method: over.method ?? PaymentMethod.CARD,
    provider: over.provider ?? 'stub',
    createdAt: new Date(over.createdAt),
    order: over.order ?? RETAIL,
  };
}

function refund(over: { amount: number; createdAt: string; order?: OrderStub }) {
  return {
    amount: over.amount,
    createdAt: new Date(over.createdAt),
    order: over.order ?? RETAIL,
  };
}

function setup(
  rows: { payments?: unknown[]; refunds?: unknown[] } = {},
  locales: GymLocaleService = stubLocale(),
) {
  const paymentFindMany = vi.fn().mockResolvedValue(rows.payments ?? []);
  const refundFindMany = vi.fn().mockResolvedValue(rows.refunds ?? []);
  const prisma = {
    client: {
      payment: { findMany: paymentFindMany },
      refund: { findMany: refundFindMany },
    },
  } as unknown as TenantPrismaService;
  return {
    service: new DashboardSalesService(prisma, locales),
    paymentFindMany,
    refundFindMany,
  };
}

const ALL: DashboardSalesQuery = { granularity: 'daily', productType: 'all' };

/** `daily` is a 30-day window ending now, so "today" is always inside it. */
function today(): string {
  return new Date().toISOString();
}

describe('DashboardSalesService.get — KPIs', () => {
  afterEach(() => vi.clearAllMocks());

  it('sums gross, net, refunded and the average sale', async () => {
    const { service } = setup({
      payments: [
        payment({ amount: 10_000, refundedAmount: 2_000, createdAt: today() }),
        payment({ amount: 6_000, createdAt: today() }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.kpis).toEqual({
      grossSales: 16_000,
      netSales: 14_000,
      refunded: 2_000,
      avgSale: 7_000,
    });
  });

  it('reports zeroes — not a division by zero — for an empty window', async () => {
    const { service } = setup();

    const result = await service.get(ALL);

    expect(result.kpis).toEqual({ grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 });
    expect(result.byPaymentMethod).toEqual([]);
    expect(result.topSellers).toEqual([]);
    // The series stay dense: a window with no sales is 30 real zeroes, not [].
    expect(result.revenueOverTime.length).toBeGreaterThan(0);
    expect(result.revenueOverTime.every((point) => point.value === 0)).toBe(true);
  });

  // The currency is the GYM'S, from settings — not the one stamped on whichever
  // payment row Postgres returned last. An empty window used to fall through to
  // a second guess (the drill-down's "latest captured payment"); a gym that has
  // never taken money had no answer at all and got a hardcoded default.
  it('labels money with the currency the gym is configured in', async () => {
    const { service } = setup({}, stubLocale('EUR'));

    const result = await service.get(ALL);

    expect(result.currency).toBe('EUR');
  });
});

describe('DashboardSalesService.get — product type', () => {
  afterEach(() => vi.clearAllMocks());

  const MIXED = [
    payment({ amount: 10_000, createdAt: today(), order: MEMBERSHIP }),
    payment({ amount: 3_000, createdAt: today(), order: SESSION_PACK }),
    payment({ amount: 500, createdAt: today(), order: RETAIL }),
  ];

  it('classifies an order that minted a credit pack as a session pack', async () => {
    const { service } = setup({ payments: MIXED });
    expect((await service.get({ ...ALL, productType: 'session-packs' })).kpis.grossSales).toBe(
      3_000,
    );
  });

  it('classifies a plan order with no credit pack as a membership', async () => {
    const { service } = setup({ payments: MIXED });
    expect((await service.get({ ...ALL, productType: 'memberships' })).kpis.grossSales).toBe(
      10_000,
    );
  });

  it('classifies everything else as retail', async () => {
    const { service } = setup({ payments: MIXED });
    expect((await service.get({ ...ALL, productType: 'retail' })).kpis.grossSales).toBe(500);
  });

  // The filter is tab-wide: it must narrow every output, not just the KPIs.
  it('narrows the payment breakdown and the trend, not only the KPIs', async () => {
    const { service } = setup({
      payments: [
        payment({ amount: 10_000, createdAt: today(), order: MEMBERSHIP, provider: 'stub' }),
        payment({
          amount: 500,
          createdAt: today(),
          order: RETAIL,
          provider: 'pos',
          method: PaymentMethod.CASH,
        }),
      ],
    });

    const result = await service.get({ ...ALL, productType: 'memberships' });

    expect(result.byPaymentMethod).toEqual([{ channel: 'online', method: 'card', value: 10_000 }]);
    expect(result.revenueOverTime.reduce((sum, point) => sum + point.value, 0)).toBe(10_000);
  });

  // A memberships view showing retail refunds against membership sales would be
  // a straightforwardly wrong chart.
  it('applies the filter to refunds too', async () => {
    const { service } = setup({
      payments: [payment({ amount: 10_000, createdAt: today(), order: MEMBERSHIP })],
      refunds: [
        refund({ amount: 400, createdAt: today(), order: RETAIL }),
        refund({ amount: 1_000, createdAt: today(), order: MEMBERSHIP }),
      ],
    });

    const result = await service.get({ ...ALL, productType: 'memberships' });

    expect(result.salesVsRefunds.reduce((sum, point) => sum + point.refunds, 0)).toBe(1_000);
  });
});

describe('DashboardSalesService.get — bucketing', () => {
  afterEach(() => vi.clearAllMocks());

  it('emits a dense daily series across the 30-day window', async () => {
    const { service } = setup();
    const result = await service.get({ ...ALL, granularity: 'daily' });
    // 30 days, inclusive of the partial bucket the window ends in.
    expect(result.revenueOverTime.length).toBeGreaterThanOrEqual(30);
    expect(result.salesVsRefunds).toHaveLength(result.revenueOverTime.length);
  });

  it('emits far fewer buckets monthly than daily', async () => {
    const { service } = setup();
    const daily = await service.get({ ...ALL, granularity: 'daily' });
    const monthly = await service.get({ ...ALL, granularity: 'monthly' });
    expect(monthly.revenueOverTime.length).toBeLessThan(daily.revenueOverTime.length);
    expect(monthly.revenueOverTime.length).toBeGreaterThanOrEqual(12);
  });

  it('windows the reads and orders payments oldest-first', async () => {
    const { service, paymentFindMany, refundFindMany } = setup();

    await service.get(ALL);

    const paymentArgs = paymentFindMany.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date; lt: Date } };
      orderBy: unknown;
    };
    expect(paymentArgs.where.createdAt.gte).toBeInstanceOf(Date);
    expect(paymentArgs.orderBy).toEqual({ createdAt: 'asc' });
    expect(refundFindMany).toHaveBeenCalledTimes(1);
  });

  // THE bug this design exists to prevent. `Payment.refundedAmount` is a running
  // total with no date, so bucketing a refund by it would file the refund in the
  // SALE's bucket. Refunds are dated by `Refund.createdAt`.
  it('dates a refund by its own timestamp, not the sale it reverses', async () => {
    const saleDay = new Date();
    saleDay.setUTCDate(saleDay.getUTCDate() - 10);
    const refundDay = new Date();
    refundDay.setUTCDate(refundDay.getUTCDate() - 2);

    const { service } = setup({
      payments: [
        payment({ amount: 10_000, refundedAmount: 10_000, createdAt: saleDay.toISOString() }),
      ],
      refunds: [refund({ amount: 10_000, createdAt: refundDay.toISOString() })],
    });

    const result = await service.get(ALL);
    const refundKey = refundDay.toISOString().slice(0, 10);
    const saleKey = saleDay.toISOString().slice(0, 10);

    expect(result.salesVsRefunds.find((point) => point.label === refundKey)?.refunds).toBe(10_000);
    expect(result.salesVsRefunds.find((point) => point.label === saleKey)?.refunds).toBe(0);
    expect(result.salesVsRefunds.find((point) => point.label === saleKey)?.sales).toBe(10_000);
  });
});

describe('DashboardSalesService.get — payment breakdown', () => {
  afterEach(() => vi.clearAllMocks());

  it('splits POS from online on the provider and groups by method, descending', async () => {
    const { service } = setup({
      payments: [
        payment({
          amount: 1_000,
          createdAt: today(),
          provider: 'pos',
          method: PaymentMethod.CASH,
        }),
        payment({
          amount: 5_000,
          createdAt: today(),
          provider: 'pos',
          method: PaymentMethod.CARD,
        }),
        payment({
          amount: 9_000,
          createdAt: today(),
          provider: 'stub',
          method: PaymentMethod.CARD,
        }),
        payment({
          amount: 200,
          createdAt: today(),
          provider: 'pos',
          method: PaymentMethod.MEMBER_ACCOUNT,
        }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.byPaymentMethod).toEqual([
      { channel: 'online', method: 'card', value: 9_000 },
      { channel: 'pos', method: 'card', value: 5_000 },
      { channel: 'pos', method: 'cash', value: 1_000 },
      { channel: 'pos', method: 'member-account', value: 200 },
    ]);
  });
});

describe('DashboardSalesService.get — top sellers', () => {
  afterEach(() => vi.clearAllMocks());

  it('ranks by value, counts distinct orders, and ignores discount lines', async () => {
    const { service } = setup({
      payments: [
        payment({
          amount: 6_000,
          createdAt: today(),
          order: {
            packageId: null,
            creditPack: null,
            items: [
              { label: 'Protein bar', amount: 1_000 },
              { label: 'Premium', amount: 5_500 },
              { label: 'Promo SUMMER', amount: -500 },
            ],
          },
        }),
        payment({
          amount: 1_000,
          createdAt: today(),
          order: {
            packageId: null,
            creditPack: null,
            items: [{ label: 'Protein bar', amount: 1_000 }],
          },
        }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.topSellers).toEqual([
      { label: 'Premium', orders: 1, value: 5_500 },
      { label: 'Protein bar', orders: 2, value: 2_000 },
    ]);
  });

  it('caps the list at eight rows', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i}`,
      amount: (i + 1) * 100,
    }));
    const { service } = setup({
      payments: [
        payment({
          amount: 7_800,
          createdAt: today(),
          order: { packageId: null, creditPack: null, items },
        }),
      ],
    });

    const result = await service.get(ALL);

    expect(result.topSellers).toHaveLength(8);
    expect(result.topSellers[0]?.label).toBe('Item 11');
  });
});
