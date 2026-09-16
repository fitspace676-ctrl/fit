// @fit/mobile — the member's own bookings (`GET /me/bookings`).
//
// Each row embeds the full occurrence detail, so a list renders complete cards
// and deep links without a per-row round trip. The member is the session; there
// is no member id to pass and none to get wrong.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { ListMemberBookingsQuery, ListMemberBookingsResponse } from '@fit/types';
import { listMyBookings } from '../../lib/api/bookings';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** `upcoming` | `past` | `all`; the server defaults to `all`. */
export type BookingScope = ListMemberBookingsQuery['scope'];

/** Options for `GET /me/bookings`. */
export function myBookingsQueryOptions(
  gymId: string | null,
  scope?: BookingScope,
): UseQueryOptions<ListMemberBookingsResponse> {
  const gym = gymScope(gymId);
  return {
    queryKey: queryKeys.bookingList(gym.gymId, { scope: scope ?? null }),
    queryFn: ({ signal }) => listMyBookings({ scope }, { signal }),
    enabled: gym.enabled,
  };
}

/**
 * The caller's bookings for one scope.
 *
 * The scope is in the key, so the "upcoming" and "past" tabs are separate cache
 * entries under the same `queryKeys.bookings(gymId)` root — which is what lets
 * every booking mutation invalidate both with a single call.
 */
export function useMyBookings(scope?: BookingScope) {
  return useQuery(myBookingsQueryOptions(useGymId(), scope));
}
