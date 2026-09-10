// @fit/mobile — reviews: posting one, and reading a trainer's.
//
// Two controllers with deliberately asymmetric authorization:
//
//   - `POST /reviews` — `ReviewWrite`, member self-service. Accepted only when
//     the caller has an **`ATTENDED`** booking for that occurrence (`403
//     NOT_ATTENDED`), and only once per `(member, classInstance)` — a second is
//     `409 ALREADY_REVIEWED`, enforced by a unique constraint as well as a
//     pre-check, so a double-submit race still gets the same 409.
//   - `GET /trainers/:id/reviews` — `@Public()`, because the gym's site shows it
//     to visitors.
//
// A review is written against a **class occurrence**, but its visible effect is
// on the **trainer**: `ReviewsService` recomputes the trainer's denormalised
// `rating` / `reviewCount` over VISIBLE reviews in the same transaction. The
// client is never told which trainer led the class, so `createReview`
// invalidates the whole `queryKeys.trainers(gymId)` subtree — the reviews key is
// nested under the trainer detail precisely so one invalidation covers both, and
// the profile's average can never disagree with the list under it.

import type {
  CreateReviewData,
  CreateReviewResponse,
  ListTrainerReviewsQuery,
  ListTrainerReviewsResponse,
} from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `POST /reviews` — rate a class the caller attended. `201 { id }`.
 *
 * `comment` is optional (a bare star rating is valid) and capped at 2000 chars;
 * an empty / whitespace-only comment normalises to absent server-side.
 */
export async function createReview(
  input: CreateReviewData,
  options: FetchOptions = {},
): Promise<CreateReviewResponse> {
  return apiJson<CreateReviewResponse>(endpointPath(ENDPOINTS.createReview), {
    method: ENDPOINTS.createReview.method,
    json: input,
    signal: options.signal,
  });
}

/**
 * `GET /trainers/:id/reviews?gymId&page&limit` — one page of a trainer's VISIBLE
 * reviews plus the live aggregate.
 *
 * `avgRating` and `total` span *every* visible review, not just this page, so
 * "4.8 (23 reviews)" can be rendered above a list of ten. No reviews yet is a
 * normal `200` with `avgRating: 0`.
 */
export async function listTrainerReviews(
  params: { trainerId: string } & Pick<ListTrainerReviewsQuery, 'gymId'> &
    Partial<Omit<ListTrainerReviewsQuery, 'gymId'>>,
  options: FetchOptions = {},
): Promise<ListTrainerReviewsResponse> {
  return apiJson<ListTrainerReviewsResponse>(
    endpointPath(ENDPOINTS.listTrainerReviews, { id: params.trainerId }),
    {
      method: ENDPOINTS.listTrainerReviews.method,
      query: { gymId: params.gymId, page: params.page, limit: params.limit },
      signal: options.signal,
    },
  );
}
