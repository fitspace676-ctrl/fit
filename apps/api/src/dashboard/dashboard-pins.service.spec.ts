import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportDrilldown } from '@fit/types';
import { DashboardPinsService } from './dashboard-pins.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { ReportDrilldownService } from '../reports/report-drilldown.service';

function setup() {
  const findMany = vi.fn().mockResolvedValue([]);
  const upsert = vi.fn();
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });

  const client = { dashboardPin: { findMany, upsert, deleteMany } };
  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;
  const run = vi.fn();
  const drilldown = { run } as unknown as ReportDrilldownService;

  return {
    service: new DashboardPinsService(prisma, tenant, drilldown),
    findMany,
    upsert,
    deleteMany,
    run,
  };
}

/** A minimal drill-down with one series section, for widget resolution. */
function drilldownWith(sectionId: string): ReportDrilldown {
  return {
    metric: 'revenue',
    name: 'Revenue',
    description: '',
    range: '30d',
    currency: 'GEL',
    kpis: [],
    sections: [{ kind: 'series', id: sectionId, title: 'x', unit: 'money', points: [] }],
  };
}

describe('DashboardPinsService', () => {
  afterEach(() => vi.clearAllMocks());

  it('lists the caller pins scoped to gym + user, newest first', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      {
        id: 'p1',
        metric: 'revenue',
        section: 'revenue-over-time',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.list();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-1', userId: 'user-1' } }),
    );
    expect(result.pins).toEqual([
      {
        id: 'p1',
        metric: 'revenue',
        section: 'revenue-over-time',
        pinnedAt: '2026-06-01T00:00:00.000Z',
      },
    ]);
  });

  it('upserts a pin idempotently on the (gym,user,metric,section) unique tuple', async () => {
    const { service, upsert } = setup();
    upsert.mockResolvedValue({
      id: 'p2',
      metric: 'members',
      section: 'active-vs-expired',
      createdAt: new Date('2026-06-02T00:00:00.000Z'),
    });

    const pin = await service.create({ metric: 'members', section: 'active-vs-expired' });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          gymId_userId_metric_section: {
            gymId: 'gym-1',
            userId: 'user-1',
            metric: 'members',
            section: 'active-vs-expired',
          },
        },
        create: {
          gymId: 'gym-1',
          userId: 'user-1',
          metric: 'members',
          section: 'active-vs-expired',
        },
      }),
    );
    expect(pin.id).toBe('p2');
  });

  it('removes a pin only when it belongs to the caller', async () => {
    const { service, deleteMany } = setup();
    await service.remove('p9');
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'p9', gymId: 'gym-1', userId: 'user-1' },
    });
  });

  it('resolves pins to live widgets, computing each metric once and dropping stale pins', async () => {
    const { service, findMany, run } = setup();
    findMany.mockResolvedValue([
      { id: 'p1', metric: 'revenue', section: 'revenue-over-time', createdAt: new Date() },
      { id: 'p2', metric: 'revenue', section: 'gone', createdAt: new Date() },
    ]);
    run.mockResolvedValue(drilldownWith('revenue-over-time'));

    const result = await service.widgets();

    // One distinct metric → one drill-down computation.
    expect(run).toHaveBeenCalledTimes(1);
    // p1 resolves; p2 (missing section) is dropped.
    expect(result.widgets).toHaveLength(1);
    expect(result.widgets[0]).toEqual(
      expect.objectContaining({ id: 'p1', metric: 'revenue', currency: 'GEL' }),
    );
    expect(result.widgets[0]?.section.id).toBe('revenue-over-time');
  });

  it('returns no widgets when there are no pins (and computes nothing)', async () => {
    const { service, findMany, run } = setup();
    findMany.mockResolvedValue([]);

    const result = await service.widgets();

    expect(result.widgets).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
