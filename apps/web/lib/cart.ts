// @fit/web — shop cart read helper (server-only).
//
// Reads the signed-in member's cart from `GET /cart`, forwarding the access
// token as a bearer (a member's cart is bound to their session — no anon cookie
// relay needed). Tolerant: an absent session / non-OK resolves to an empty cart.

import { cookies } from 'next/headers';
import type { CartItemDetail, CartView } from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const EMPTY: CartView = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };

/** Coerce an unknown payload into a {@link CartView} with sane fallbacks. */
export function parseCartView(raw: unknown): CartView {
  if (!raw || typeof raw !== 'object') {
    return EMPTY;
  }
  const r = raw as Record<string, unknown>;
  const items: CartItemDetail[] = Array.isArray(r.items)
    ? r.items
        .map((entry): CartItemDetail | null => {
          if (!entry || typeof entry !== 'object') return null;
          const e = entry as Record<string, unknown>;
          if (typeof e.variantId !== 'string' || typeof e.productId !== 'string') return null;
          return {
            variantId: e.variantId,
            productId: e.productId,
            productName: typeof e.productName === 'string' ? e.productName : '',
            variantName: typeof e.variantName === 'string' ? e.variantName : null,
            imageUrl: typeof e.imageUrl === 'string' ? e.imageUrl : null,
            unitPrice: typeof e.unitPrice === 'number' ? e.unitPrice : 0,
            qty: typeof e.qty === 'number' ? e.qty : 1,
            lineTotal: typeof e.lineTotal === 'number' ? e.lineTotal : 0,
            currency: typeof e.currency === 'string' ? e.currency : 'GEL',
            available: e.available !== false,
          };
        })
        .filter((x): x is CartItemDetail => x !== null)
    : [];
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    items,
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    total: num(r.total),
    currency: typeof r.currency === 'string' ? r.currency : 'GEL',
  };
}

/** Fetch the caller's cart, or an empty cart when signed out / on any error. */
export async function fetchCart({ signal }: { signal?: AbortSignal } = {}): Promise<CartView> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return EMPTY;
  }
  try {
    const response = await fetch(`${API_URL}/cart`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      return EMPTY;
    }
    const body = (await response.json().catch(() => null)) as { cart?: unknown } | null;
    return parseCartView(body?.cart);
  } catch {
    return EMPTY;
  }
}
