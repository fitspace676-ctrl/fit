import { describe, expect, it } from 'vitest';
import {
  adminOrderDetailSchema,
  deriveOrderChannel,
  listOrdersQuerySchema,
  listOrdersResponseSchema,
  orderExportCells,
  orderRosterSummarySchema,
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

describe('orderRosterSummarySchema', () => {
  const summary = {
    orderCount: 42,
    grossTotal: 128_000,
    refundedTotal: 5_500,
    netTotal: 122_500,
    currency: 'GEL',
  };

  it('accepts a well-formed summary', () => {
    expect(orderRosterSummarySchema.parse(summary)).toEqual(summary);
  });

  it('rejects a non-integer or negative money field and a bad currency code', () => {
    expect(orderRosterSummarySchema.safeParse({ ...summary, grossTotal: 1.5 }).success).toBe(false);
    expect(orderRosterSummarySchema.safeParse({ ...summary, refundedTotal: -1 }).success).toBe(
      false,
    );
    expect(orderRosterSummarySchema.safeParse({ ...summary, currency: 'GELx' }).success).toBe(
      false,
    );
  });

  it('is required on the list response', () => {
    const page = { data: [], total: 0, page: 1, limit: 20 };
    expect(listOrdersResponseSchema.safeParse(page).success).toBe(false);
    expect(listOrdersResponseSchema.safeParse({ ...page, summary }).success).toBe(true);
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
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('itemCount')]).toBe('2');
  });

  it('formats money columns as major-unit decimals against the currency column', () => {
    const cells = orderExportCells(row);
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('currency')]).toBe('USD');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('total')]).toBe('10.00');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('refundedAmount')]).toBe('0.00');
  });

  it('derives netTotal as gross total minus refunds so the row self-reconciles', () => {
    const cells = orderExportCells({ ...row, total: 5000, refundedAmount: 1500 });
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('total')]).toBe('50.00');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('refundedAmount')]).toBe('15.00');
    expect(cells[ORDER_EXPORT_COLUMNS.indexOf('netTotal')]).toBe('35.00');
  });
});
