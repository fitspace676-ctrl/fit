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
  revenue: ['revenue-over-time', 'revenue-by-location', 'revenue-by-plan'],
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

    const result = await service.get('revenue', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'revenue.over-time',
      'revenue.by-location',
    ]);
  });

  it('honours the gym stored selection and its order', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'revenue.by-location' },
      { widgetKey: 'revenue.over-time' },
    ]);

    const result = await service.get('revenue', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'revenue.by-location',
      'revenue.over-time',
    ]);
  });

  // This test and the next one together guard the two branches of the same
  // dedup logic. No single segment in the current catalogue exercises both at
  // once — the old `sales` fixture did (three widgets, two of them sharing
  // `pos`), but `sales` is now a hand-built view with no catalogue entries.
  // This one is the cross-metric branch: widgets spanning multiple reports must
  // not recompute a report per widget. `classes` is the fixture because its two
  // widgets resolve to two DISTINCT metrics (`classes.most-booked` → the
  // `classes` metric, `classes.peak-hours` → the `attendance` metric) —
  // asserting per metric fails both if a metric is recomputed per widget and if
  // a metric is missed entirely, which a bare total-call-count assertion would
  // not catch.
  it('computes each distinct metric exactly once', async () => {
    const { service, run } = setup();

    await service.get('classes', '7d');

    expect(run.mock.calls.filter((call) => call[0] === 'classes')).toHaveLength(1);
    expect(run.mock.calls.filter((call) => call[0] === 'attendance')).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  // The other branch: two widgets that share ONE metric must not each trigger
  // their own `run` call. `revenue` is the fixture because both its widgets
  // (`revenue.over-time`, `revenue.by-location`) resolve to the same `revenue`
  // metric. Asserting the response still carries both widgets (not just the
  // call count) rules out a degenerate "pass" where the service drops one
  // widget instead of actually sharing the computed report between them.
  it('computes a shared metric once for all the widgets that use it', async () => {
    const { service, run } = setup();

    const result = await service.get('revenue', '7d');

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('revenue', { range: '7d' });
    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'revenue.over-time',
      'revenue.by-location',
    ]);
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

    const result = await service.get('revenue', '7d');

    expect(result.widgets).toEqual([]);
  });

  it('drops a stored key the catalogue no longer defines', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'revenue.retired-widget' },
      { widgetKey: 'revenue.by-location' },
    ]);

    const result = await service.get('revenue', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['revenue.by-location']);
  });

  it('drops a stored key belonging to another segment', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'classes.most-booked' },
      { widgetKey: 'revenue.by-location' },
    ]);

    const result = await service.get('revenue', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['revenue.by-location']);
  });

  it('scopes the read to the caller gym and the asked-for segment', async () => {
    const { service, findMany } = setup();
    await service.get('revenue', '30d');
    expect(findMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', segment: 'revenue' },
      orderBy: { position: 'asc' },
      select: { widgetKey: true },
    });
  });

  it('echoes the segment, the range and the currency', async () => {
    const { service } = setup();
    const result = await service.get('revenue', '30d');
    expect(result.segment).toBe('revenue');
    expect(result.range).toBe('30d');
    expect(result.currency).toBe('GEL');
  });
});

describe('DashboardSegmentsService.setWidgets', () => {
  afterEach(() => vi.clearAllMocks());

  it('replaces the segment slice in one transaction, numbering positions densely', async () => {
    const { service, deleteMany, createMany, txDeleteMany, txCreateMany } = setup();

    await service.setWidgets('revenue', ['revenue.by-location', 'revenue.over-time']);

    expect(txDeleteMany).toHaveBeenCalledWith({ where: { gymId: 'gym-1', segment: 'revenue' } });
    expect(txCreateMany).toHaveBeenCalledWith({
      data: [
        { gymId: 'gym-1', segment: 'revenue', widgetKey: 'revenue.by-location', position: 0 },
        { gymId: 'gym-1', segment: 'revenue', widgetKey: 'revenue.over-time', position: 1 },
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
    await expect(service.setWidgets('revenue', ['revenue.nope'])).rejects.toThrow(/revenue\.nope/);
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it('refuses a key belonging to another segment', async () => {
    const { service, txDeleteMany } = setup();
    await expect(service.setWidgets('revenue', ['classes.most-booked'])).rejects.toThrow(
      /classes\.most-booked/,
    );
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  // A duplicate would trip the (gym, segment, widgetKey) unique index mid-write;
  // rejecting up front turns a 500 into a 400.
  it('refuses a duplicated key', async () => {
    const { service, txDeleteMany } = setup();
    await expect(
      service.setWidgets('revenue', ['revenue.by-location', 'revenue.by-location']),
    ).rejects.toThrow(/revenue\.by-location/);
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it('validates every key before writing anything', async () => {
    const { service, txDeleteMany, txCreateMany } = setup();
    await expect(
      service.setWidgets('revenue', ['revenue.by-location', 'revenue.nope']),
    ).rejects.toThrow();
    expect(txDeleteMany).not.toHaveBeenCalled();
    expect(txCreateMany).not.toHaveBeenCalled();
  });
});
