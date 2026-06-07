import { describe, expect, it } from 'vitest';
import {
  createOrderSchema,
  orderStatusSchema,
  orderSummarySchema,
  paymentMethodSchema,
  posReceiptSchema,
  sendReceiptSchema,
} from './orders';

/** A minimal valid POS receipt snapshot the receipt-contract tests build on. */
const validReceipt = {
  currency: 'USD',
  items: [{ name: 'Protein bar', quantity: 2, unitPrice: 250, amount: 500 }],
  subtotal: 500,
  discountTotal: 0,
  total: 500,
  paymentMethod: 'cash' as const,
  cashTendered: 1000,
  changeDue: 500,
};

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

describe('posReceiptSchema', () => {
  it('parses a cash sale snapshot', () => {
    const parsed = posReceiptSchema.parse(validReceipt);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.changeDue).toBe(500);
    expect(parsed.memberName).toBeUndefined();
  });

  it('accepts an attached member name', () => {
    const parsed = posReceiptSchema.parse({ ...validReceipt, memberName: 'Sam Rivera' });
    expect(parsed.memberName).toBe('Sam Rivera');
  });

  it('accepts a null member name (walk-in)', () => {
    const parsed = posReceiptSchema.parse({ ...validReceipt, memberName: null });
    expect(parsed.memberName).toBeNull();
  });

  it('requires at least one line', () => {
    expect(() => posReceiptSchema.parse({ ...validReceipt, items: [] })).toThrow();
  });

  it('rejects non-integer (float) money amounts', () => {
    expect(() => posReceiptSchema.parse({ ...validReceipt, total: 5.5 })).toThrow();
  });

  it('rejects negative amounts', () => {
    expect(() => posReceiptSchema.parse({ ...validReceipt, changeDue: -1 })).toThrow();
  });

  it('rejects an unknown payment method', () => {
    expect(() => posReceiptSchema.parse({ ...validReceipt, paymentMethod: 'crypto' })).toThrow();
  });
});

describe('sendReceiptSchema', () => {
  it('parses a recipient + receipt and normalises the email', () => {
    const parsed = sendReceiptSchema.parse({
      email: '  Buyer@Example.COM ',
      receipt: validReceipt,
    });
    expect(parsed.email).toBe('buyer@example.com');
    expect(parsed.receipt.total).toBe(500);
  });

  it('rejects an invalid email', () => {
    expect(() =>
      sendReceiptSchema.parse({ email: 'not-an-email', receipt: validReceipt }),
    ).toThrow();
  });

  it('rejects a malformed receipt', () => {
    expect(() =>
      sendReceiptSchema.parse({ email: 'buyer@example.com', receipt: { currency: 'USD' } }),
    ).toThrow();
  });
});
