// @fit/mobile — one class occurrence's detail as a TanStack Query.
//
// Backs the class-detail screen (T6.4): wraps `fetchClassInstance` in a query
// keyed on the gym + occurrence id so it caches and deduplicates like the
// week-listing query. The query is disabled until both a gym scope and an
// instance id are known; a missing occurrence (`404`) surfaces as a
// `ClassInstanceNotFound` error the screen renders as its "not found" state.
//
// `404` is *not* retried (a missing class won't appear on a retry — that would
// just delay the not-found screen), while transient failures fall back to the
// app-wide retry policy from QueryProvider.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ClassInstanceDetail } from '@fit/types';
import { ClassInstanceNotFound, fetchClassInstance } from '../lib/classes';

/**
 * Load the detail for occurrence `instanceId` in gym `gymId`. Pass either as
 * `null`/`undefined` while the value is unknown (no gym scope yet, or the route
 * param hasn't resolved) — the query stays disabled and reports `data` as
 * undefined. A `404` resolves to a `ClassInstanceNotFound` error (not retried).
 */
export function useClassInstance(
  gymId: string | null,
  instanceId: string | undefined,
): UseQueryResult<ClassInstanceDetail> {
  return useQuery({
    queryKey: ['class-instance', gymId, instanceId],
    queryFn: ({ signal }) =>
      fetchClassInstance({ gymId: gymId as string, instanceId: instanceId as string, signal }),
    enabled: gymId !== null && !!instanceId,
    // A missing occurrence is terminal — don't burn retries on it.
    retry: (failureCount, error) =>
      error instanceof ClassInstanceNotFound ? false : failureCount < 2,
  });
}
