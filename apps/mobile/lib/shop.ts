// @fit/mobile — shop catalogue read + cart-checkout API helpers + price format.
//
// The Shop tab (T6.7) browses a gym's retail products, builds a local cart, and
// checks out into a pending order. Three calls go through the authenticated
// `apiFetch` client (the shop lives behind the auth gate; even the public-ish
// product listing rides the shared client so base-URL + header handling stays in
// one place):
//
//   • GET  /products?gymId=…       — the gym's purchasable products
//   • POST /orders                 — turn the cart into a pending order
//   • GET  /orders/:orderId        — read an order back for the confirmation
//
// Responses are Zod-validated against `@fit/types`, so the wire contract can
// never silently drift from the API. The order *create* + *summary* shapes are
// shared with the web package-purchase wizard (`orders.ts`) — a confirmed order
// looks the same however it was built — so the confirmation screen and the
// `fit://orders/:orderId` deep link target reuse the canonical `/orders/:id`
// resource.

import {
  createOrderResponseSchema,
  orderSummarySchema,
  productSummarySchema,
  type CreateOrderResponse,
  type CreateShopOrderInput,
  type OrderSummary,
  type ProductSummary,
} from '@fit/types';
import { apiFetch } from './api-client';

/** Arguments for {@link fetchProducts}. */
export interface FetchProductsArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the gym's shop products via `GET /products`, parsed and validated (a
 * malformed payload throws rather than reaching the cards). Scoped by the
 * explicit `gymId` from the session's gym claim.
 */
export async function fetchProducts({
  gymId,
  signal,
}: FetchProductsArgs): Promise<ProductSummary[]> {
  const params = new URLSearchParams({ gymId });

  const response = await apiFetch(`/products?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load products (${response.status})`);
  }

  const body = (await response.json()) as { products?: unknown };
  return productSummarySchema.array().parse(body.products ?? []);
}

/** Arguments for {@link createShopOrder}. */
export interface CreateShopOrderArgs extends CreateShopOrderInput {
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Check out the cart: `POST /orders` with the cart lines, returning the created
 * order id plus the stub payment redirect (the MVP treats reaching this response
 * as "payment captured", mirroring the package wizard — the real provider lands
 * in T8.8). The member is resolved from the bearer session, so the body carries
 * no `customer`. Returns the parsed, validated response; throws with the API's
 * error message on a non-2xx so the checkout button can surface it.
 */
export async function createShopOrder({
  signal,
  ...body
}: CreateShopOrderArgs): Promise<CreateOrderResponse> {
  const response = await apiFetch('/orders', {
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
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch an order's confirmation summary via `GET /orders/:orderId`, parsed and
 * validated, or `null` when the id names no order (a 404) so the confirmation
 * screen can render its "order not found" state instead of throwing. A malformed
 * payload still throws — a broken shape is a bug, not an empty result.
 */
export async function fetchOrder({
  orderId,
  signal,
}: FetchOrderArgs): Promise<OrderSummary | null> {
  const response = await apiFetch(`/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
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

/**
 * Format a minor-unit `amount` for display against an ISO-4217 `currency` in the
 * caller's `locale` (symbol, grouping, decimals all locale-correct). Money
 * crosses the wire in MINOR units (cents/tetri) to avoid float rounding, so
 * divide by 100. Falls back to a plain amount + code if the runtime lacks the
 * currency's data, so a card never crashes.
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}
