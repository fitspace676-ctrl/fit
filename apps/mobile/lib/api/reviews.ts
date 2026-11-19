// @fit/mobile — reviews: posting one, and reading a trainer's.
//
// Member reads use GET /reviews/trainers/:id: the server derives the gym and
// membership from authentication, marks own reviews, and excludes reports.
// POST /reviews/:id/report persists an idempotent report for moderation.

import type {
  CreateReviewData,
  ReportReviewData,
  ReportReviewResponse,
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
 * `GET /reviews/trainers/:id?page&limit` — one page of a trainer's VISIBLE
 * reviews plus the live aggregate.
 *
 * `avgRating` and `total` span *every* visible, unreported review, not just this page, so
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
      query: { page: params.page, limit: params.limit },
      signal: options.signal,
    },
  );
}

export async function reportReview(
  id: string,
  input: ReportReviewData,
): Promise<ReportReviewResponse> {
  return apiJson<ReportReviewResponse>(endpointPath(ENDPOINTS.reportReview, { id }), {
    method: ENDPOINTS.reportReview.method,
    json: input,
  });
}
