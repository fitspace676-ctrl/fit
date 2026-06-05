// @fit/web — location-discovery API helpers.
//
// Thin wrapper over the public `@fit/api` `GET /locations` endpoint used by the
// purchase wizard's first step (T3.8). Like the class helpers this is an
// unauthenticated read scoped by an explicit `gymId` the page resolves from the
// active subdomain — the wizard is reachable signed-out (the auth gate is the
// final payment step, not the browse).

import { locationSummarySchema, type LocationSummary } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchLocations}. */
export interface FetchLocationsArgs {
  gymId: string;
  /** Abort signal so an in-flight request is cancelled if the component unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the gym's locations. Returns the parsed, validated summaries (a
 * malformed payload throws rather than reaching the cards). The caller passes an
 * `AbortSignal` so unmounting the step cancels the request instead of leaking it.
 */
export async function fetchLocations({
  gymId,
  signal,
}: FetchLocationsArgs): Promise<LocationSummary[]> {
  const params = new URLSearchParams({ gymId });

  const response = await fetch(`${API_URL}/locations?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load locations (${response.status})`);
  }

  const body = (await response.json()) as { locations?: unknown };
  return locationSummarySchema.array().parse(body.locations ?? []);
}
