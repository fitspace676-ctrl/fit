import { describe, expect, it } from 'vitest';
import {
  adminOrderDetailSchema,
  deriveOrderChannel,
  listOrdersQuerySchema,
  orderExportCells,
  ORDER_EXPORT_COLUMNS,
  refundOrderSchema,
  type AdminOrderRow,
} from './orders-admin';

describe('deriveOrderChannel', () => {
  it('maps the pos provider to POS and everything else to ONLINE', () => {
    expect(deriveOrderChannel('pos')).toBe('POS');
    expect(deriveOrderChannel('stub')).toBe('ONLINE');
    expect(deriveOrderChannel('stripe')).toBe('ONLINE');
  });

  it('treats a missing provider (no payment) as ONLINE', () => {
    expect(deriveOrderChannel(null)).toBe('ONLINE');
    expect(deriveOrderChannel(undefined)).toBe('ONLINE');
  });
});

describe('listOrdersQuerySchema', () => {
  it('defaults page/limit and leaves filters absent on a bare query', () => {
    const parsed = listOrdersQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.channel).toBeUndefined();
    expect(parsed.from).toBeUndefined();
  });

  it('widens a date-only `from` to the start of the UTC day and `to` to its end', () => {
    const parsed = listOrdersQuerySchema.parse({ from: '2026-06-01', to: '2026-06-30' });
    expect(parsed.from?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(parsed.to?.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });

  it('accepts a full ISO instant verbatim', () => {
    const parsed = listOrdersQuerySchema.parse({ from: '2026-06-01T08:30:00.000Z' });
    expect(parsed.from?.toISOString()).toBe('2026-06-01T08:30:00.000Z');
  });

  it('rejects an unparseable date and an unknown channel', () => {
    expect(listOrdersQuerySchema.safeParse({ from: 'not-a-date' }).success).toBe(false);
    expect(listOrdersQuerySchema.safeParse({ channel: 'MAIL' }).success).toBe(false);
  });
});

describe('refundOrderSchema', () => {
  it('requires a positive amount and a reason, defaulting restockItems to true', () => {
    const parsed = refundOrderSchema.parse({ amount: 500, reason: 'Returned' });
    expect(parsed.restockItems).toBe(true);
  });

  it('rejects a zero / negative amount and an empty reason', () => {
    expect(refundOrderSchema.safeParse({ amount: 0, reason: 'x' }).success).toBe(false);
    expect(refundOrderSchema.safeParse({ amount: -1, reason: 'x' }).success).toBe(false);
    expect(refundOrderSchema.safeParse({ amount: 100, reason: '   ' }).success).toBe(false);
  });
});

describe('adminOrderDetailSchema (fulfilment, T7.10)', () => {
  const base = {
    id: 'order-1',
    channel: 'ONLINE' as const,
    status: 'PENDING' as const,
    total: 1000,
    currency: 'USD',
    refundedAmount: 0,
    memberId: null,
    customerName: 'Ann',
    paymentMethod: null,
    itemCount: 1,
    createdAt: '2026-06-07T10:00:00.000Z',
    items: [],
    payments: [],
    refunds: [],
    statusTimeline: [{ status: 'PENDING' as const, at: '2026-06-07T10:00:00.000Z' }],
  };

  it('accepts a DELIVERY order carrying its destination', () => {
    const parsed = adminOrderDetailSchema.parse({
      ...base,
      fulfillment: 'DELIVERY',
      deliveryAddress: '1 Main St',
    });
    expect(parsed.fulfillment).toBe('DELIVERY');
    expect(parsed.deliveryAddress).toBe('1 Main St');
  });

  it('accepts a PICKUP order with a null delivery address', () => {
    const parsed = adminOrderDetailSchema.parse({
      ...base,
      fulfillment: 'PICKUP',
      deliveryAddress: null,
    });
    expect(parsed.fulfillment).toBe('PICKUP');
    expect(parsed.deliveryAddress).toBeNull();
  });

  it('rejects an unknown fulfilment mode', () => {
    expect(
      adminOrderDetailSchema.safeParse({ ...base, fulfillment: 'MAIL', deliveryAddress: null })
        .success,
    ).toBe(false);
  });
});

describe('orderExportCells', () => {
  const row: AdminOrderRow = {
    id: 'order-1',
    channel: 'POS',
    status: 'PAID',
    total: 1000,
    currency: 'USD',
    refundedAmount: 0,
    memberId: null,
    customerName: 'Ann',
    paymentMethod: 'cash',
    itemCount: 2,
    createdAt: '2026-06-07T10:00:00.000Z',
  };

  it('emits one cell per column, in column order, rendering null as empty', () => {
    const cells = orderExportCells(row);
    expect(cells).toHaveLength(ORDER_EXPORT_COLUMNS.length);
    expect(cells[0]).toBe('order-1');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('memberId')]).toBe('');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('customerName')]).toBe('Ann');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('total')]).toBe('1000');
  });
});
