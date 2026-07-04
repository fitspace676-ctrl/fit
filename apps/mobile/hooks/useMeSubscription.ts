// @fit/mobile — the signed-in member's own membership as a TanStack Query.
//
// The check-in screen (T7.8) reads this to paint its membership pass with live
// data (plan, status, days left in the billing period). Self-scoped: `/me/*`
// resolves the caller from the session, so — unlike the gym-scoped class/booking
// queries — there is no gym id in the key and nothing to gate on. The query key
// is shared so a future membership screen (freeze/unfreeze) can invalidate it.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeSubscription } from '@fit/types';
import { fetchMeSubscription } from '../lib/me';

/** The query key for the member's own subscription. */
export function meSubscriptionKey() {
  return ['me-subscription'] as const;
}

/**
 * Load the signed-in member's current membership. `data` is `null` for a member
 * with no live subscription (rendered as a "no active plan" pass).
 */
export function useMeSubscription(): UseQueryResult<MeSubscription | null> {
  return useQuery({
    queryKey: meSubscriptionKey(),
    queryFn: ({ signal }) => fetchMeSubscription({ signal }),
  });
}
