import { describe, expect, it } from 'vitest';
import {
  createOrderSchema,
  orderStatusSchema,
  orderSummarySchema,
  paymentMethodSchema,
} from './orders';

describe('orderStatusSchema', () => {
  it('accepts the three lifecycle states', () => {
    expect(orderStatusSchema.parse('pending')).toBe('pending');
    expect(orderStatusSchema.parse('paid')).toBe('paid');
    expect(orderStatusSchema.parse('cancelled')).toBe('cancelled');
  });

  it('rejects an unknown state', () => {
    expect(() => orderStatusSchema.parse('refunded')).toThrow();
  });
});

describe('paymentMethodSchema', () => {
  it('accepts the three POS settlement methods', () => {
    expect(paymentMethodSchema.parse('cash')).toBe('cash');
    expect(paymentMethodSchema.parse('card')).toBe('card');
    expect(paymentMethodSchema.parse('member_account')).toBe('member_account');
  });

  it('rejects an unknown method', () => {
    expect(() => paymentMethodSchema.parse('bank_transfer')).toThrow();
  });

  it('is case-sensitive (wire values are lower-snake-case)', () => {
    expect(() => paymentMethodSchema.parse('CARD')).toThrow();
    expect(() => paymentMethodSchema.parse('memberAccount')).toThrow();
  });
});

describe('createOrderSchema', () => {
  it('parses a signed-in member order', () => {
    const parsed = createOrderSchema.parse({
      gymId: 'g1',
      packageId: 'pkg1',
      memberId: 'm1',
    });
    expect(parsed.memberId).toBe('m1');
  });

  it('rejects a missing package', () => {
    expect(() => createOrderSchema.parse({ gymId: 'g1' })).toThrow();
  });
});

describe('orderSummarySchema', () => {
  it('parses a paid order with a line breakdown', () => {
    const parsed = orderSummarySchema.parse({
      id: 'o1',
      status: 'paid',
      total: 2999,
      currency: 'USD',
      items: [{ label: 'Monthly pass', amount: 2999 }],
    });
    expect(parsed.items).toHaveLength(1);
  });

  it('rejects a non-three-letter currency', () => {
    expect(() =>
      orderSummarySchema.parse({
        id: 'o1',
        status: 'paid',
        total: 0,
        currency: 'US',
        items: [],
      }),
    ).toThrow();
  });
});
