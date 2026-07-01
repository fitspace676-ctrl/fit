'use server';

// @fit/web — shop cart server actions.
//
// Add / update / remove cart lines and checkout, from any client island. Each
// action forwards the session cookie as a bearer token to the @fit/api `/cart`
// endpoints (a member's cart is session-bound) and returns the fresh cart view
// (or a tagged error) so the caller can re-render without a separate read.

import { cookies } from 'next/headers';
import type { CartView } from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { parseCartView } from '@/lib/cart';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

export type CartActionResult =
  | { ok: true; cart: CartView }
  | { ok: false; error: string; code?: string };

export type CheckoutResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; code?: string };

async function token(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
}

async function cartRequest(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<CartActionResult> {
  const t = await token();
  if (!t) {
    return { ok: false, error: 'Not signed in', code: 'UNAUTHENTICATED' };
  }
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${t}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as { cart?: unknown; code?: string; message?: string } | null;
  if (!response.ok) {
    return { ok: false, error: json?.message ?? `Request failed (${response.status})`, code: json?.code };
  }
  return { ok: true, cart: parseCartView(json?.cart) };
}

/** Add `qty` of an encoded variant ref to the cart. */
export async function addToCartAction(variantId: string, qty = 1): Promise<CartActionResult> {
  return cartRequest('/cart/items', 'POST', { variantId, qty });
}

/** Set a cart line's absolute quantity. */
export async function updateCartItemAction(variantId: string, qty: number): Promise<CartActionResult> {
  return cartRequest(`/cart/items/${encodeURIComponent(variantId)}`, 'PATCH', { qty });
}

/** Remove a cart line. */
export async function removeCartItemAction(variantId: string): Promise<CartActionResult> {
  return cartRequest(`/cart/items/${encodeURIComponent(variantId)}`, 'DELETE');
}

/** Check out the cart for in-gym pickup at `locationId`, with an optional promo. */
export async function checkoutCartAction(
  locationId: string,
  promoCode?: string,
): Promise<CheckoutResult> {
  const t = await token();
  if (!t) {
    return { ok: false, error: 'Not signed in', code: 'UNAUTHENTICATED' };
  }
  const response = await fetch(`${API_URL}/cart/checkout`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fulfillment: 'PICKUP',
      locationId,
      ...(promoCode ? { promoCode } : {}),
    }),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => null)) as { orderId?: string; code?: string; message?: string } | null;
  if (!response.ok || !json?.orderId) {
    return { ok: false, error: json?.message ?? `Checkout failed (${response.status})`, code: json?.code };
  }
  return { ok: true, orderId: json.orderId };
}
