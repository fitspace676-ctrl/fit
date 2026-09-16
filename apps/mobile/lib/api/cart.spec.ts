import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CartView } from '@fit/types';
import { env } from '../env';
import {
  endSession,
  saveTokens,
  setSecureStorage,
  type SecureStorageAdapter,
} from '../auth/token-store';
import { resetApiClientForTests } from '../http/api-client';
import { addCartItem, emptyCart, getCart, removeCartItem, updateCartItem } from './cart';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeStorage(): SecureStorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

const ACCESS = `h.${base64url(
  JSON.stringify({ sub: 'u_1', gymId: 'gym_a', role: 'MEMBER', exp: 4_000_000_000 }),
)}.s`;

const CART: CartView = {
  items: [
    {
      variantId: 'p_1:0',
      productId: 'p_1',
      productName: 'Shaker',
      variantName: null,
      imageUrl: null,
      unitPrice: 1500,
      qty: 2,
      lineTotal: 3000,
      currency: 'GEL',
      available: true,
    },
  ],
  subtotal: 3000,
  discount: 0,
  total: 3000,
  currency: 'GEL',
};

function stubFetch(body: unknown = { cart: CART }, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}

function bodyOf(call: Call): unknown {
  return JSON.parse(call.init.body as string);
}

beforeEach(() => {
  setSecureStorage(fakeStorage());
  resetApiClientForTests();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setSecureStorage(fakeStorage());
  await endSession();
  setSecureStorage(null);
});

describe('getCart', () => {
  it('resolves to an empty cart without a request when signed out', async () => {
    // `GET /cart` with no session is a **500**, not a 401: CartService.identity()
    // reads `tenant.gymId`, whose getter throws when no tenant is in scope. So
    // the call is not made at all.
    const calls = stubFetch();

    await expect(getCart({ currency: 'GEL' })).resolves.toEqual(emptyCart('GEL'));
    expect(calls).toHaveLength(0);
  });

  it('unwraps the `cart` envelope when signed in', async () => {
    await saveTokens({ accessToken: ACCESS, refreshToken: 'r1' });
    const calls = stubFetch({ cart: CART });

    await expect(getCart({ currency: 'GEL' })).resolves.toEqual(CART);

    const call = calls[0] as Call;
    expect(call.url).toBe(`${env.apiUrl}/cart`);
    expect(call.init.method).toBe('GET');
    // D3: the Bearer scopes the cart. A cookie would adopt a stranger's guest cart.
    expect(call.init.credentials).toBe('omit');
  });
});

describe('emptyCart', () => {
  it('carries the caller-supplied currency, because an empty cart has no line to read it from', () => {
    expect(emptyCart('USD')).toEqual({
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      currency: 'USD',
    });
  });
});

describe('the three writes', () => {
  beforeEach(async () => {
    await saveTokens({ accessToken: ACCESS, refreshToken: 'r1' });
  });

  it('POSTs an add with the variant reference and quantity', async () => {
    const calls = stubFetch();

    await expect(addCartItem({ variantId: 'p_1:0', qty: 2 })).resolves.toEqual(CART);

    const call = calls[0] as Call;
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe(`${env.apiUrl}/cart/items`);
    // No money on the wire — the server re-prices from the product.
    expect(bodyOf(call)).toEqual({ variantId: 'p_1:0', qty: 2 });
  });

  it('PATCHes an absolute quantity onto the variant path', async () => {
    const calls = stubFetch();

    await updateCartItem({ variantId: 'p_1:0', qty: 5 });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('PATCH');
    expect(call.url).toBe(`${env.apiUrl}/cart/items/p_1%3A0`);
    // Absolute, not a delta: two racing taps converge instead of double-counting.
    expect(bodyOf(call)).toEqual({ qty: 5 });
  });

  it('DELETEs a line by variant reference', async () => {
    const calls = stubFetch();

    await removeCartItem({ variantId: 'p_1:0' });

    const call = calls[0] as Call;
    expect(call.init.method).toBe('DELETE');
    expect(call.url).toBe(`${env.apiUrl}/cart/items/p_1%3A0`);
  });

  it('returns the whole authoritative cart from every write', async () => {
    // This is what lets a mutation `setQueryData` instead of invalidating: the
    // round trip already answered with the fresh, re-priced cart.
    stubFetch();
    await expect(addCartItem({ variantId: 'p_1:0', qty: 1 })).resolves.toEqual(CART);
    await expect(updateCartItem({ variantId: 'p_1:0', qty: 1 })).resolves.toEqual(CART);
    await expect(removeCartItem({ variantId: 'p_1:0' })).resolves.toEqual(CART);
  });

  it('throws INSUFFICIENT_STOCK rather than resolving with an unchanged cart', async () => {
    stubFetch({ code: 'INSUFFICIENT_STOCK', message: 'Not enough stock', details: null }, 422);

    await expect(addCartItem({ variantId: 'p_1:0', qty: 99 })).rejects.toMatchObject({
      status: 422,
      code: 'INSUFFICIENT_STOCK',
    });
  });
});
