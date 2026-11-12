// @fit/mobile — the caller's own profile (`/me/profile`).
//
// Gym-scoped keys even though the underlying `User` is gym-independent: signing
// into a different tenant means a different session, and a profile cached under
// one must not be readable under another. `evictGym` depends on it.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { GetMeProfileResponse } from '@fit/types';
import { getMyProfile } from '../../lib/api/me';
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
