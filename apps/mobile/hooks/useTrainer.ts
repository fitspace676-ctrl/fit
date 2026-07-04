// @fit/mobile — one trainer's profile + schedule as a TanStack Query.
//
// Wraps `fetchTrainer` in a query keyed on the gym + trainer id. The query is
// disabled until both a gym scope and a trainer id are known, and the queryFn
// forwards React Query's `signal` so a superseded detail request is cancelled.
// A `404` throws {@link TrainerNotFound} (not retried here) so the detail screen
// can render its dedicated "trainer not found" state.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { TrainerDetail } from '@fit/types';
import { fetchTrainer, TrainerNotFound } from '../lib/trainers';

/**
 * Load one trainer's detail for `gymId` / `trainerId`. Pass a `null` gym or an
 * empty id while either is unknown — the query stays disabled and reports `data`
 * as undefined. A missing / cross-tenant trainer surfaces as a `TrainerNotFound`
 * error; that case is not retried (the id will not become valid on retry).
 */
export function useTrainer(
  gymId: string | null,
  trainerId: string | undefined,
): UseQueryResult<TrainerDetail> {
  return useQuery({
    queryKey: ['trainer', gymId, trainerId],
    queryFn: ({ signal }) =>
      fetchTrainer({ gymId: gymId as string, trainerId: trainerId as string, signal }),
    enabled: gymId !== null && !!trainerId,
    retry: (failureCount, error) => !(error instanceof TrainerNotFound) && failureCount < 3,
  });
}
