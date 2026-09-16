// @fit/mobile — the public tenant lookup.
//
// The only hook here that is *not* gym-scoped, and necessarily so: it is what
// the join / login flow resolves **before** a session exists, so there is no gym
// to scope it by. `queryKeys.gymBySlug` is the single entry in
// `NON_GYM_SCOPED_KEYS` for exactly this reason, and it carries only the public
// tenant record — name, brand, timezone — so surviving a session change leaks
// nothing.
//
// `GET /gyms` (the whole-platform roster) is a SUPER_ADMIN surface and has no
// hook, no fetcher and no entry in `ENDPOINTS`.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { GymBySubdomainResponse } from '@fit/types';
import { getGymBySubdomain } from '../../lib/api/gyms';
import { queryKeys } from '../../lib/query-keys';

/** Options for `GET /gyms/by-subdomain/:slug`. */
export function gymBySlugQueryOptions(
  slug: string | null | undefined,
): UseQueryOptions<GymBySubdomainResponse> {
  return {
    queryKey: queryKeys.gymBySlug(slug ?? ''),
    queryFn: ({ signal }) => getGymBySubdomain({ slug: slug as string }, { signal }),
    enabled: Boolean(slug),
    // Branding and timezone change about never; the login screen re-mounts often.
    staleTime: 10 * 60_000,
  };
}

/**
 * A gym's public entry view, by subdomain slug.
 *
 * An unknown or reserved slug is a `404 GYM_NOT_FOUND`, which surfaces as an
 * `ApiError` — the login screen renders that as "we don't know that gym", not as
 * a failure.
 */
export function useGymBySlug(slug: string | null | undefined) {
  return useQuery(gymBySlugQueryOptions(slug));
}
