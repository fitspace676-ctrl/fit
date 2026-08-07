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

    const result = await service.get('staff', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['staff.sessions-per-trainer']);
  });

  // "honours the gym stored selection and its order" is DELETED, not skipped: it
  // needed a segment with two widgets to put in the wrong order, and `staff` — the
  // last configurable segment — has one. Restore it from git history when the
  // catalogue grows again.

  // BOTH branches of the dedup logic have lost their fixture. The cross-metric one
  // needed `classes` (`classes.most-booked` -> the `classes` metric,
  // `classes.peak-hours` -> `attendance`); the shared-metric one needed `revenue`.
  // Both are hand-built views now, and `staff` resolves one widget to one metric,
  // so neither branch can be exercised through the public API. The logic is still
  // in the service. Restore these cases from git history the moment a segment with
  // two widgets returns — and if none does, the dedup is dead code to delete with
  // the rest of the widget machinery.

  it('passes the requested range through to the drill-down', async () => {
    const { service, run } = setup();
    await service.get('staff', '12w');
    expect(run).toHaveBeenCalledWith('staff', { range: '12w' });
  });

  it('omits a widget whose section the report no longer emits', async () => {
    const { service, run } = setup();
    run.mockImplementation((metric: ReportMetric) =>
      Promise.resolve({ ...drilldownFor(metric), sections: [] }),
    );

    const result = await service.get('staff', '7d');

    expect(result.widgets).toEqual([]);
  });

  it('drops a stored key the catalogue no longer defines', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { widgetKey: 'staff.retired-widget' },
      { widgetKey: 'staff.sessions-per-trainer' },
    ]);

    const result = await service.get('staff', '7d');

    expect(result.widgets.map((widget) => widget.key)).toEqual(['staff.sessions-per-trainer']);
  });

  // "drops a stored key belonging to another segment" is DELETED, not skipped: with
  // one segment in the catalogue there is no other segment's key to store, and a
  // made-up one would exercise the unknown-key branch above instead — passing for
  // the wrong reason. Restore it from git history when a second segment returns.

  it('scopes the read to the caller gym and the asked-for segment', async () => {
    const { service, findMany } = setup();
    await service.get('staff', '30d');
    expect(findMany).toHaveBeenCalledWith({
      where: { gymId: 'gym-1', segment: 'staff' },
      orderBy: { position: 'asc' },
      select: { widgetKey: true },
    });
  });

  it('echoes the segment, the range and the currency', async () => {
    const { service } = setup();
    const result = await service.get('staff', '30d');
    expect(result.segment).toBe('staff');
    expect(result.range).toBe('30d');
    expect(result.currency).toBe('GEL');
  });
});

describe('DashboardSegmentsService.setWidgets', () => {
  afterEach(() => vi.clearAllMocks());

  it('replaces the segment slice in one transaction, numbering positions densely', async () => {
    const { service, deleteMany, createMany, txDeleteMany, txCreateMany } = setup();

    await service.setWidgets('staff', ['staff.sessions-per-trainer']);

    expect(txDeleteMany).toHaveBeenCalledWith({ where: { gymId: 'gym-1', segment: 'staff' } });
    expect(txCreateMany).toHaveBeenCalledWith({
      data: [
        { gymId: 'gym-1', segment: 'staff', widgetKey: 'staff.sessions-per-trainer', position: 0 },
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
    await expect(service.setWidgets('staff', ['staff.nope'])).rejects.toThrow(/staff\.nope/);
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  // "refuses a key belonging to another segment" is DELETED for the same reason as
  // its read-side twin above: no other segment's key exists to offer.

  // A duplicate would trip the (gym, segment, widgetKey) unique index mid-write;
  // rejecting up front turns a 500 into a 400.
  it('refuses a duplicated key', async () => {
    const { service, txDeleteMany } = setup();
    await expect(
      service.setWidgets('staff', ['staff.sessions-per-trainer', 'staff.sessions-per-trainer']),
    ).rejects.toThrow(/staff\.sessions-per-trainer/);
    expect(txDeleteMany).not.toHaveBeenCalled();
  });

  it('validates every key before writing anything', async () => {
    const { service, txDeleteMany, txCreateMany } = setup();
    await expect(
      service.setWidgets('staff', ['staff.sessions-per-trainer', 'staff.nope']),
    ).rejects.toThrow();
    expect(txDeleteMany).not.toHaveBeenCalled();
    expect(txCreateMany).not.toHaveBeenCalled();
  });
});
