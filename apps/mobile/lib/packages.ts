// @fit/mobile — personal-training package catalogue API helper + price format.
//
// Mirrors the web's `lib/packages.ts`: a read of the public `@fit/api`
// `GET /packages` endpoint, scoped by an explicit `gymId`. Every package plan is
// a gym-curated personal-training offering (price, billing cadence, an optional
// session count, a flat features list), so the whole catalogue is what the
// Personal Training screen (T6.6) lists. The read goes through `apiFetch` (the
// listing is `@Public()`, but the shared client keeps base-URL + header handling
// in one place) and the response is Zod-validated against `@fit/types`, so the
// wire contract can never silently drift from the API.

import { packageSummarySchema, type PackageInterval, type PackageSummary } from '@fit/types';
import { apiFetch } from './api-client';

/** Arguments for {@link fetchPackages}. */
export interface FetchPackagesArgs {
  gymId: string;
  /** Optional branch scope; narrows the catalogue when the gym scopes by location. */
  locationId?: string;
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the gym's purchasable packages via `GET /packages`, parsed and validated
 * (a malformed payload throws rather than reaching the cards). The mobile app
 * reaches this screen behind the auth gate, but the endpoint is public and scoped
 * by the explicit `gymId`, so the read carries no session dependency of its own.
 */
export async function fetchPackages({
  gymId,
  locationId,
  signal,
}: FetchPackagesArgs): Promise<PackageSummary[]> {
  const params = new URLSearchParams({ gymId });
  if (locationId) {
    params.set('locationId', locationId);
  }

  const response = await apiFetch(`/packages?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load packages (${response.status})`);
  }

  const body = (await response.json()) as { packages?: unknown };
  return packageSummarySchema.array().parse(body.packages ?? []);
}

/**
 * Format a package price for display. `priceAmount` crosses the wire in the
 * currency's MINOR units (cents/tetri) to avoid float rounding, so divide by 100
 * and let `Intl.NumberFormat` render it against the ISO-4217 `currency` in the
 * caller's `locale` (symbol, grouping, and decimals all locale-correct). A
 * one-off pack shows no per-interval suffix; recurring plans carry one — the
 * caller appends it from the i18n catalogue keyed on {@link PackageInterval}.
 */
export function formatPackagePrice(pkg: PackageSummary, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: pkg.currency,
      maximumFractionDigits: 2,
    }).format(pkg.priceAmount / 100);
  } catch {
    // An unknown currency code (or a runtime without that currency's data) would
    // throw — fall back to a plain amount + code so a card never crashes.
    return `${(pkg.priceAmount / 100).toFixed(2)} ${pkg.currency}`;
  }
}

/** The i18n key suffix for a recurring plan's price (`/ mo`, `/ yr`), or `null`
 * for a one-off pack that shows no suffix. Mirrors the web wizard's mapping. */
export function priceSuffixKey(interval: PackageInterval): 'perMonth' | 'perYear' | null {
  switch (interval) {
    case 'month':
      return 'perMonth';
    case 'year':
      return 'perYear';
    case 'one_time':
      return null;
  }
}
