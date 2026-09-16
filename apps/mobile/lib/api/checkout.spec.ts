import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CartCheckoutInput } from '@fit/types';
import { env } from '../env';
import { ApiError } from '../http/api-error';
import { checkoutCart, createCheckout, getCheckoutOrder } from './checkout';

interface Call {
  url: string;
  init: RequestInit;
}

function stubFetch(body: unknown, status: number): Call[] {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

const PICKUP: CartCheckoutInput = { fulfillment: 'PICKUP', locationId: 'loc_1' };

describe('checkoutCart — the route the deleted app never called', () => {
  it('POSTs /cart/checkout, not /orders', async () => {
    // `POST /orders` does not exist and `GET /orders/:id` is BillingRead. This
    // assertion is the whole reason WP-7 exists.
    const calls = stubFetch({ orderId: 'ord_1' }, 201);

    await checkoutCart(PICKUP);

    const call = calls[0] as Call;
    expect(call.url).toBe(`${env.apiUrl}/cart/checkout`);
    expect(call.init.method).toBe('POST');
    expect(JSON.parse(call.init.body as string)).toEqual(PICKUP);
  });

  it('resolves 201 to { ok: true, orderId }', async () => {
    stubFetch({ orderId: 'ord_1' }, 201);
    await expect(checkoutCart(PICKUP)).resolves.toEqual({ ok: true, orderId: 'ord_1' });
  });

  it('resolves 409 to PRICE_CHANGED with newPrices, without throwing', async () => {
    // The controller hand-sets 409 with `res.status()` and a normal return so the
    // exception filter never flattens `newPrices` away. Throwing here would
    // discard the only fields that let a screen say what changed.
    stubFetch(
      { code: 'PRICE_CHANGED', newPrices: [{ variantId: 'p_1:0', priceAmount: 1800 }] },
      409,
    );

    await expect(checkoutCart(PICKUP)).resolves.toEqual({
      ok: false,
      reason: 'PRICE_CHANGED',
      newPrices: [{ variantId: 'p_1:0', priceAmount: 1800 }],
    });
  });

  it('resolves 422 to OUT_OF_STOCK with removedItems, without throwing', async () => {
    stubFetch({ code: 'OUT_OF_STOCK', removedItems: ['p_2:1'] }, 422);

    await expect(checkoutCart(PICKUP)).resolves.toEqual({
      ok: false,
      reason: 'OUT_OF_STOCK',
      removedItems: ['p_2:1'],
    });
  });

  it('makes exactly one request — a PRICE_CHANGED is never auto-retried', async () => {
    // The server has already re-priced the cart, so an immediate retry would
    // succeed at a price the buyer has not seen. That retry must come from a
    // deliberate second press.
    const calls = stubFetch({ code: 'PRICE_CHANGED', newPrices: [] }, 409);
    await checkoutCart(PICKUP);
    expect(calls).toHaveLength(1);
  });

  it('tolerates a 409/422 body with the field missing', async () => {
    stubFetch({ code: 'PRICE_CHANGED' }, 409);
    await expect(checkoutCart(PICKUP)).resolves.toEqual({
      ok: false,
      reason: 'PRICE_CHANGED',
      newPrices: [],
    });
  });

  it('re-raises a 409 that is not one of the two documented bodies', async () => {
    // `acceptStatuses` suppressed the throw on the status alone. A future
    // `409 PROMO_INVALID` must not resolve as a successless success.
    stubFetch({ code: 'PROMO_INVALID', message: 'no' }, 409);

    const error = await checkoutCart(PICKUP).catch((cause: unknown) => cause);
    expect(ApiError.is(error)).toBe(true);
    expect((error as ApiError).code).toBe('PROMO_INVALID');
    expect((error as ApiError).status).toBe(409);
  });

  it('still throws on a 400 — a malformed request is a client bug, not an outcome', async () => {
    stubFetch({ code: 'VALIDATION_ERROR', message: 'bad', details: ['locationId: required'] }, 400);

    await expect(checkoutCart({ fulfillment: 'PICKUP' })).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('createCheckout', () => {
  it('POSTs /checkout with the catalogue product', async () => {
    const calls = stubFetch(
      { productType: 'credit_pack', orderId: 'ord_1', subscriptionId: null },
      201,
    );

    await expect(
      createCheckout({ productType: 'credit_pack', productId: 'pack_1' }),
    ).resolves.toEqual({ productType: 'credit_pack', orderId: 'ord_1', subscriptionId: null });

    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/checkout`);
  });
});

describe('getCheckoutOrder', () => {
  it('reads the order back through /checkout/:orderId', async () => {
    // Not `/orders/:orderId` — that controller requires BillingRead and 403s.
    const calls = stubFetch({ order: { id: 'ord_1' } }, 200);

    await getCheckoutOrder({ orderId: 'ord_1' });

    expect((calls[0] as Call).url).toBe(`${env.apiUrl}/checkout/ord_1`);
    expect((calls[0] as Call).init.method).toBe('GET');
  });
});
