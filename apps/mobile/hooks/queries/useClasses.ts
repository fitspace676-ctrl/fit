// @fit/mobile — the class schedule, as screens see it.
//
// The two reads are `@Public()` on the API but gym-scoped in the cache: the
// `gymId` sent on the wire and the `gymId` at index 1 of the key are the same
// value, taken from `useActiveGym`. That is the whole point of routing it
// through one authority — a schedule fetched for gym A can never be read back
// under gym B.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  GetClassInstanceResponse,
  ListClassInstancesQuery,
  ListClassInstancesResponse,
} from '@fit/types';
import { getClass, listClasses } from '../../lib/api/classes';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/**
 * The window a schedule read covers — the wire query minus `gymId`, which comes
 * from the session rather than from the caller. ISO-8601 instants; `view` is a
 * hint the server may ignore, since the response shape is identical either way.
 */
export type ClassWindow = Omit<ListClassInstancesQuery, 'gymId'>;

/** Options for `GET /class-instances`, built from a nullable gym scope. */
export function classesQueryOptions(
  gymId: string | null,
  window: ClassWindow,
): UseQueryOptions<ListClassInstancesResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.classList(scope.gymId, { ...window }),
    queryFn: ({ signal }) =>
      listClasses(
        { gymId: scope.gymId, from: window.from, to: window.to, view: window.view },
        { signal },
      ),
    enabled: scope.enabled,
  };
}

/**
 * The occurrences overlapping `[from, to]`.
 *
 * The window is part of the key, so scrolling to next week is a new cache entry
 * rather than a refetch that discards this one — going back is instant.
 */
export function useClasses(window: ClassWindow) {
  return useQuery(classesQueryOptions(useGymId(), window));
}

/** Options for `GET /class-instances/:id`. */
export function classQueryOptions(
  gymId: string | null,
  classId: string | null | undefined,
): UseQueryOptions<GetClassInstanceResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.classDetail(scope.gymId, classId ?? ''),
    queryFn: ({ signal }) =>
      getClass({ classId: classId as string, gymId: scope.gymId }, { signal }),
    // A deep link resolves its param asynchronously, so `classId` is briefly
    // absent — that is a disabled query, not a request for `/class-instances/`.
    enabled: scope.enabled && Boolean(classId),
  };
}

/**
 * One occurrence's detail.
 *
 * The detail carries `status`, so a shared link to a since-canceled class
 * renders a banner rather than a confusing 404 — branch on `data.instance.status`
 * before assuming the class is bookable.
 */
export function useClass(classId: string | null | undefined) {
  return useQuery(classQueryOptions(useGymId(), classId));
}
