import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { MeOrdersService } from './me-orders.service';

const MEMBER = { id: 'gm-1' };

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    status: 'PAID',
    total: 4500,
    currency: 'GEL',
    createdAt: new Date('2026-06-01T10:00:00.000Z'),
    items: [{ label: 'Whey Protein' }, { label: 'Shaker' }],
    _count: { items: 3 },
    ...overrides,
  };
}

function setup(
  opts: {
    userId?: string | null;
    member?: typeof MEMBER | null;
    rows?: Array<ReturnType<typeof orderRow>>;
    total?: number;
  } = {},
) {
  const gymMemberFindFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue('member' in opts ? opts.member : MEMBER);
  const orderFindMany = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(opts.rows ?? [orderRow()]);
  const orderCount = vi.fn<(args: unknown) => Promise<number>>().mockResolvedValue(opts.total ?? 1);

  const prisma = {
    client: {
      gymMember: { findFirst: gymMemberFindFirst },
      order: { findMany: orderFindMany, count: orderCount },
    },
  } as unknown as TenantPrismaService;

  const tenant = {
    userId: 'userId' in opts ? opts.userId : 'user-1',
  } as unknown as TenantContext;

  return {
    service: new MeOrdersService(prisma, tenant),
    gymMemberFindFirst,
    orderFindMany,
    orderCount,
  };
}

describe('MeOrdersService', () => {
  it('requires a member session', async () => {
    const { service } = setup({ userId: null });
    await expect(service.list({ page: 1, limit: 20 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns an empty page when the caller has no membership in this gym', async () => {
    const { service, orderFindMany } = setup({ member: null });
    await expect(service.list({ page: 2, limit: 10 })).resolves.toEqual({
      orders: [],
      total: 0,
      page: 2,
      limit: 10,
    });
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it('projects an order onto the history card, newest first', async () => {
    const { service, orderFindMany } = setup({ total: 7 });

    await expect(service.list({ page: 1, limit: 20 })).resolves.toEqual({
      orders: [
        {
          id: 'ord-1',
          status: 'paid',
          total: 4500,
          currency: 'GEL',
          itemCount: 3,
          itemLabels: ['Whey Protein', 'Shaker'],
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      ],
      total: 7,
      page: 1,
      limit: 20,
    });

    const args = orderFindMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('scopes the query to the caller own membership, never a wire id', async () => {
    const { service, orderFindMany, orderCount, gymMemberFindFirst } = setup();

    await service.list({ page: 1, limit: 20 });

    const memberArgs = gymMemberFindFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(memberArgs.where).toEqual({ userId: 'user-1', deletedAt: null });
    // No status filter: a SUSPENDED member still sees what they paid for.
    expect(memberArgs.where).not.toHaveProperty('status');

    for (const call of [orderFindMany, orderCount]) {
      const args = call.mock.calls[0]?.[0] as { where: unknown };
      expect(args.where).toEqual({ memberId: 'gm-1' });
    }
  });

  it('translates the page into a skip/take the database can serve', async () => {
    const { service, orderFindMany } = setup();

    await service.list({ page: 3, limit: 10 });

    const args = orderFindMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
  });

  it('reads a refunded order as cancelled, matching GET /checkout/:orderId', async () => {
    const { service } = setup({ rows: [orderRow({ status: 'REFUNDED' })] });
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.orders[0]?.status).toBe('cancelled');
  });

  it('handles an order with no priced lines', async () => {
    const { service } = setup({ rows: [orderRow({ items: [], _count: { items: 0 } })] });
    const result = await service.list({ page: 1, limit: 20 });
    expect(result.orders[0]?.itemLabels).toEqual([]);
    expect(result.orders[0]?.itemCount).toBe(0);
  });

  it('asks the database for only the label preview, not the whole basket', async () => {
    const { service, orderFindMany } = setup();

    await service.list({ page: 1, limit: 20 });

    const args = orderFindMany.mock.calls[0]?.[0] as {
      select: { items: { take: number } };
    };
    expect(args.select.items.take).toBe(2);
  });
});
