// @fit/mobile — the server-side cart (`/cart/*`).
//
// D3: the cart lives on the server, not in a React context. `CartIdentityMiddleware`
// scopes a signed-in cart by the Bearer token, so the app sends no cookie
// (`credentials: 'omit'`) — `fit_cart_sid` is the *web guest's* path, and sending
// one from the app would silently adopt a stranger's guest cart.
//
// Two consequences the hooks depend on:
//
//  1. **Every mutation returns the whole, authoritative, freshly re-priced
//     cart.** `POST /cart/items` does not answer "ok"; it answers the cart. So a
//     mutation's `onSuccess` should `setQueryData` from the response rather than
//     invalidate-and-refetch — the round trip has already been paid for.
//  2. **Signed out, the cart is empty by construction.** Not an error: see
//     `getCartOrEmpty` in `lib/http/api-client.ts` for why calling `GET /cart`
//     without a session produces a *500*, and why the request is therefore not
//     made at all.
//
// Checkout is not here — it lives in `./checkout.ts` beside the other purchase
// route, because the two are one decision (`POST /cart/checkout` vs the
// non-existent `POST /orders`) and belong in one file.

import type { AddCartItemInput, CartResponse, CartView, UpdateCartItemInput } from '@fit/types';
import { apiJson, getCartOrEmpty } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * The cart of someone with no session, in `currency`.
 *
 * `currency` is a parameter because it is a property of the *gym*, not of the
 * cart, and an empty cart has no line to read it from. Passing the wrong one
 * would show `$0.00` to a gym that sells in GEL.
 */
export function emptyCart(currency: string): CartView {
  return { items: [], subtotal: 0, discount: 0, total: 0, currency };
}

/**
 * `GET /cart` — the current cart, re-priced live against the products.
 *
 * Resolves to {@link emptyCart} when there is no session, without making a
 * request (documented exception #2 of the API client).
 */
export async function getCart(
  params: { currency: string },
  options: FetchOptions = {},
): Promise<CartView> {
  const response = await getCartOrEmpty<CartResponse>(
    { cart: emptyCart(params.currency) },
    { method: ENDPOINTS.getCart.method, signal: options.signal },
  );
  return response.cart;
}

/**
 * `POST /cart/items` — add `qty` units of `variantId`.
 *
 * `variantId` is the encoded `productId:variantIndex` reference the cart and
 * product listings both speak (`encodeVariantRef` in `@fit/types`). The server
 * re-prices, so no money is sent; adding a variant already in the cart bumps
 * that line rather than creating a second one — which is precisely why an
 * add-to-cart must **not** be optimistic (see `hooks/mutations/useCartMutations.ts`).
 *
 * `422 INSUFFICIENT_STOCK` leaves the line unchanged.
 */
export async function addCartItem(
  input: AddCartItemInput,
  options: FetchOptions = {},
): Promise<CartView> {
  const response = await apiJson<CartResponse>(endpointPath(ENDPOINTS.addCartItem), {
    method: ENDPOINTS.addCartItem.method,
    json: input,
    signal: options.signal,
  });
  return response.cart;
}

/**
 * `PATCH /cart/items/:variantId` — set a line's **absolute** quantity.
 *
 * Not a delta: the stepper sends the number it wants to end up at, so two taps
 * racing each other converge instead of double-counting. `qty: 0` is not how a
 * line is removed — {@link removeCartItem} is (the schema's minimum is 1).
 */
export async function updateCartItem(
  input: { variantId: string } & UpdateCartItemInput,
  options: FetchOptions = {},
): Promise<CartView> {
  const response = await apiJson<CartResponse>(
    endpointPath(ENDPOINTS.updateCartItem, { variantId: input.variantId }),
    {
      method: ENDPOINTS.updateCartItem.method,
      json: { qty: input.qty },
      signal: options.signal,
    },
  );
  return response.cart;
}

/** `DELETE /cart/items/:variantId` — remove a line. Idempotent. */
export async function removeCartItem(
  input: { variantId: string },
  options: FetchOptions = {},
): Promise<CartView> {
  const response = await apiJson<CartResponse>(
    endpointPath(ENDPOINTS.removeCartItem, { variantId: input.variantId }),
    {
      method: ENDPOINTS.removeCartItem.method,
      signal: options.signal,
    },
  );
  return response.cart;
}
