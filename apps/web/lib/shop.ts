// @fit/web — shop-catalogue API helper + price format.
//
// Thin wrapper over the public `@fit/api` `GET /products` endpoint used by the
// web shop listing (T7.6). The listing is `@Public()`, scoped by an explicit
// `gymId` the page resolves from the active subdomain; a signed-in member's
// session is forwarded so it narrows to their home branch (`lib/portal-listing.ts`).

import { productSummarySchema, type ProductSummary } from '@fit/types';
import { createNumberFormat } from '@fit/i18n';
import { fetchPortalListing } from './fetch-portal-listing';

/** Arguments for {@link fetchProducts}. */
export interface FetchProductsArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the gym changes. */
  signal?: AbortSignal;
}

/**
 * Fetch the active products for one gym — a signed-in member's home branch only.
 * Returns the parsed, validated summaries (a malformed payload throws rather than
 * reaching the grid). The caller passes an `AbortSignal` so an unmount settles
 * the request instead of racing it.
 */
export async function fetchProducts({
  gymId,
  signal,
}: FetchProductsArgs): Promise<ProductSummary[]> {
  const body = (await fetchPortalListing('products', { gymId }, { signal, label: 'products' })) as {
    products?: unknown;
  } | null;
  return productSummarySchema.array().parse(body?.products ?? []);
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
    return createNumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}
