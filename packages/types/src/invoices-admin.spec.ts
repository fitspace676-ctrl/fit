// @fit/types — hand-raised invoice validation (the create body's guards).

import { describe, expect, it } from 'vitest';
import { createInvoiceSchema, listAdminInvoicesQuerySchema } from './invoices-admin';

/** A minimal valid create body; individual tests override what they exercise. */
function base(over: Record<string, unknown> = {}) {
  return {
    memberId: 'mem_1',
    description: 'Personal training block — 10 sessions',
    amount: 25000,
    currency: 'gel',
    ...over,
  };
}

describe('createInvoiceSchema', () => {
  it('upper-cases the currency and defaults the type to OTHER', () => {
    const parsed = createInvoiceSchema.parse(base());
    expect(parsed.currency).toBe('GEL');
    expect(parsed.type).toBe('OTHER');
  });

  it('coerces the amount from the form’s string', () => {
    const parsed = createInvoiceSchema.parse(base({ amount: '25000' }));
    expect(parsed.amount).toBe(25000);
  });

  it('rejects a zero or negative amount', () => {
    expect(createInvoiceSchema.safeParse(base({ amount: 0 })).success).toBe(false);
    expect(createInvoiceSchema.safeParse(base({ amount: -1 })).success).toBe(false);
  });

  it('rejects a blank description', () => {
    expect(createInvoiceSchema.safeParse(base({ description: '   ' })).success).toBe(false);
  });

  it('requires a member', () => {
    expect(createInvoiceSchema.safeParse(base({ memberId: '' })).success).toBe(false);
  });

  it('accepts an invoice with no due date', () => {
    const parsed = createInvoiceSchema.parse(base());
    expect(parsed.dueDate).toBeUndefined();
  });

  it('accepts a due date when one is given', () => {
    const parsed = createInvoiceSchema.parse(base({ dueDate: '2026-08-31' }));
    expect(parsed.dueDate).toBe('2026-08-31');
  });

  it('rejects a malformed due date', () => {
    expect(createInvoiceSchema.safeParse(base({ dueDate: '31/08/2026' })).success).toBe(false);
  });

  it('ignores a settlement status — the API decides it, not the caller', () => {
    const parsed = createInvoiceSchema.parse(base({ status: 'REFUNDED' }));
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('listAdminInvoicesQuerySchema', () => {
  it('defaults to the first page, newest first', () => {
    const parsed = listAdminInvoicesQuerySchema.parse({});
    expect(parsed).toMatchObject({ page: 1, limit: 20, sort: 'issuedAt', dir: 'desc' });
  });

  it('coerces the pager’s query strings', () => {
    const parsed = listAdminInvoicesQuerySchema.parse({ page: '3', limit: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });

  it('caps the page size at 100', () => {
    expect(listAdminInvoicesQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  // Stage 5 of the multi-branch roadmap. Same shape as every other list query's
  // branch param (`listOrdersQuerySchema`, `listTodayCheckInsQuerySchema`):
  // optional, and ABSENT rather than empty when unset, because `undefined` is what
  // the API reads as "all branches" and an empty string would filter on nothing.
  it('accepts a branch, and is undefined for all branches', () => {
    expect(listAdminInvoicesQuerySchema.parse({ locationId: 'loc_1' }).locationId).toBe('loc_1');
    expect(listAdminInvoicesQuerySchema.parse({}).locationId).toBeUndefined();
  });

  it('refuses an empty branch rather than treating it as all branches', () => {
    expect(listAdminInvoicesQuerySchema.safeParse({ locationId: '' }).success).toBe(false);
    expect(listAdminInvoicesQuerySchema.safeParse({ locationId: '   ' }).success).toBe(false);
  });
});
