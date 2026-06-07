import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { CartView } from '@fit/types';
import type { CartResult, CartService, CheckoutOutcome } from './cart.service';
import { CartController } from './cart.controller';

const EMPTY_VIEW: CartView = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'USD' };

function mockRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    status: vi.fn(),
  } as unknown as Response & {
    cookie: ReturnType<typeof vi.fn>;
    clearCookie: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
}

function req(cookie?: string): Request {
  return { headers: cookie ? { cookie } : {} } as Request;
}

describe('CartController cookies', () => {
  it('reads the session id from the cookie and passes it through', async () => {
    const getCart = vi.fn(
      (): Promise<CartResult> => Promise.resolve({ view: { ...EMPTY_VIEW }, session: {} }),
    );
    const controller = new CartController({ getCart } as unknown as CartService);
    const res = mockRes();

    await controller.get(req('fit_cart_sid=abc123; other=1'), res);
    expect(getCart).toHaveBeenCalledWith('abc123');
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sets the cookie when the service assigns a new anon session', async () => {
    const getCart = vi.fn(
      (): Promise<CartResult> =>
        Promise.resolve({ view: { ...EMPTY_VIEW }, session: { assign: 'new-sid' } }),
    );
    const controller = new CartController({ getCart } as unknown as CartService);
    const res = mockRes();

    await controller.get(req(), res);
    expect(res.cookie).toHaveBeenCalledWith(
      'fit_cart_sid',
      'new-sid',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('clears the cookie when the anon cart was merged on sign-in', async () => {
    const getCart = vi.fn(
      (): Promise<CartResult> =>
        Promise.resolve({ view: { ...EMPTY_VIEW }, session: { clear: true } }),
    );
    const controller = new CartController({ getCart } as unknown as CartService);
    const res = mockRes();

    await controller.get(req('fit_cart_sid=abc'), res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      'fit_cart_sid',
      expect.objectContaining({ path: '/' }),
    );
  });
});

describe('CartController.checkout status mapping', () => {
  function controllerFor(outcome: CheckoutOutcome) {
    const checkout = vi.fn((): Promise<CheckoutOutcome> => Promise.resolve(outcome));
    return new CartController({ checkout } as unknown as CartService);
  }
  const body = { fulfillment: 'PICKUP', locationId: 'loc1' };

  it('returns 201 with the order id on success', async () => {
    const res = mockRes();
    const out = await controllerFor({ kind: 'created', orderId: 'o1' }).checkout(body, req(), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(out).toEqual({ orderId: 'o1' });
  });

  it('returns 409 PRICE_CHANGED with the new prices', async () => {
    const res = mockRes();
    const out = await controllerFor({
      kind: 'price_changed',
      newPrices: [{ variantId: 'p:0', priceAmount: 700 }],
    }).checkout(body, req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(out).toEqual({
      code: 'PRICE_CHANGED',
      newPrices: [{ variantId: 'p:0', priceAmount: 700 }],
    });
  });

  it('returns 422 OUT_OF_STOCK with the removed items', async () => {
    const res = mockRes();
    const out = await controllerFor({ kind: 'out_of_stock', removedItems: ['p:0'] }).checkout(
      body,
      req(),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(out).toEqual({ code: 'OUT_OF_STOCK', removedItems: ['p:0'] });
  });
});
