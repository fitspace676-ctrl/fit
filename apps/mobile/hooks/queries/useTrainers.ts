// @fit/mobile — the trainer roster, a trainer, and their reviews.
//
// The reviews key is nested *under* the trainer detail
// (`['trainers', gymId, 'detail', id, 'reviews', filters]`), which is what makes
// `createReview`'s single invalidation of the `trainers` root take the rating on
// the profile and the list beneath it together. The two are derived from the
// same rows server-side; letting them refetch independently is how "4.8" ends up
// sitting above four five-star reviews.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  GetTrainerResponse,
  ListTrainerReviewsResponse,
  ListTrainersResponse,
} from '@fit/types';
import { getTrainer, listTrainers } from '../../lib/api/trainers';
import { listTrainerReviews } from '../../lib/api/reviews';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Options for `GET /trainers`. */
export function trainersQueryOptions(gymId: string | null): UseQueryOptions<ListTrainersResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.trainers(scope.gymId),
    queryFn: ({ signal }) => listTrainers({ gymId: scope.gymId }, { signal }),
    enabled: scope.enabled,
  };
}

/** The gym's trainers, ordered by name. */
export function useTrainers() {
  return useQuery(trainersQueryOptions(useGymId()));
}

/** Options for `GET /trainers/:id`. */
export function trainerQueryOptions(
  gymId: string | null,
  trainerId: string | null | undefined,
): UseQueryOptions<GetTrainerResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.trainer(scope.gymId, trainerId ?? ''),
    queryFn: ({ signal }) =>
      getTrainer({ trainerId: trainerId as string, gymId: scope.gymId }, { signal }),
    enabled: scope.enabled && Boolean(trainerId),
  };
}

/** One trainer's profile and upcoming schedule. */
export function useTrainer(trainerId: string | null | undefined) {
  return useQuery(trainerQueryOptions(useGymId(), trainerId));
}

/** One page of a trainer's reviews. */
export interface TrainerReviewsPage {
  page?: number;
  limit?: number;
}

/** Options for `GET /trainers/:id/reviews`. */
export function trainerReviewsQueryOptions(
  gymId: string | null,
  trainerId: string | null | undefined,
  page: TrainerReviewsPage = {},
): UseQueryOptions<ListTrainerReviewsResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.trainerReviews(scope.gymId, trainerId ?? '', {
      page: page.page ?? null,
      limit: page.limit ?? null,
    }),
    queryFn: ({ signal }) =>
      listTrainerReviews(
        { trainerId: trainerId as string, gymId: scope.gymId, page: page.page, limit: page.limit },
        { signal },
      ),
    enabled: scope.enabled && Boolean(trainerId),
  };
}

/**
 * A trainer's visible reviews plus the live aggregate.
 *
 * `avgRating` and `total` span every visible review, not just this page, so
 * "4.8 (23 reviews)" renders above a list of ten without a second request.
 */
export function useTrainerReviews(
  trainerId: string | null | undefined,
  page: TrainerReviewsPage = {},
) {
  return useQuery(trainerReviewsQueryOptions(useGymId(), trainerId, page));
}
