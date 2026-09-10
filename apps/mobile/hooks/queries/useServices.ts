// @fit/mobile — personal training: the catalogue, the open slots, the caller's
// booked sessions.
//
// ## One gap in the key factory, stated out loud
//
// `lib/query-keys.ts` (WP-3) has `serviceSlots` and `myServiceSessions` but **no
// factory for the services catalogue itself** (`GET /services`), even though
// that endpoint is what the Services stack lists. WP-7 does not own that file,
// so {@link SERVICES_KEY_GAP} builds the key here instead, in the shape the
// factory would have produced: resource root at [0], `gymId` at [1], filters at
// [2].
//
// That preserves the invariant that matters — `evictGym` works on it, and no
// tenant can read another's bucket — but it is *not* covered by
// `query-keys.spec.ts`, which is the enforcement mechanism. It should be moved
// into the factory as `services: (gymId) => ['services', gymId]` by that file's
// owner, and this comment deleted with it. Flagged in WP-7's report rather than
// silently worked around.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  ListMemberServiceSessionsResponse,
  ListServiceSlotsQuery,
  ListServiceSlotsResponse,
  ListServicesResponse,
} from '@fit/types';
import {
  listMyServiceSessions,
  listServiceSlots,
  listServices,
} from '../../lib/api/service-sessions';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/**
 * The services-catalogue key, in the absence of a factory for it.
 *
 * See this file's header. Deliberately named so a reader cannot mistake it for
 * a sanctioned key, and so a grep for the gap finds it.
 */
export function SERVICES_KEY_GAP(gymId: string): readonly unknown[] {
  return ['services', gymId] as const;
}

/** Options for `GET /services`. */
export function servicesQueryOptions(gymId: string | null): UseQueryOptions<ListServicesResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: SERVICES_KEY_GAP(scope.gymId),
    queryFn: ({ signal }) => listServices({ gymId: scope.gymId }, { signal }),
    enabled: scope.enabled,
  };
}

/** The gym's ACTIVE services — the personal-training catalogue. */
export function useServices() {
  return useQuery(servicesQueryOptions(useGymId()));
}

/** The window + optional service a slot listing covers. */
export type ServiceSlotWindow = Omit<ListServiceSlotsQuery, 'gymId'>;

/** Options for `GET /service-sessions`. */
export function serviceSlotsQueryOptions(
  gymId: string | null,
  window: ServiceSlotWindow,
): UseQueryOptions<ListServiceSlotsResponse> {
  const scope = gymScope(gymId);
  return {
    // `serviceId` sits at index 2 of the factory, so "all services" and "this
    // service" are separate buckets under one `['serviceSlots', gymId]` root —
    // which is the root a booking invalidates, taking both with it.
    queryKey: queryKeys.serviceSlots(scope.gymId, window.serviceId ?? 'all', {
      from: window.from,
      to: window.to,
    }),
    queryFn: ({ signal }) =>
      listServiceSlots(
        { gymId: scope.gymId, serviceId: window.serviceId, from: window.from, to: window.to },
        { signal },
      ),
    enabled: scope.enabled,
  };
}

/**
 * Bookable OPEN slots in a window.
 *
 * The window is bounded server-side (`MAX_SCHEDULE_WINDOW_DAYS`); an inverted or
 * over-long range is a `400`, not an empty list.
 */
export function useServiceSlots(window: ServiceSlotWindow) {
  return useQuery(serviceSlotsQueryOptions(useGymId(), window));
}

/** Options for `GET /me/service-sessions`. */
export function myServiceSessionsQueryOptions(
  gymId: string | null,
): UseQueryOptions<ListMemberServiceSessionsResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.myServiceSessions(scope.gymId),
    queryFn: ({ signal }) => listMyServiceSessions({ signal }),
    enabled: scope.enabled,
  };
}

/** The caller's booked sessions, each with the invoice it raised. */
export function useMyServiceSessions() {
  return useQuery(myServiceSessionsQueryOptions(useGymId()));
}
