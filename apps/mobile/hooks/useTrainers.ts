// @fit/mobile — a gym's trainer roster as a TanStack Query.
//
// Wraps `fetchTrainers` in a query keyed on the gym so the app-wide client
// (QueryProvider) caches and deduplicates it: revisiting the Trainers screen
// within the gcTime is instant. The query is disabled until a gym scope is
// known, and the queryFn forwards React Query's `signal` so a superseded
// request is cancelled instead of racing.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { TrainerCard } from '@fit/types';
import { fetchTrainers } from '../lib/trainers';

/**
 * Load the trainer roster for `gymId`. Pass `gymId: null` while the session has
 * no gym scope — the query stays disabled and reports `data` as undefined. The
 * screen filters/searches this cached roster client-side, so typing never
 * refetches.
 */
export function useTrainers(gymId: string | null): UseQueryResult<TrainerCard[]> {
  return useQuery({
    queryKey: ['trainers', gymId],
    queryFn: ({ signal }) => fetchTrainers({ gymId: gymId as string, signal }),
    enabled: gymId !== null,
  });
}
