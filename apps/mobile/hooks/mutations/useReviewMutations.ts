// @fit/mobile — posting a review.
//
// The review names a *class occurrence*, but its visible effect is on the
// **trainer**: `ReviewsService` recomputes the trainer's denormalised `rating`
// and `reviewCount` over VISIBLE reviews in the same transaction that accepts
// it. The client is never told which trainer led that class, so the whole
// `trainers` root is invalidated — and because `trainerReviews` is nested under
// the trainer detail key, one call takes the reviews list with it. The profile's
// average and the list under it therefore cannot disagree.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { CreateReviewData, CreateReviewResponse } from '@fit/types';
import { createReview } from '../../lib/api/reviews';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /reviews`. */
export function createReviewMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CreateReviewResponse, Error, CreateReviewData> {
  return {
    mutationKey: ['createReview'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Posting a review');
      return createReview(input);
    },
    onSuccess: () => {
      invalidateFor(deps.queryClient, requireGymId(deps.gymId, 'Posting a review'), 'createReview');
    },
  };
}

/**
 * Rate a class the caller attended.
 *
 * Accepted only with an `ATTENDED` booking for that occurrence
 * (`403 NOT_ATTENDED`) and only once (`409 ALREADY_REVIEWED`, enforced by a
 * unique constraint as well as a pre-check, so a double-submit race gets the
 * same 409 rather than two rows).
 */
export function useCreateReview() {
  return useMutation(createReviewMutationOptions(useMutationDeps()));
}
