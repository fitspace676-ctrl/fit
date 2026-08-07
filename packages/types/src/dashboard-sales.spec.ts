import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SALES_GRANULARITY,
  DEFAULT_SALES_PRODUCT_TYPE,
  SALES_GRANULARITY_RANGE,
  SALES_TOP_SELLERS_LIMIT,
  dashboardSalesQuerySchema,
  dashboardSalesResponseSchema,
} from './dashboard-sales';

describe('dashboardSalesQuerySchema', () => {
  it('defaults an absent query to daily / all', () => {
    expect(dashboardSalesQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_SALES_GRANULARITY,
      productType: DEFAULT_SALES_PRODUCT_TYPE,
    });
  });

  // A hand-edited URL must land on the default, not a 400 — the same forgiving
  // rule `dashboardOverviewQuerySchema` applies to its own params.
  it('falls back to the defaults on unknown values', () => {
    expect(dashboardSalesQuerySchema.parse({ granularity: 'hourly', productType: 'nope' })).toEqual(
      { granularity: 'daily', productType: 'all' },
    );
  });

  it('keeps valid values', () => {
    expect(
      dashboardSalesQuerySchema.parse({ granularity: 'monthly', productType: 'session-packs' }),
    ).toEqual({ granularity: 'monthly', productType: 'session-packs' });
  });
});

describe('SALES_GRANULARITY_RANGE', () => {
  // The whole point of the indirection: no new window or bucket math exists,
  // each granularity is an existing report range.
  it('maps every granularity onto an existing report range', () => {
    expect(SALES_GRANULARITY_RANGE).toEqual({ daily: '30d', weekly: '12w', monthly: '12m' });
  });
});

describe('dashboardSalesResponseSchema', () => {
  it('accepts a fully populated response', () => {
    const parsed = dashboardSalesResponseSchema.parse({
      granularity: 'daily',
      productType: 'all',
      currency: 'GEL',
      kpis: { grossSales: 10_000, netSales: 9_000, refunded: 1_000, avgSale: 4_500 },
      revenueOverTime: [{ label: '2026-08-01', value: 9_000 }],
      salesVsRefunds: [{ label: '2026-08-01', sales: 10_000, refunds: 1_000 }],
      byPaymentMethod: [{ channel: 'pos', method: 'cash', value: 9_000 }],
      topSellers: [{ label: 'Premium', orders: 2, value: 9_000 }],
    });
    expect(parsed.kpis.netSales).toBe(9_000);
    expect(parsed.byPaymentMethod[0]?.channel).toBe('pos');
  });

  // Display labels are i18n keys resolved client-side; the wire stays locale-free.
  it('rejects a payment slice carrying an unknown channel', () => {
    const result = dashboardSalesResponseSchema.safeParse({
      granularity: 'daily',
      productType: 'all',
      currency: 'GEL',
      kpis: { grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 },
      revenueOverTime: [],
      salesVsRefunds: [],
      byPaymentMethod: [{ channel: 'terminal', method: 'cash', value: 0 }],
      topSellers: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('SALES_TOP_SELLERS_LIMIT', () => {
  it('caps the ranked list at eight rows', () => {
    expect(SALES_TOP_SELLERS_LIMIT).toBe(8);
  });
});
