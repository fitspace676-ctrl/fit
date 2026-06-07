import { describe, expect, it } from 'vitest';
import { addCartItemSchema, cartCheckoutSchema, decodeVariantRef, encodeVariantRef } from './cart';

describe('variant reference encoding', () => {
  it('round-trips a product + variant index', () => {
    const ref = encodeVariantRef('ckprod123', 2);
    expect(ref).toBe('ckprod123:2');
    expect(decodeVariantRef(ref)).toEqual({ productId: 'ckprod123', variantIndex: 2 });
  });

  it('round-trips a base (no-variant) purchase', () => {
    const ref = encodeVariantRef('ckprod123', null);
    expect(ref).toBe('ckprod123:base');
    expect(decodeVariantRef(ref)).toEqual({ productId: 'ckprod123', variantIndex: null });
  });

  it('rejects malformed references', () => {
    expect(decodeVariantRef('noseparator')).toBeNull();
    expect(decodeVariantRef(':2')).toBeNull();
    expect(decodeVariantRef('prod:')).toBeNull();
    expect(decodeVariantRef('prod:-1')).toBeNull();
    expect(decodeVariantRef('prod:1.5')).toBeNull();
    expect(decodeVariantRef('prod:abc')).toBeNull();
  });
});

describe('addCartItemSchema', () => {
  it('accepts a positive quantity', () => {
    expect(addCartItemSchema.parse({ variantId: 'p:0', qty: 3 })).toEqual({
      variantId: 'p:0',
      qty: 3,
    });
  });

  it('rejects a non-positive or oversized quantity', () => {
    expect(addCartItemSchema.safeParse({ variantId: 'p:0', qty: 0 }).success).toBe(false);
    expect(addCartItemSchema.safeParse({ variantId: 'p:0', qty: 1000 }).success).toBe(false);
  });
});

describe('cartCheckoutSchema', () => {
  it('requires a location for pickup', () => {
    expect(cartCheckoutSchema.safeParse({ fulfillment: 'PICKUP' }).success).toBe(false);
    expect(
      cartCheckoutSchema.safeParse({ fulfillment: 'PICKUP', locationId: 'loc1' }).success,
    ).toBe(true);
  });

  it('requires an address for delivery', () => {
    expect(cartCheckoutSchema.safeParse({ fulfillment: 'DELIVERY' }).success).toBe(false);
    expect(
      cartCheckoutSchema.safeParse({ fulfillment: 'DELIVERY', deliveryAddress: '1 Main St' })
        .success,
    ).toBe(true);
  });
});
