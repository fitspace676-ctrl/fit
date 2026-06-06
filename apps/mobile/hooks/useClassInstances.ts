// @fit/mobile — the current week's class occurrences as a TanStack Query.
//
// Wraps `fetchClassInstances` in a query keyed on the gym + week window so the
// app-wide client (QueryProvider) caches and deduplicates it: switching the
// week/list toggle reuses the cached week, and revisiting the Classes tab within
// the gcTime is instant. The query is disabled until a gym scope is known, and
// the queryFn forwards React Query's `signal` so a fast week-navigation sequence
// cancels superseded requests instead of racing them.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ClassInstanceCard } from '@fit/types';
import { fetchClassInstances, weekWindow } from '../lib/classes';

/**
 * Load the occurrences for `gymId` in the week starting at `weekStart` (Monday).
 * Pass `gymId: null` while the session has no gym scope — the query stays
 * disabled and reports `data` as undefined. Both calendar views read from this
 * single query; the week window is the cache key, so toggling views is free.
 */
export function useClassInstances(
  gymId: string | null,
  weekStart: Date,
): UseQueryResult<ClassInstanceCard[]> {
  const { from, to } = weekWindow(weekStart);
  return useQuery({
    queryKey: ['class-instances', gymId, from, to],
    queryFn: ({ signal }) => fetchClassInstances({ gymId: gymId as string, from, to, signal }),
    enabled: gymId !== null,
  });
}
