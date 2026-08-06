import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportDrilldown, ReportMetric } from '@fit/types';
import { DashboardSegmentsService } from './dashboard-segments.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { ReportDrilldownService } from '../reports/report-drilldown.service';

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  // Outer-client spies. A `setWidgets` run must NEVER touch these directly — a
  // statement issued on `this.prisma.client` inside the transaction callback
  // would silently run outside the transaction. `txDeleteMany`/`txCreateMany`
  // below are the ONLY spies the callback handed to `$transaction` exposes, so
  // asserting on them (and asserting these outer ones stay untouched) is what
  // actually proves the writes went through `tx`, not around it.
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const createMany = vi.fn().mockResolvedValue({ count: 0 });
  const txDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const txCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const $transaction = vi.fn((fn: (tx: unknown) => unknown) =>
    Promise.resolve(
      fn({ dashboardWidget: { deleteMany: txDeleteMany, createMany: txCreateMany } }),
    ),
  );

  const client = { dashboardWidget: { findMany, deleteMany, createMany }, $transaction };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;
  const run = vi.fn((metric: ReportMetric) => Promise.resolve(drilldownFor(metric)));
  const currency = vi.fn().mockResolvedValue('GEL');
  const drilldown = { run, currency } as unknown as ReportDrilldownService;

  return {
    service: new DashboardSegmentsService(prisma, tenant, drilldown),
    findMany,
    deleteMany,
    createMany,
    txDeleteMany,
    txCreateMany,
    run,
  };
}

/** Every section id the Spec-1 catalogue references, per metric. */
const SECTIONS: Partial<Record<ReportMetric, string[]>> = {
  pos: ['sales-by-method', 'product-sales'],
  revenue: ['revenue-by-plan', 'revenue-over-time', 'revenue-by-location'],
  members: ['new-members-over-time', 'churn-rate-trend'],
  classes: ['most-popular-classes'],
  attendance: ['peak-hours'],
  staff: ['sessions-booked-per-trainer'],
};

function drilldownFor(metric: ReportMetric): ReportDrilldown {
  return {
    metric,
    name: metric,
    description: '',
    range: '7d',
    currency: 'GEL',
    kpis: [],
    sections: (SECTIONS[metric] ?? []).map((id) => ({
      kind: 'series' as const,
      id,
      title: id,
      unit: 'count' as const,
      points: [],
    })),
  };
}

describe('DashboardSegmentsService.get', () => {
  afterEach(() => vi.clearAllMocks());

  it('falls back to the catalogue default when the gym has stored nothing', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'sales.payment-method',
      'sales.top-products',
      'sales.top-plans',
    ]);
  });

  it('honours the gym stored selection and its order', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'sales.top-plans' },
      { widgetKey: 'sales.payment-method' },
    ]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'sales.top-plans',
      'sales.payment-method',
    ]);
  });

  // The reason this is worth a test: three widgets spanning two reports must not
  // recompute a report per widget.
  it('computes each distinct metric exactly once', async () => {
    const { service, run } = setup();

    await service.get('sales', '7d');

    // sales.payment-method + sales.top-products are `pos`; sales.top-plans is `revenue`.
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map((call) => call[0]).sort()).toEqual(['pos', 'revenue']);
  });

  it('passes the requested range through to the drill-down', async () => {
    const { service, run } = setup();
    await service.get('revenue', '12w');
    expect(run).toHaveBeenCalledWith('revenue', { range: '12w' });
  });

  it('omits a widget whose section the report no longer emits', async () => {
    const { service, run } = setup();
    run.mockImplementation((metric: ReportMetric) =>
      Promise.resolve({ ...drilldownFor(metric), sections: [] }),
    );

    const result = await service.get('sales', '7d');

    expect(result.widgets).toEqual([]);
  });

  it('drops a stored key the catalogue no longer defines', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'sales.retired-widget' },
      { widgetKey: 'sales.top-plans' },
    ]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['sales.top-plans']);
  });

  it('drops a stored key belonging to another segment', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'revenue.over-time' },
      { widgetKey: 'sales.top-plans' },
    ]);

    const result = await service.get('sales', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['sales.top-plans']);
  });

  it('scopes the read to the caller gym and the asked-for segment', async () => {
    const { service, findMany } = setup();
    await service.get('members', '30d');
    expect(findMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', segment: 'members' },
      orderBy: { position: 'asc' },
      select: { widgetKey: true },
    });
  });

  it('echoes the segment, the range and the currency', async () => {
    const { service } = setup();
    const result = await service.get('members', '30d');
    expect(result.segment).toBe('members');
    expect(result.range).toBe('30d');
    expect(result.currency).toBe('GEL');
  });
});

describe('DashboardSegmentsService.setWidgets', () => {
  afterEach(() => vi.clearAllMocks());

  it('replaces the segment slice in one transaction, numbering positions densely', async () => {
    const { service, deleteMany, createMany, txDeleteMany, txCreateMany } = setup();

    await service.setWidgets('sales', ['sales.top-plans', 'sales.payment-method']);

    expect(txDeleteMany).toHaveBeenCalledWith({ where: { gymId: 'gym-1', segment: 'sales' } });
    expect(txCreateMany).toHaveBeenCalledWith({
      data: [
        { gymId: 'gym-1', segment: 'sales', widgetKey: 'sales.top-plans', position: 0 },
        { gymId: 'gym-1', segment: 'sales', widgetKey: 'sales.payment-method', position: 1 },
      ],
    });
    // The writes must go through `tx`, never the outer client — a statement on
    // the outer client inside the transaction callback would silently run
    // outside the transaction.
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('refuses a key the catalogue does not define', async () => {
    const { service, txDeleteMany } = setup();
    await expect(service.setWidgets('sales', ['sales.nope'])).rejects.toThrow(/sales\.nope/);
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses a key belonging to another segment', async () => {
    const { service, txDeleteMany } = setup();
    await expect(service.setWidgets('sales', ['revenue.over-time'])).rejects.toThrow(
      /revenue\.over-time/,
    );
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  // A duplicate would trip the (gym, segment, widgetKey) unique index mid-write;
  // rejecting up front turns a 500 into a 400.
  it('refuses a duplicated key', async () => {
    const { service, txDeleteMany } = setup();
    await expect(
      service.setWidgets('sales', ['sales.top-plans', 'sales.top-plans']),
    ).rejects.toThrow(/sales\.top-plans/);
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it('validates every key before writing anything', async () => {
    const { service, txDeleteMany, txCreateMany } = setup();
    await expect(service.setWidgets('sales', ['sales.top-plans', 'sales.nope'])).rejects.toThrow();
    expect(txDeleteMany).not.toHaveBeenCalled();
    expect(txCreateMany).not.toHaveBeenCalled();
  });
});
