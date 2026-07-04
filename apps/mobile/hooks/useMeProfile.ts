// @fit/mobile — the signed-in member's profile as a TanStack Query.
//
// The check-in screen (T7.8) reads this for the member's display name on the
// pass (the session JWT carries only `sub`, no name). Self-scoped like
// `useMeSubscription`: `/me/profile` resolves the caller from the session, so
// there is no gym id in the key.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeProfile } from '@fit/types';
import { fetchMeProfile } from '../lib/me';

/** The query key for the member's own profile. */
export function meProfileKey() {
  return ['me-profile'] as const;
}

/** Load the signed-in member's profile (name, email, phone). */
export function useMeProfile(): UseQueryResult<MeProfile | null> {
  return useQuery({
    queryKey: meProfileKey(),
    queryFn: ({ signal }) => fetchMeProfile({ signal }),
  });
}
