// @fit/web — package-catalogue API helpers.
//
// Thin wrapper over the public `@fit/api` `GET /packages` endpoint used by the
// purchase wizard's second step (T3.9). Like the location helper this is an
// unauthenticated read scoped by an explicit `gymId` (and the `locationId`
// chosen in step 1) that the page resolves from the active subdomain — the
// wizard is reachable signed-out (the auth gate is the final payment step, not
// the browse).

import { packageSummarySchema, type PackageSummary } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchPackages}. */
export interface FetchPackagesArgs {
  gymId: string;
  /** Branch chosen in step 1; narrows the catalogue when the API scopes by location. */
  locationId?: string;
  /** Abort signal so an in-flight request is cancelled if the component unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the gym's purchasable packages. Returns the parsed, validated summaries
 * (a malformed payload throws rather than reaching the cards). The caller passes
 * an `AbortSignal` so unmounting the step cancels the request instead of leaking
 * it.
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

  const response = await fetch(`${API_URL}/packages?${params.toString()}`, {
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
