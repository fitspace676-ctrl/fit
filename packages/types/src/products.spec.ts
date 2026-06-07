import { describe, expect, it } from 'vitest';
import {
  MAX_CART_ITEMS,
  MAX_CART_LINE_QUANTITY,
  createShopOrderSchema,
  productSummarySchema,
  shopOrderItemSchema,
} from './products';

describe('productSummarySchema', () => {
  const base = {
    id: 'p1',
    name: 'Shaker bottle',
    description: 'A 700ml shaker.',
    priceAmount: 1500,
    currency: 'USD',
    imageUrl: 'https://cdn.example.com/shaker.png',
    variants: [],
  };

  it('parses a product with no variants', () => {
    expect(productSummarySchema.parse(base)).toEqual(base);
  });

  it('parses a product with purchasable variants', () => {
    const withVariants = {
      ...base,
      variants: [
        { id: 'v1', name: 'Black', priceAmount: 1500, available: true },
        { id: 'v2', name: 'Pink', priceAmount: 1800, available: false },
      ],
    };
    expect(productSummarySchema.parse(withVariants).variants).toHaveLength(2);
  });

  it('accepts a null image (placeholder products)', () => {
    expect(productSummarySchema.parse({ ...base, imageUrl: null }).imageUrl).toBeNull();
  });

  it('rejects a negative price', () => {
    expect(() => productSummarySchema.parse({ ...base, priceAmount: -1 })).toThrow();
  });

  it('rejects a non-ISO currency code', () => {
    expect(() => productSummarySchema.parse({ ...base, currency: 'US' })).toThrow();
  });
});

describe('shopOrderItemSchema', () => {
  it('parses a line without a variant', () => {
    expect(shopOrderItemSchema.parse({ productId: 'p1', quantity: 2 })).toEqual({
      productId: 'p1',
      quantity: 2,
    });
  });

  it('rejects a zero / negative quantity', () => {
    expect(() => shopOrderItemSchema.parse({ productId: 'p1', quantity: 0 })).toThrow();
  });

  it('rejects a quantity over the per-line cap', () => {
    expect(() =>
      shopOrderItemSchema.parse({ productId: 'p1', quantity: MAX_CART_LINE_QUANTITY + 1 }),
    ).toThrow();
  });
});

describe('createShopOrderSchema', () => {
  it('parses a member cart checkout (no customer)', () => {
    const body = {
      gymId: 'g1',
      items: [{ productId: 'p1', variantId: 'v1', quantity: 1 }],
    };
    expect(createShopOrderSchema.parse(body)).toEqual(body);
  });

  it('rejects an empty cart', () => {
    expect(() => createShopOrderSchema.parse({ gymId: 'g1', items: [] })).toThrow();
  });

  it('rejects a cart over the item cap', () => {
    const items = Array.from({ length: MAX_CART_ITEMS + 1 }, (_, i) => ({
      productId: `p${i}`,
      quantity: 1,
    }));
    expect(() => createShopOrderSchema.parse({ gymId: 'g1', items })).toThrow();
  });
});
