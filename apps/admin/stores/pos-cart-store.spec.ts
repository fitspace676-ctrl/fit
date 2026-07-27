import { describe, expect, it } from 'vitest';
import {
  lineDiscountAmount,
  lineTotal,
  selectDiscountTotal,
  selectSubtotal,
  selectTotal,
  type CartItem,
} from './pos-cart-store';

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productId: 'p1',
  name: 'Item',
  unitPrice: 1000,
  currency: 'GEL',
  qty: 1,
  lineDiscountPct: 0,
  ...over,
});

describe('percentage discounts', () => {
  it('takes the line percentage off the line gross', () => {
    const i = item({ unitPrice: 4500, qty: 1, lineDiscountPct: 10 });
    expect(lineDiscountAmount(i)).toBe(450);
    expect(lineTotal(i)).toBe(4050);
  });
  it('keeps the percentage meaningful when quantity changes', () => {
    expect(lineDiscountAmount(item({ unitPrice: 1000, qty: 1, lineDiscountPct: 25 }))).toBe(250);
    expect(lineDiscountAmount(item({ unitPrice: 1000, qty: 6, lineDiscountPct: 25 }))).toBe(1500);
  });
  it('applies the cart percentage to what is left after line discounts', () => {
    const state = { items: [item({ unitPrice: 10000, lineDiscountPct: 10 })], cartDiscountPct: 50 };
    expect(selectSubtotal(state)).toBe(10000);
    expect(selectDiscountTotal(state)).toBe(5500);
    expect(selectTotal(state)).toBe(4500);
  });
  it('clamps out-of-range percentages instead of going negative', () => {
    expect(
      selectTotal({ items: [item({ unitPrice: 5000, lineDiscountPct: 500 })], cartDiscountPct: 0 }),
    ).toBe(0);
    expect(
      selectTotal({
        items: [item({ unitPrice: 5000, lineDiscountPct: -20 })],
        cartDiscountPct: -5,
      }),
    ).toBe(5000);
  });
});
