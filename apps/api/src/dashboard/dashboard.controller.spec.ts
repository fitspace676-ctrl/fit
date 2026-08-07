import { describe, expect, it, vi } from 'vitest';
import type { DashboardSalesResponse } from '@fit/types';
import { DashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';
import type { DashboardSalesService } from './dashboard-sales.service';

const EMPTY: DashboardSalesResponse = {
  granularity: 'daily',
  productType: 'all',
  currency: 'GEL',
  kpis: { grossSales: 0, netSales: 0, refunded: 0, avgSale: 0 },
  revenueOverTime: [],
  salesVsRefunds: [],
  byPaymentMethod: [],
  topSellers: [],
};

function setup() {
  const get = vi.fn().mockResolvedValue(EMPTY);
  const dashboard = {} as unknown as DashboardService;
  const sales = { get } as unknown as DashboardSalesService;
  return { controller: new DashboardController(dashboard, sales), get };
}

describe('DashboardController.sales', () => {
  it('passes a valid query straight through', async () => {
    const { controller, get } = setup();

    await controller.sales({ granularity: 'monthly', productType: 'retail' });

    expect(get).toHaveBeenCalledWith({ granularity: 'monthly', productType: 'retail' });
  });

  it('defaults an absent query', async () => {
    const { controller, get } = setup();

    await controller.sales({});

    expect(get).toHaveBeenCalledWith({ granularity: 'daily', productType: 'all' });
  });

  // A hand-edited URL should land on the default window, not a 400 — the same
  // forgiving rule `dashboard-segments.controller.ts` applies to `?range=`.
  it('falls back to the defaults on unknown values rather than throwing', async () => {
    const { controller, get } = setup();

    await controller.sales({ granularity: 'hourly', productType: 'gift-cards' });

    expect(get).toHaveBeenCalledWith({ granularity: 'daily', productType: 'all' });
  });
});
