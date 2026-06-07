// @fit/web — shop-catalogue API helper + price format.
//
// Thin wrapper over the public `@fit/api` `GET /products` endpoint used by the
// web shop listing (T7.6). Like the class/trainer helpers this is an
// unauthenticated read: the listing is `@Public()`, scoped by an explicit
// `gymId` the page resolves from the active subdomain. The wire contract is
// shared with the mobile Shop tab (`@fit/mobile` `lib/shop.ts`) — same
// `productSummarySchema`, so the two storefronts can never drift.

import { productSummarySchema, type ProductSummary } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchProducts}. */
export interface FetchProductsArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the gym changes. */
  signal?: AbortSignal;
}

/**
 * Fetch the active products for one gym. Returns the parsed, validated summaries
 * (a malformed payload throws rather than reaching the grid). The caller passes
 * an `AbortSignal` so an unmount cancels the request instead of racing it.
 */
export async function fetchProducts({
  gymId,
  signal,
}: FetchProductsArgs): Promise<ProductSummary[]> {
  const params = new URLSearchParams({ gymId });

  const response = await fetch(`${API_URL}/products?${params.toString()}`, {
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

/**
 * Format a minor-unit `amount` for display against an ISO-4217 `currency` in the
 * caller's `locale` (symbol, grouping, decimals all locale-correct). Money
 * crosses the wire in MINOR units (cents/tetri) to avoid float rounding, so
 * divide by 100. Falls back to a plain amount + code if the runtime lacks the
 * currency's data, so a card never crashes. Mirrors the mobile `formatMoney`.
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
