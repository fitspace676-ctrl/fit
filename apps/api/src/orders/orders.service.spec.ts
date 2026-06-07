import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
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
        items: { create: Array<{ label: string; amount: number }> };
      };
    };
    expect(orderArgs.data).toMatchObject({
      gymId: 'gym-1',
      total: 800,
      currency: 'USD',
      status: 'PAID',
      memberId: 'mem-1',
    });
    // Quantity is folded into the line label only when more than one was sold.
    expect(orderArgs.data.items.create).toEqual([
      { label: 'Protein bar ×2', amount: 500 },
      { label: 'Towel', amount: 300 },
    ]);

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
