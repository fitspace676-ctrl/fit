import { describe, expect, it, vi } from 'vitest';
import type { DashboardMembersResponse, DashboardSalesResponse } from '@fit/types';
import { DashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';
import type { DashboardSalesService } from './dashboard-sales.service';
import type { DashboardMembersService } from './dashboard-members.service';

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

const EMPTY_MEMBERS: DashboardMembersResponse = {
  granularity: 'daily',
  retentionWindow: '30',
  expiringWindow: '7',
  currency: 'GEL',
  kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
  activeOverTime: [],
  signupsVsChurn: [],
  retention: [],
  byStatus: [],
};

function setup() {
  const get = vi.fn().mockResolvedValue(EMPTY);
  const membersGet = vi.fn().mockResolvedValue(EMPTY_MEMBERS);
  const dashboard = {} as unknown as DashboardService;
  const sales = { get } as unknown as DashboardSalesService;
  const members = { get: membersGet } as unknown as DashboardMembersService;
  return { controller: new DashboardController(dashboard, sales, members), get, membersGet };
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

describe('DashboardController.members', () => {
  it('passes a valid query straight through', async () => {
    const { controller, membersGet } = setup();

    await controller.members({
      granularity: 'weekly',
      retentionWindow: '90',
      expiringWindow: '14',
    });

    expect(membersGet).toHaveBeenCalledWith({
      granularity: 'weekly',
      retentionWindow: '90',
      expiringWindow: '14',
    });
  });

  it('defaults an absent query', async () => {
    const { controller, membersGet } = setup();
    await controller.members({});
    expect(membersGet).toHaveBeenCalledWith({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
    });
  });

  it('falls back to the defaults on unknown values rather than throwing', async () => {
    const { controller, membersGet } = setup();
    await controller.members({ granularity: 'hourly', retentionWindow: '45', expiringWindow: 'x' });
    expect(membersGet).toHaveBeenCalledWith({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
    });
  });
});
