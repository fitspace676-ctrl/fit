import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { RecordPosSaleInput, SendReceiptInput } from '@fit/types';
import type { EmailService } from '../auth/email.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { OrdersService, utcDayRange } from './orders.service';

const input: SendReceiptInput = {
  email: 'buyer@example.com',
  receipt: {
    currency: 'USD',
    items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
    subtotal: 500,
    discountTotal: 0,
    total: 500,
    paymentMethod: 'cash',
    cashTendered: 1000,
    changeDue: 500,
  },
};

function setup(over?: {
  gymName?: string | null;
  delivered?: boolean;
  settings?: unknown;
  grouped?: Array<{ method: string; _sum: { amount: number | null }; _count: { _all: number } }>;
}) {
  const sendReceiptEmail = vi.fn<() => Promise<boolean>>(() =>
    Promise.resolve(over?.delivered ?? true),
  );
  const findUnique = vi.fn(() =>
    Promise.resolve(
      over?.settings !== undefined
        ? { settings: over.settings }
        : over?.gymName === undefined
          ? { name: 'Downtown' }
          : { name: over.gymName },
    ),
  );
  const orderCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const paymentCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'pay-1' }));
  const groupBy = vi.fn((_args: unknown) => Promise.resolve(over?.grouped ?? []));
  const tx = { order: { create: orderCreate }, payment: { create: paymentCreate } };
  const $transaction = vi.fn((cb: (client: typeof tx) => unknown) => cb(tx));
  const email = { sendReceiptEmail } as unknown as EmailService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;
  const prisma = {
    client: {
      gym: { findUnique },
      payment: { groupBy },
      $transaction,
    },
  } as unknown as TenantPrismaService;
  return {
    service: new OrdersService(email, tenant, prisma),
    sendReceiptEmail,
    findUnique,
    orderCreate,
    paymentCreate,
    groupBy,
  };
}

describe('OrdersService.sendReceipt', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves the tenant gym name and forwards it to the email service', async () => {
    const { service, sendReceiptEmail, findUnique } = setup();

    const result = await service.sendReceipt(input);

    expect(result).toEqual({ delivered: true });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'gym-1' }, select: { name: true } });
    expect(sendReceiptEmail).toHaveBeenCalledWith('buyer@example.com', input.receipt, 'Downtown');
  });

  it('passes undefined for the gym name when the tenant lookup misses', async () => {
    const { service, sendReceiptEmail } = setup({ gymName: null });

    await service.sendReceipt(input);

    expect(sendReceiptEmail).toHaveBeenCalledWith('buyer@example.com', input.receipt, undefined);
  });

  it('reports delivered:false when email delivery is unconfigured', async () => {
    const { service } = setup({ delivered: false });

    expect(await service.sendReceipt(input)).toEqual({ delivered: false });
  });
});

const saleInput: RecordPosSaleInput = {
  memberId: 'mem-1',
  receipt: {
    currency: 'USD',
    items: [
      { name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 },
      { name: 'Towel', quantity: 1, unitPrice: 300, amount: 300 },
    ],
    subtotal: 800,
    discountTotal: 0,
    total: 800,
    paymentMethod: 'card',
    cashTendered: 0,
    changeDue: 0,
    memberName: 'Dana',
  },
};

describe('OrdersService.recordSale', () => {
  afterEach(() => vi.clearAllMocks());

  it('persists a PAID order with its lines and a CAPTURED payment in one transaction', async () => {
    const { service, orderCreate, paymentCreate } = setup();

    const result = await service.recordSale(saleInput);

    expect(result).toEqual({ orderId: 'order-1', paymentId: 'pay-1' });

    const orderArgs = orderCreate.mock.calls[0]![0] as {
      data: Record<string, unknown> & {
        items: { create: Array<{ label: string; amount: number; qty: number }> };
        statusEvents: { create: { status: string } };
      };
    };
    expect(orderArgs.data).toMatchObject({
      gymId: 'gym-1',
      total: 800,
      currency: 'USD',
      status: 'PAID',
      memberId: 'mem-1',
    });
    // Quantity is folded into the line label only when more than one was sold, but
    // the raw `qty` is recorded on each line (for refund restock) regardless.
    expect(orderArgs.data.items.create).toEqual([
      { label: 'Protein bar ×2', amount: 500, qty: 2 },
      { label: 'Towel', amount: 300, qty: 1 },
    ]);
    // The opening PAID transition is logged for the status timeline (T7.9).
    expect(orderArgs.data.statusEvents.create).toEqual({ status: 'PAID' });

    const paymentArgs = paymentCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(paymentArgs.data).toMatchObject({
      gymId: 'gym-1',
      orderId: 'order-1',
      amount: 800,
      status: 'CAPTURED',
      method: 'CARD',
      provider: 'pos',
    });
  });

  it('rejects a member-account sale with no member attached', async () => {
    const { service, orderCreate } = setup();

    await expect(
      service.recordSale({
        receipt: { ...saleInput.receipt, paymentMethod: 'member_account' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderCreate).not.toHaveBeenCalled();
  });
});

describe('OrdersService.reconcile', () => {
  afterEach(() => vi.clearAllMocks());

  it('aggregates the day’s captured payments by method into the report', async () => {
    const { service, groupBy } = setup({
      settings: { locale: { currency: 'GEL', timezone: 'Asia/Tbilisi' } },
      grouped: [
        { method: 'CASH', _sum: { amount: 1500 }, _count: { _all: 3 } },
        { method: 'CARD', _sum: { amount: 4000 }, _count: { _all: 2 } },
      ],
    });

    const report = await service.reconcile({ date: '2026-06-07' });

    expect(report.currency).toBe('GEL');
    expect(report.date).toBe('2026-06-07');
    expect(report.expectedCash).toBe(1500);
    expect(report.grossTotal).toBe(5500);
    expect(report.salesCount).toBe(5);
    expect(report.methods.map((m) => m.method)).toEqual(['cash', 'card', 'member_account']);

    // The groupBy is constrained to captured payments inside the day window.
    const args = groupBy.mock.calls[0]![0] as {
      where: { status: string; createdAt: { gte: Date; lt: Date } };
    };
    expect(args.where.status).toBe('CAPTURED');
    expect(args.where.createdAt.lt.getTime() - args.where.createdAt.gte.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it('falls back to default locale when the gym has no settings', async () => {
    const { service } = setup({ settings: null, grouped: [] });

    const report = await service.reconcile({ date: '2026-06-07' });

    expect(report.grossTotal).toBe(0);
    expect(report.methods).toHaveLength(3);
    expect(report.currency).toHaveLength(3);
  });
});

describe('utcDayRange', () => {
  it('spans local midnight to local midnight for a positive-offset zone', () => {
    const { gte, lt } = utcDayRange('2026-06-07', 'Asia/Tbilisi');
    // Tbilisi is UTC+4 year-round, so local midnight is 20:00 UTC the day before.
    expect(gte.toISOString()).toBe('2026-06-06T20:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-06-07T20:00:00.000Z');
  });

  it('treats UTC as a midnight-to-midnight window', () => {
    const { gte, lt } = utcDayRange('2026-06-07', 'UTC');
    expect(gte.toISOString()).toBe('2026-06-07T00:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });
});

// ── Admin order management (T7.9) ──────────────────────────────────────────

/**
 * A mock tenant-scoped Prisma client for the admin order management methods.
 * Each model method is a spy seeded from `over`, and `$transaction` runs its
 * callback against the same mock so the refund flow can be exercised end-to-end.
 */
function adminSetup(over?: {
  orderFindMany?: unknown[];
  orderCount?: number;
  orderFindFirst?: unknown;
  productFindMany?: unknown[];
}) {
  const orderFindMany = vi.fn((_args: unknown) => Promise.resolve(over?.orderFindMany ?? []));
  const orderCount = vi.fn((_args: unknown) => Promise.resolve(over?.orderCount ?? 0));
  const orderFindFirst = vi.fn((_args: unknown) => Promise.resolve(over?.orderFindFirst ?? null));
  const orderUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'order-1' }));
  const refundCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'refund-1' }));
  const paymentUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'pay-1' }));
  const statusEventCreate = vi.fn((_args: unknown) => Promise.resolve({ id: 'evt-1' }));
  const productFindMany = vi.fn((_args: unknown) => Promise.resolve(over?.productFindMany ?? []));
  const productUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'p1' }));

  const tx = {
    order: { findFirst: orderFindFirst, update: orderUpdate },
    refund: { create: refundCreate },
    payment: { update: paymentUpdate },
    orderStatusEvent: { create: statusEventCreate },
    product: { findMany: productFindMany, update: productUpdate },
  };
  const $transaction = vi.fn((cb: (client: typeof tx) => unknown) => cb(tx));

  const email = {} as unknown as EmailService;
  const tenant = { gymId: 'gym-1', userId: 'user-1' } as unknown as TenantContext;
  const prisma = {
    client: {
      order: { findMany: orderFindMany, count: orderCount, findFirst: orderFindFirst },
      $transaction,
    },
  } as unknown as TenantPrismaService;

  return {
    service: new OrdersService(email, tenant, prisma),
    orderFindMany,
    orderCount,
    orderFindFirst,
    orderUpdate,
    refundCreate,
    paymentUpdate,
    statusEventCreate,
    productFindMany,
    productUpdate,
  };
}

/** A roster row record as the scoped select returns it (Date `createdAt`). */
function orderRecord(over?: Partial<Record<string, unknown>>) {
  return {
    id: 'order-1',
    status: 'PAID',
    total: 1000,
    currency: 'USD',
    memberId: 'mem-1',
    customerName: null,
    createdAt: new Date('2026-06-07T10:00:00.000Z'),
    payment: { provider: 'pos', method: 'CARD', refundedAmount: 0 },
    _count: { items: 2 },
    ...over,
  };
}

describe('OrdersService.listOrders', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps rows to admin order rows and derives the channel from the payment provider', async () => {
    const { service } = adminSetup({
      orderFindMany: [
        orderRecord({ payment: { provider: 'pos', method: 'CASH', refundedAmount: 0 } }),
        orderRecord({
          id: 'order-2',
          payment: { provider: 'stub', method: 'CARD', refundedAmount: 200 },
        }),
        orderRecord({ id: 'order-3', payment: null }),
      ],
      orderCount: 3,
    });

    const result = await service.listOrders({ page: 1, limit: 20 });

    expect(result.total).toBe(3);
    expect(result.data.map((row) => row.channel)).toEqual(['POS', 'ONLINE', 'ONLINE']);
    expect(result.data[0]!.paymentMethod).toBe('cash');
    expect(result.data[1]!.refundedAmount).toBe(200);
    expect(result.data[2]!.paymentMethod).toBeNull();
    expect(result.data[0]!.itemCount).toBe(2);
  });

  it('filters POS by a pos provider and applies the date range + pagination', async () => {
    const { service, orderFindMany } = adminSetup();

    await service.listOrders({
      page: 2,
      limit: 10,
      channel: 'POS',
      status: 'PAID',
      memberId: 'mem-9',
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T23:59:59.999Z'),
    });

    const args = orderFindMany.mock.calls[0]![0] as {
      where: Record<string, unknown> & { createdAt?: { gte?: Date; lte?: Date } };
      skip: number;
      take: number;
    };
    expect(args.where.payment).toEqual({ is: { provider: 'pos' } });
    expect(args.where.status).toBe('PAID');
    expect(args.where.memberId).toBe('mem-9');
    expect(args.where.createdAt?.gte?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it('filters ONLINE as the negation of a pos payment', async () => {
    const { service, orderFindMany } = adminSetup();

    await service.listOrders({ page: 1, limit: 20, channel: 'ONLINE' });

    const args = orderFindMany.mock.calls[0]![0] as { where: { NOT?: unknown } };
    expect(args.where.NOT).toEqual({ payment: { is: { provider: 'pos' } } });
  });
});

describe('OrdersService.getOrder', () => {
  afterEach(() => vi.clearAllMocks());

  it('404s an unknown order', async () => {
    const { service } = adminSetup({ orderFindFirst: null });
    await expect(service.getOrder('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects items, payments, refunds and the status timeline from the event log', async () => {
    const { service } = adminSetup({
      orderFindFirst: {
        ...orderRecord(),
        items: [{ id: 'i1', label: 'Towel', amount: 300, productVariantId: 'p1:0', qty: 1 }],
        payment: {
          id: 'pay-1',
          amount: 1000,
          currency: 'USD',
          status: 'CAPTURED',
          method: 'CARD',
          provider: 'pos',
          refundedAmount: 0,
          createdAt: new Date('2026-06-07T10:00:00.000Z'),
        },
        refunds: [],
        statusEvents: [
          { status: 'PAID', at: new Date('2026-06-07T10:00:00.000Z') },
          { status: 'REFUNDED', at: new Date('2026-06-08T09:00:00.000Z') },
        ],
      },
    });

    const detail = await service.getOrder('order-1');

    expect(detail.items).toHaveLength(1);
    expect(detail.payments).toHaveLength(1);
    expect(detail.payments[0]!.method).toBe('card');
    expect(detail.statusTimeline.map((e) => e.status)).toEqual(['PAID', 'REFUNDED']);
  });

  it('synthesises a single timeline entry when no events were logged', async () => {
    const { service } = adminSetup({
      orderFindFirst: {
        ...orderRecord({ status: 'PAID' }),
        items: [],
        payment: null,
        refunds: [],
        statusEvents: [],
      },
    });

    const detail = await service.getOrder('order-1');

    expect(detail.statusTimeline).toEqual([{ status: 'PAID', at: '2026-06-07T10:00:00.000Z' }]);
    expect(detail.payments).toEqual([]);
  });
});

describe('OrdersService.refundOrder', () => {
  afterEach(() => vi.clearAllMocks());

  it('rejects an amount over the net paid figure with 422 EXCEEDS_PAID_AMOUNT', async () => {
    const { service, refundCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 200 },
        items: [],
      },
    });

    let caught: unknown;
    await service
      .refundOrder('order-1', { amount: 801, reason: 'x', restockItems: false })
      .catch((error) => {
        caught = error;
      });

    expect(caught).toBeInstanceOf(UnprocessableEntityException);
    expect((caught as UnprocessableEntityException).getResponse()).toMatchObject({
      code: 'EXCEEDS_PAID_AMOUNT',
    });
    expect(refundCreate).not.toHaveBeenCalled();
  });

  it('422s an order with no captured payment to refund', async () => {
    const { service } = adminSetup({
      orderFindFirst: { id: 'order-1', status: 'PENDING', payment: null, items: [] },
    });

    await expect(
      service.refundOrder('order-1', { amount: 100, reason: 'x', restockItems: false }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('records a full refund, flips the payment + order to REFUNDED, and logs the transition', async () => {
    const { service, refundCreate, paymentUpdate, orderUpdate, statusEventCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    const result = await service.refundOrder('order-1', {
      amount: 1000,
      reason: 'Returned',
      restockItems: false,
    });

    expect(result).toEqual({ refundId: 'refund-1' });
    expect(refundCreate.mock.calls[0]![0]).toMatchObject({
      data: { gymId: 'gym-1', orderId: 'order-1', paymentId: 'pay-1', amount: 1000 },
    });
    expect(paymentUpdate.mock.calls[0]![0]).toMatchObject({
      data: { refundedAmount: 1000, status: 'REFUNDED' },
    });
    expect(orderUpdate.mock.calls[0]![0]).toMatchObject({ data: { status: 'REFUNDED' } });
    expect(statusEventCreate.mock.calls[0]![0]).toMatchObject({
      data: { status: 'REFUNDED', actor: 'user-1' },
    });
  });

  it('leaves a partial refund PAID without a status event', async () => {
    const { service, paymentUpdate, orderUpdate, statusEventCreate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [],
      },
    });

    await service.refundOrder('order-1', { amount: 400, reason: 'Partial', restockItems: false });

    expect(paymentUpdate.mock.calls[0]![0]).toMatchObject({ data: { refundedAmount: 400 } });
    expect((paymentUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data.status).toBe(
      undefined,
    );
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(statusEventCreate).not.toHaveBeenCalled();
  });

  it('restocks the sold variants when restockItems is set', async () => {
    const { service, productFindMany, productUpdate } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [
          { productVariantId: 'p1:0', qty: 3 },
          { productVariantId: 'p1:base', qty: 1 },
          { productVariantId: null, qty: 1 },
        ],
      },
      productFindMany: [
        { id: 'p1', variants: [{ name: 'S', sku: 'A', priceAmount: null, stock: 5 }] },
      ],
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Returned', restockItems: true });

    expect(productFindMany).toHaveBeenCalledOnce();
    const updateArgs = productUpdate.mock.calls[0]![0] as {
      where: { id: string };
      data: { variants: Array<{ stock: number }> };
    };
    expect(updateArgs.where.id).toBe('p1');
    expect(updateArgs.data.variants[0]!.stock).toBe(8); // 5 + 3
  });

  it('does not touch stock when restockItems is false', async () => {
    const { service, productFindMany } = adminSetup({
      orderFindFirst: {
        id: 'order-1',
        status: 'PAID',
        payment: { id: 'pay-1', amount: 1000, refundedAmount: 0 },
        items: [{ productVariantId: 'p1:0', qty: 3 }],
      },
    });

    await service.refundOrder('order-1', { amount: 1000, reason: 'Damaged', restockItems: false });

    expect(productFindMany).not.toHaveBeenCalled();
  });
});

describe('OrdersService.streamOrdersCsv', () => {
  afterEach(() => vi.clearAllMocks());

  it('yields a header line then one line per order, paginating until drained', async () => {
    const { service, orderFindMany } = adminSetup();
    orderFindMany
      .mockResolvedValueOnce([orderRecord({ id: 'order-1', customerName: 'Ann, Lee' })])
      .mockResolvedValueOnce([]);

    const chunks: string[] = [];
    for await (const chunk of service.streamOrdersCsv({ page: 1, limit: 20 })) {
      chunks.push(chunk);
    }

    const csv = chunks.join('');
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'id,createdAt,channel,status,currency,total,refundedAmount,paymentMethod,memberId,customerName,itemCount',
    );
    expect(lines).toHaveLength(2);
    // A value containing a comma is quoted per RFC 4180.
    expect(lines[1]).toContain('"Ann, Lee"');
  });
});
