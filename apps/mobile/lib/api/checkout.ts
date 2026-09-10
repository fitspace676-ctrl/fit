// @fit/mobile — the two purchase routes, and the defect this package exists to
// prevent.
//
// ## What the deleted app did
//
// Shop checkout called `POST /orders` — **which does not exist** — and read the
// result back with `GET /orders/:id`, which `OrdersController` gates on
// `BillingRead`, a permission `ROLE_PERMISSIONS.MEMBER` does not hold. So the
// first call 404'd and the second would have 403'd. A purchase could never have
// completed. Nothing caught it: the client did not throw (D7), there were no
// unit tests, and the Maestro shop flow asserted UI state rather than an order.
//
// The member-safe pair is **`POST /cart/checkout` → `GET /checkout/:orderId`**,
// and both come out of {@link ENDPOINTS} so a route this wrong cannot be written
// again without the manifest checker seeing it.
//
// ## Two different checkouts, deliberately
//
//   - `POST /cart/checkout` — the retail shop. Takes the cart off the session,
//     returns `201 { orderId }`.
//   - `POST /checkout` — the membership funnel (plan / package / credit pack).
//     Takes a catalogue product, returns `{ productType, orderId, subscriptionId }`
//     with exactly one of the two ids set: a package or pack settles onto an
//     `Order`, a subscription mints an `Invoice` instead, and collapsing them
//     onto one id would double-count revenue.

import type {
  CartCheckoutInput,
  CartCheckoutResponse,
  CartOutOfStockError,
  CartPriceChange,
  CartPriceChangedError,
  CreateCheckoutInput,
  CreateCheckoutResponse,
  GetOrderResponse,
} from '@fit/types';
import { ApiError } from '../http/api-error';
import { apiJson, apiResult } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * The outcome of `POST /cart/checkout`, as a discriminated result rather than a
 * throw.
 *
 * `CartController.checkout` hand-sets `409` and `422` with `res.status(...)` and
 * a *normal return*, precisely so the global exception filter never sees them
 * and cannot flatten `newPrices` / `removedItems` away. An `ApiError` carries
 * `{status, code, details}` and nothing else, so throwing here would discard the
 * only fields that let a screen say **what** changed. This is documented
 * exception #1 of the API client (`acceptStatuses`).
 *
 * Everything else — 400, 401, 5xx, a dead radio — still throws.
 */
export type CartCheckoutOutcome =
  /** `201`. The cart is now empty server-side and stock has moved. */
  | { readonly ok: true; readonly orderId: string }
  /**
   * `409`. One or more line prices drifted. **The server has already re-priced
   * the cart**, so an immediate retry of the identical request succeeds — which
   * is exactly why the client must never retry automatically: that charges a
   * price the buyer has not seen. Show the deltas, make them press again.
   */
  | { readonly ok: false; readonly reason: 'PRICE_CHANGED'; readonly newPrices: CartPriceChange[] }
  /**
   * `422`. Lines can no longer be fulfilled; the server has **removed them from
   * the cart** and named their variant references. The cart query is stale the
   * moment this resolves.
   */
  | { readonly ok: false; readonly reason: 'OUT_OF_STOCK'; readonly removedItems: string[] };

/** The statuses `POST /cart/checkout` answers as data instead of as an error. */
const CHECKOUT_RESULT_STATUSES = [409, 422] as const;

/**
 * The 409/422 body as it arrives — before it is known *which* of the two it is.
 *
 * Derived from `@fit/types`' two error shapes rather than hand-written, but with
 * their literal `code`s widened: `CartPriceChangedError['code'] &
 * CartOutOfStockError['code']` is `never`, and a body whose `code` cannot be
 * read is a body that cannot be discriminated. Every field is optional because
 * this describes bytes off the wire, not a parsed value.
 */
type CheckoutRejectionBody = Partial<
  Omit<CartPriceChangedError, 'code'> & Omit<CartOutOfStockError, 'code'>
> & { code?: string };

/**
 * `POST /cart/checkout` — re-validate against live prices and stock, then create
 * a pending order.
 *
 * `fulfillment: 'PICKUP'` requires `locationId`; `'DELIVERY'` requires
 * `deliveryAddress`. Sending neither is a `400` (it throws), not an outcome —
 * that is a client bug, and the discriminated result is reserved for the two
 * conditions a *correct* client still hits because the world moved underneath it.
 */
export async function checkoutCart(
  input: CartCheckoutInput,
  options: FetchOptions = {},
): Promise<CartCheckoutOutcome> {
  const result = await apiResult<CartCheckoutResponse, CheckoutRejectionBody>(
    endpointPath(ENDPOINTS.checkoutCart),
    {
      method: ENDPOINTS.checkoutCart.method,
      json: input,
      signal: options.signal,
      acceptStatuses: CHECKOUT_RESULT_STATUSES,
    },
  );

  if (result.ok) {
    return { ok: true, orderId: result.data.orderId };
  }

  const body = result.data;
  if (result.status === 409 && body?.code === 'PRICE_CHANGED') {
    return { ok: false, reason: 'PRICE_CHANGED', newPrices: body.newPrices ?? [] };
  }
  if (result.status === 422 && body?.code === 'OUT_OF_STOCK') {
    return { ok: false, reason: 'OUT_OF_STOCK', removedItems: body.removedItems ?? [] };
  }

  // A 409/422 that is *not* one of the two documented bodies. `acceptStatuses`
  // suppressed the throw on the status alone, so it has to be re-raised here —
  // otherwise a future `409 PROMO_INVALID` would resolve as a successless
  // success and the screen would show nothing at all.
  throw new ApiError({
    status: result.status,
    code: typeof body?.code === 'string' ? body.code : undefined,
    message: 'Checkout failed',
  });
}

/**
 * `POST /checkout` — buy one catalogue product (plan, package, or credit pack).
 *
 * The gym, the buying member and the price are all resolved server-side from the
 * session and the catalogue row, so a tampered body cannot set its own price.
 * Exactly one of `orderId` / `subscriptionId` comes back, keyed by `productType`.
 *
 * Codes to branch on: `PRODUCT_UNAVAILABLE` (422 — missing, cross-tenant, or off
 * sale; one code for all three so the endpoint never reveals which),
 * `ALREADY_SUBSCRIBED` (409).
 */
export async function createCheckout(
  input: CreateCheckoutInput,
  options: FetchOptions = {},
): Promise<CreateCheckoutResponse> {
  return apiJson<CreateCheckoutResponse>(endpointPath(ENDPOINTS.createCheckout), {
    method: ENDPOINTS.createCheckout.method,
    json: input,
    signal: options.signal,
  });
}

/**
 * `GET /checkout/:orderId` — the confirmation summary for one of the caller's
 * own orders.
 *
 * **Not** `GET /orders/:orderId`, which is the staff console's surface and
 * requires `BillingRead`. An id belonging to another member or gym is a `404`
 * here, never a disclosure that it exists.
 */
export async function getCheckoutOrder(
  params: { orderId: string },
  options: FetchOptions = {},
): Promise<GetOrderResponse> {
  return apiJson<GetOrderResponse>(
    endpointPath(ENDPOINTS.getCheckoutOrder, { orderId: params.orderId }),
    {
      method: ENDPOINTS.getCheckoutOrder.method,
      signal: options.signal,
    },
  );
}
