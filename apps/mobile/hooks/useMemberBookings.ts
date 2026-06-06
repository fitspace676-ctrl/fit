// @fit/mobile — the signed-in member's bookings as a TanStack Query.
//
// The class-detail screen (T6.4) reads this to know the caller's own booking
// state for the occurrence it shows (am I already booked / waitlisted?), which
// decides whether it offers Book / Join waitlist or a Cancel action. The book /
// cancel mutations invalidate this same query key, so the detail UI re-syncs
// straight after an action. The Bookings tab (T6.5) will reuse it.
//
// Keyed on the scope so `upcoming` / `all` slices cache independently. Enabled
// only once a gym scope exists — the active gym id is part of the key so a
// re-scoped session refetches the right member's bookings.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MemberBookingHistoryEntry, MemberBookingScope } from '@fit/types';
import { fetchMemberBookings } from '../lib/bookings';

/** The query key for a member-bookings slice, shared by the read hook and the
 * book / cancel mutations that invalidate it. */
export function memberBookingsKey(gymId: string | null, scope: MemberBookingScope) {
  return ['member-bookings', gymId, scope] as const;
}

/**
 * Load the signed-in member's bookings for `scope` (default `all`). Pass
 * `gymId: null` while the session has no gym scope — the query stays disabled
 * and reports `data` as undefined.
 */
export function useMemberBookings(
  gymId: string | null,
  scope: MemberBookingScope = 'all',
): UseQueryResult<MemberBookingHistoryEntry[]> {
  return useQuery({
    queryKey: memberBookingsKey(gymId, scope),
    queryFn: ({ signal }) => fetchMemberBookings({ scope, signal }),
    enabled: gymId !== null,
  });
}
