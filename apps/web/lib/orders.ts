// @fit/web — order/checkout API helpers.
//
// Thin wrappers over the `@fit/api` order endpoints used by the purchase
// wizard's final step (T3.10): `POST /orders` to turn the chosen location +
// package into a pending order, and `GET /orders/:orderId` the success page
// reads back to confirm it. Like the location/package helpers these are scoped
// by an explicit `gymId` the page resolves from the active subdomain — the
// wizard is reachable signed-out, so the order can carry guest `customer`
// details captured in step 3 instead of a session.

import {
  createOrderResponseSchema,
  orderSummarySchema,
  type CreateOrderInput,
  type CreateOrderResponse,
  type OrderSummary,
} from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link createOrder}. */
export interface CreateOrderArgs extends CreateOrderInput {
  /** Abort signal so an in-flight request is cancelled if the component unmounts. */
  signal?: AbortSignal;
}

/**
 * Create a pending order for the chosen package. POSTs the wizard's collected
 * state to `POST /orders`; the API creates the order and returns its id plus the
 * stub payment redirect (the MVP treats reaching this response as "payment
 * captured"). Returns the parsed, validated response — a malformed payload
 * throws rather than redirecting to a broken success page. Throws with the API's
 * error message on a non-2xx response.
 */
export async function createOrder({
  signal,
  ...body
}: CreateOrderArgs): Promise<CreateOrderResponse> {
  const response = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to place order (${response.status})`);
  }

  return createOrderResponseSchema.parse(await response.json());
}

/** Arguments for {@link fetchOrder}. */
export interface FetchOrderArgs {
  orderId: string;
  /** The buyer's access token — the confirmation is their own order, not a public read. */
  accessToken: string;
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch an order's confirmation summary for the success page. Returns the
 * parsed, validated summary, or `null` when the id names no order of the
 * caller's (a 404) so the page can render its "order not found" state instead of
 * throwing. A malformed payload still throws — a broken shape is a bug, not an
 * empty result.
 *
 * Reads the member-facing `GET /checkout/:orderId`, not the staff `/orders/:id`:
 * the latter is the console's order-management surface and requires billing
 * permissions no member holds. The buyer's own access token is therefore
 * required — by the time this page renders, the wizard has signed them in.
 */
export async function fetchOrder({
  orderId,
  accessToken,
  signal,
}: FetchOrderArgs): Promise<OrderSummary | null> {
  const response = await fetch(`${API_URL}/checkout/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load order (${response.status})`);
  }

  const body = (await response.json()) as { order?: unknown };
  return orderSummarySchema.parse(body.order);
}
