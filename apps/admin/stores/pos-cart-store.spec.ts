import { describe, expect, it } from 'vitest';
import {
  cartItemKey,
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

import { usePosCart } from './pos-cart-store';

describe('service lines', () => {
  it('adds a service line keyed by its id and increments quantity on repeat', () => {
    usePosCart.getState().clear();
    const add = usePosCart.getState().addItem;
    add({
      productId: 'svc-1',
      serviceId: 'svc-1',
      name: 'Massage',
      unitPrice: 8000,
      currency: 'GEL',
    });
    add({
      productId: 'svc-1',
      serviceId: 'svc-1',
      name: 'Massage',
      unitPrice: 8000,
      currency: 'GEL',
    });

    const items = usePosCart.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ serviceId: 'svc-1', qty: 2, planId: undefined });
  });

  it('keeps a service line beside a membership line', () => {
    usePosCart.getState().clear();
    const add = usePosCart.getState().addItem;
    add({ productId: 'plan-1', planId: 'plan-1', name: 'Gold', unitPrice: 10000, currency: 'GEL' });
    add({
      productId: 'svc-1',
      serviceId: 'svc-1',
      name: 'Massage',
      unitPrice: 8000,
      currency: 'GEL',
    });
    expect(usePosCart.getState().items).toHaveLength(2);
  });
});

describe('product variants', () => {
  it('keeps sizes separate and edits only the selected position', () => {
    usePosCart.getState().clear();
    const small = {
      productId: 'shirt',
      variantIndex: 0,
      sku: 'SHRT-S',
      name: 'Shirt (S)',
      unitPrice: 2500,
      currency: 'GEL',
    };
    const medium = { ...small, variantIndex: 1, sku: 'SHRT-M', name: 'Shirt (M)', unitPrice: 3000 };
    const cart = usePosCart.getState();
    cart.addItem(small);
    cart.addItem(medium);
    cart.addItem(small);
    expect(usePosCart.getState().items).toMatchObject([
      { ...small, qty: 2 },
      { ...medium, qty: 1 },
    ]);
    cart.setQty(cartItemKey(medium), 3);
    cart.setLineDiscount(cartItemKey(medium), 10);
    expect(usePosCart.getState().items).toMatchObject([
      { ...small, qty: 2, lineDiscountPct: 0 },
      { ...medium, qty: 3, lineDiscountPct: 10 },
    ]);
    cart.removeItem(cartItemKey(small));
    expect(usePosCart.getState().items).toMatchObject([{ ...medium, qty: 3 }]);
    usePosCart.getState().clear();
  });
});
