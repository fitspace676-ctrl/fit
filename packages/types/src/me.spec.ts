import { describe, expect, it } from 'vitest';
import {
  listMyOrdersQuerySchema,
  listMyOrdersResponseSchema,
  memberOrderSummarySchema,
  MY_ORDER_LABEL_PREVIEW,
  type MemberOrderSummary,
} from './me';

const ROW: MemberOrderSummary = {
  id: 'ord_1',
  status: 'paid',
  total: 4500,
  currency: 'GEL',
  itemCount: 3,
  itemLabels: ['Whey Protein', 'Shaker'],
  createdAt: '2026-06-01T10:00:00.000Z',
};

describe('listMyOrdersQuerySchema', () => {
  it('defaults the pager so a bare GET /me/orders is valid', () => {
    expect(listMyOrdersQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces the query strings the URL actually carries', () => {
    expect(listMyOrdersQuerySchema.parse({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
    });
  });

  it('caps the page size so one request cannot pull a whole history', () => {
    expect(listMyOrdersQuerySchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(listMyOrdersQuerySchema.parse({ limit: 50 }).limit).toBe(50);
  });

  it('rejects a non-positive page rather than silently clamping it', () => {
    expect(listMyOrdersQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listMyOrdersQuerySchema.safeParse({ page: -1 }).success).toBe(false);
  });
});

describe('memberOrderSummarySchema', () => {
  it('accepts a card row', () => {
    expect(memberOrderSummarySchema.parse(ROW)).toEqual(ROW);
  });

  it('carries the same three states the confirmation screen shows', () => {
    for (const status of ['pending', 'paid', 'cancelled'] as const) {
      expect(memberOrderSummarySchema.safeParse({ ...ROW, status }).success).toBe(true);
    }
    // `refunded` is not on the wire here: the service folds it onto `cancelled`
    // so the list and `GET /checkout/:orderId` cannot name a state differently.
    expect(memberOrderSummarySchema.safeParse({ ...ROW, status: 'refunded' }).success).toBe(false);
  });

  it('allows an order with no lines, and never more labels than the preview', () => {
    expect(
      memberOrderSummarySchema.parse({ ...ROW, itemCount: 0, itemLabels: [] }).itemLabels,
    ).toEqual([]);
    expect(ROW.itemLabels.length).toBeLessThanOrEqual(MY_ORDER_LABEL_PREVIEW);
  });

  it('rejects a currency that is not an ISO-4217 code', () => {
    expect(memberOrderSummarySchema.safeParse({ ...ROW, currency: 'GEL ' }).success).toBe(false);
  });
});

describe('listMyOrdersResponseSchema', () => {
  it('pairs the page with the totals the pager needs', () => {
    const parsed = listMyOrdersResponseSchema.parse({
      orders: [ROW],
      total: 7,
      page: 1,
      limit: 20,
    });
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.total).toBe(7);
  });

  it('treats a member who has never bought anything as a normal empty page', () => {
    expect(
      listMyOrdersResponseSchema.parse({ orders: [], total: 0, page: 1, limit: 20 }).orders,
    ).toEqual([]);
  });
});
