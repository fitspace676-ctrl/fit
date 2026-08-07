import { describe, expect, it, vi } from 'vitest';
import type {
  DashboardClassesResponse,
  DashboardMembersResponse,
  DashboardRevenueResponse,
  DashboardSalesResponse,
} from '@fit/types';
import { DashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';
import type { DashboardSalesService } from './dashboard-sales.service';
import type { DashboardMembersService } from './dashboard-members.service';
import type { DashboardRevenueService } from './dashboard-revenue.service';
import type { DashboardClassesService } from './dashboard-classes.service';

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

const EMPTY_REVENUE: DashboardRevenueResponse = {
  granularity: 'daily',
  projectionWindow: '7',
  currency: 'GEL',
  kpis: { totalRevenue: 0, mrr: 0, revenuePerMember: 0, outstandingTotal: 0 },
  revenueOverTime: [],
  mrrOverTime: [],
  projected: { total: 0, points: [], atRiskCount: 0, atRiskTotal: 0 },
  outstanding: {
    count: 0,
    total: 0,
    overdueCount: 0,
    overdueTotal: 0,
    failedCount: 0,
    failedTotal: 0,
  },
  byLocation: null,
};

const EMPTY_CLASSES: DashboardClassesResponse = {
  granularity: 'daily',
  kpis: { classesHeld: 0, seatsBooked: 0, noShowRate: null, utilizationRate: null },
  bookingsOverTime: [],
  attendanceOverTime: [],
  utilizationOverTime: [],
  ptSessionsOverTime: [],
  topClassTypes: [],
  demandByHour: [],
  markedCoverage: null,
};

function setup() {
  const get = vi.fn().mockResolvedValue(EMPTY);
  const membersGet = vi.fn().mockResolvedValue(EMPTY_MEMBERS);
  const dashboard = {} as unknown as DashboardService;
  const sales = { get } as unknown as DashboardSalesService;
  const members = { get: membersGet } as unknown as DashboardMembersService;
  const revenueGet = vi.fn().mockResolvedValue(EMPTY_REVENUE);
  const revenue = { get: revenueGet } as unknown as DashboardRevenueService;
  const classesGet = vi.fn().mockResolvedValue(EMPTY_CLASSES);
  const classes = { get: classesGet } as unknown as DashboardClassesService;
  return {
    controller: new DashboardController(dashboard, sales, members, revenue, classes),
    get,
    membersGet,
    revenueGet,
    classesGet,
  };
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

describe('DashboardController.revenue', () => {
  it('passes a valid query straight through', async () => {
    const { controller, revenueGet } = setup();

    await controller.revenue({ granularity: 'weekly', projectionWindow: '30' });

    expect(revenueGet).toHaveBeenCalledWith({ granularity: 'weekly', projectionWindow: '30' });
  });

  it('defaults an absent query', async () => {
    const { controller, revenueGet } = setup();
    await controller.revenue({});
    expect(revenueGet).toHaveBeenCalledWith({ granularity: 'daily', projectionWindow: '7' });
  });

  it('falls back to the defaults on unknown values rather than throwing', async () => {
    const { controller, revenueGet } = setup();
    await controller.revenue({ granularity: 'hourly', projectionWindow: '999' });
    expect(revenueGet).toHaveBeenCalledWith({ granularity: 'daily', projectionWindow: '7' });
  });
});

describe('DashboardController.classes', () => {
  it('passes a valid query straight through', async () => {
    const { controller, classesGet } = setup();

    await controller.classes({ granularity: 'weekly' });

    expect(classesGet).toHaveBeenCalledWith({ granularity: 'weekly' });
  });

  it('defaults an absent query', async () => {
    const { controller, classesGet } = setup();
    await controller.classes({});
    expect(classesGet).toHaveBeenCalledWith({ granularity: 'daily' });
  });

  it('falls back to the default on an unknown granularity rather than throwing', async () => {
    const { controller, classesGet } = setup();
    await controller.classes({ granularity: 'hourly' });
    expect(classesGet).toHaveBeenCalledWith({ granularity: 'daily' });
  });
});
