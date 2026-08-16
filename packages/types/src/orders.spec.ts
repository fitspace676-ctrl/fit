import { describe, expect, it } from 'vitest';
import {
  buildReconciliationReport,
  cashReconciliationQuerySchema,
  cashReconciliationReportSchema,
  computeCashVariance,
  createOrderSchema,
  orderStatusSchema,
  orderSummarySchema,
  paymentMethodSchema,
  posReceiptSchema,
  recordPosSaleSchema,
  sendReceiptSchema,
  type ReconciliationTally,
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

  it('carries the sold stock position when the line names one', () => {
    const parsed = posReceiptSchema.parse({
      ...validReceipt,
      items: [{ ...validReceipt.items[0]!, productId: 'prod-1', variantIndex: 2 }],
    });
    expect(parsed.items[0]!.productId).toBe('prod-1');
    expect(parsed.items[0]!.variantIndex).toBe(2);
  });

  it('accepts a line with no stock position — a membership sold at the desk', () => {
    const parsed = posReceiptSchema.parse({
      ...validReceipt,
      items: [{ ...validReceipt.items[0]!, productId: null, variantIndex: null }],
    });
    expect(parsed.items[0]!.productId).toBeNull();
  });

  it('rejects a negative variant index — it addresses an array slot', () => {
    expect(() =>
      posReceiptSchema.parse({
        ...validReceipt,
        items: [{ ...validReceipt.items[0]!, productId: 'prod-1', variantIndex: -1 }],
      }),
    ).toThrow();
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

describe('recordPosSaleSchema (T7.5)', () => {
  it('accepts a sale snapshot with an attached member', () => {
    const parsed = recordPosSaleSchema.parse({ memberId: 'mem-1', receipt: validReceipt });
    expect(parsed.memberId).toBe('mem-1');
    expect(parsed.receipt.total).toBe(500);
  });

  it('accepts a walk-in sale (no member)', () => {
    expect(recordPosSaleSchema.parse({ receipt: validReceipt }).memberId).toBeUndefined();
    expect(
      recordPosSaleSchema.parse({ memberId: null, receipt: validReceipt }).memberId,
    ).toBeNull();
  });

  it('rejects a malformed receipt', () => {
    expect(() => recordPosSaleSchema.parse({ receipt: { currency: 'USD' } })).toThrow();
  });
});

describe('cashReconciliationQuerySchema (T7.5)', () => {
  it('accepts a real calendar date', () => {
    expect(cashReconciliationQuerySchema.parse({ date: '2026-06-07' }).date).toBe('2026-06-07');
  });

  it('rejects a malformed or impossible date', () => {
    expect(() => cashReconciliationQuerySchema.parse({ date: '2026-6-7' })).toThrow();
    expect(() => cashReconciliationQuerySchema.parse({ date: '2026-02-30' })).toThrow();
    expect(() => cashReconciliationQuerySchema.parse({ date: 'today' })).toThrow();
  });
});

describe('buildReconciliationReport (T7.5)', () => {
  const meta = { date: '2026-06-07', currency: 'USD', generatedAt: '2026-06-07T18:00:00.000Z' };

  it('folds tallies into a complete, ordered, schema-valid report', () => {
    const tallies: ReconciliationTally[] = [
      { method: 'card', count: 2, total: 4000 },
      { method: 'cash', count: 3, total: 1500 },
    ];

    const report = buildReconciliationReport(tallies, meta);

    expect(report.methods.map((m) => m.method)).toEqual(['cash', 'card', 'member_account']);
    expect(report.methods).toContainEqual({ method: 'cash', count: 3, total: 1500 });
    expect(report.methods).toContainEqual({ method: 'member_account', count: 0, total: 0 });
    expect(report.salesCount).toBe(5);
    expect(report.grossTotal).toBe(5500);
    expect(report.expectedCash).toBe(1500);
    expect(report.generatedAt).toBe(meta.generatedAt);
    expect(() => cashReconciliationReportSchema.parse(report)).not.toThrow();
  });

  it('zeroes every method for a day with no sales', () => {
    const report = buildReconciliationReport([], meta);
    expect(report.salesCount).toBe(0);
    expect(report.grossTotal).toBe(0);
    expect(report.expectedCash).toBe(0);
    expect(report.methods).toHaveLength(3);
  });

  it('sums repeated tallies for the same method', () => {
    const report = buildReconciliationReport(
      [
        { method: 'cash', count: 1, total: 500 },
        { method: 'cash', count: 2, total: 1000 },
      ],
      meta,
    );
    expect(report.methods[0]).toEqual({ method: 'cash', count: 3, total: 1500 });
  });
});

describe('computeCashVariance (T7.5)', () => {
  it('reports a balanced drawer', () => {
    expect(computeCashVariance(1500, 1500)).toEqual({
      expectedCash: 1500,
      countedCash: 1500,
      variance: 0,
      status: 'balanced',
    });
  });

  it('reports an overage as a positive variance', () => {
    expect(computeCashVariance(1500, 1700)).toMatchObject({ variance: 200, status: 'over' });
  });

  it('reports a shortfall as a negative variance', () => {
    expect(computeCashVariance(1500, 1200)).toMatchObject({ variance: -300, status: 'short' });
  });
});
