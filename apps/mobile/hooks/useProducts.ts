// @fit/mobile — the gym's shop products as a TanStack Query.
//
// The Shop browse screen (T6.7) reads this to render the gym's purchasable
// products. Keyed on the gym scope so a re-scoped session (a future gym switch
// re-issuing the token) refetches the right catalogue; enabled only once a gym
// scope exists — the active gym id is part of the key.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ProductSummary } from '@fit/types';
import { fetchProducts } from '../lib/shop';

/** The query key for a gym's shop product catalogue. */
export function productsKey(gymId: string | null) {
  return ['products', gymId] as const;
}

/**
 * Load the active gym's shop products. Pass `gymId: null` while the session has
 * no gym scope — the query stays disabled and reports `data` as undefined.
 */
export function useProducts(gymId: string | null): UseQueryResult<ProductSummary[]> {
  return useQuery({
    queryKey: productsKey(gymId),
    queryFn: ({ signal }) => fetchProducts({ gymId: gymId as string, signal }),
    enabled: gymId !== null,
  });
}
