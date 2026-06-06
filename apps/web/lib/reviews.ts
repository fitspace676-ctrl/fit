// @fit/web — trainer-reviews API helpers.
//
// Thin wrapper over the public `@fit/api` `GET /trainers/:id/reviews` endpoint
// used by the trainer detail page's Reviews section (T5.12). Like the other
// trainer-discovery helpers this is an unauthenticated read: the listing is
// `@Public()`, scoped by an explicit `gymId` the page resolves from the active
// subdomain, and returns only VISIBLE reviews plus the live aggregate.

import { publicReviewSchema, type ListTrainerReviewsResponse, type PublicReview } from '@fit/types';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchTrainerReviews}. */
export interface FetchTrainerReviewsArgs {
  gymId: string;
  /** The trainer's id, from the detail route's path segment. */
  id: string;
  /** 1-based page (defaults to the API's first page). */
  page?: number;
  /** Page size (defaults to the API's default). */
  limit?: number;
  /** Abort signal so an in-flight request is cancelled if the request changes. */
  signal?: AbortSignal;
}

/**
 * Fetch one page of a trainer's visible reviews + the live aggregate for the
 * detail page. Returns the parsed, validated {@link ListTrainerReviewsResponse}
 * (a malformed payload throws rather than reaching the page). An unknown /
 * cross-tenant trainer id is a normal empty result from the API, not an error.
 */
export async function fetchTrainerReviews({
  gymId,
  id,
  page,
  limit,
  signal,
}: FetchTrainerReviewsArgs): Promise<ListTrainerReviewsResponse> {
  const params = new URLSearchParams({ gymId });
  if (page !== undefined) {
    params.set('page', String(page));
  }
  if (limit !== undefined) {
    params.set('limit', String(limit));
  }

  const response = await fetch(
    `${API_URL}/trainers/${encodeURIComponent(id)}/reviews?${params.toString()}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    },
  );

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load reviews (${response.status})`);
  }

  // The reviews are validated per item (a malformed payload throws); the scalar
  // aggregate fields are read off the envelope, mirroring `fetchTrainers`.
  const body = (await response.json()) as {
    reviews?: unknown;
    avgRating?: number;
    total?: number;
    page?: number;
    limit?: number;
  };
  return {
    reviews: publicReviewSchema.array().parse(body.reviews ?? []),
    avgRating: body.avgRating ?? 0,
    total: body.total ?? 0,
    page: body.page ?? 1,
    limit: body.limit ?? 10,
  };
}

export type { PublicReview };
