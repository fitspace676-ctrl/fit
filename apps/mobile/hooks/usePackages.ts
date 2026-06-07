// @fit/mobile — the gym's personal-training packages as a TanStack Query.
//
// The Personal Training screen (T6.6) reads this to render the gym's package
// offerings. Keyed on the gym scope so a re-scoped session (a future gym switch
// re-issuing the token) refetches the right catalogue; enabled only once a gym
// scope exists — the active gym id is part of the key.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PackageSummary } from '@fit/types';
import { fetchPackages } from '../lib/packages';

/** The query key for a gym's package catalogue. */
export function packagesKey(gymId: string | null) {
  return ['packages', gymId] as const;
}

/**
 * Load the active gym's purchasable packages. Pass `gymId: null` while the
 * session has no gym scope — the query stays disabled and reports `data` as
 * undefined.
 */
export function usePackages(gymId: string | null): UseQueryResult<PackageSummary[]> {
  return useQuery({
    queryKey: packagesKey(gymId),
    queryFn: ({ signal }) => fetchPackages({ gymId: gymId as string, signal }),
    enabled: gymId !== null,
  });
}
