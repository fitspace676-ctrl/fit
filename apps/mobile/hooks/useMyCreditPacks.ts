// @fit/mobile — the signed-in member's PT credit packs as a TanStack Query.
//
// The Profile tab (T7.9) reads this for the "PT credits" card's session balance.
// Self-scoped like `useMeSubscription` / `useMeProfile`: `/members/me/credit-packs`
// resolves the caller from the session, so there is no gym id in the key. The key
// is shared so a future "buy credits" action can invalidate it.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CreditPackSummary } from '@fit/types';
import { fetchMyCreditPacks } from '../lib/credit-packs';

/** The query key for the member's own credit packs. */
export function myCreditPacksKey() {
  return ['me-credit-packs'] as const;
}

/** Load the signed-in member's usable PT credit packs (empty when they own none). */
export function useMyCreditPacks(): UseQueryResult<CreditPackSummary[]> {
  return useQuery({
    queryKey: myCreditPacksKey(),
    queryFn: ({ signal }) => fetchMyCreditPacks({ signal }),
  });
}
