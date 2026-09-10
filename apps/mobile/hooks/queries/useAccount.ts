// @fit/mobile — the caller's own profile and goals (`/me/profile`, `/me/goals`).
//
// Gym-scoped keys even though the underlying `User` is gym-independent: signing
// into a different tenant means a different session, and a profile cached under
// one must not be readable under another. `evictGym` depends on it.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { GetMeProfileResponse, ListMeGoalsResponse } from '@fit/types';
import { getMyGoals, getMyProfile } from '../../lib/api/me';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Options for `GET /me/profile`. */
export function myProfileQueryOptions(gymId: string | null): UseQueryOptions<GetMeProfileResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.profile(scope.gymId),
    queryFn: ({ signal }) => getMyProfile({ signal }),
    enabled: scope.enabled,
  };
}

/** Name, email and phone. */
export function useMyProfile() {
  return useQuery(myProfileQueryOptions(useGymId()));
}

/** Options for `GET /me/goals`. */
export function myGoalsQueryOptions(gymId: string | null): UseQueryOptions<ListMeGoalsResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.goals(scope.gymId),
    queryFn: ({ signal }) => getMyGoals({ signal }),
    enabled: scope.enabled,
  };
}

/** The training goals, with current/target progress. Replaced whole, never patched. */
export function useMyGoals() {
  return useQuery(myGoalsQueryOptions(useGymId()));
}
