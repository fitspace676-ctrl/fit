// @fit/types — class & trainer review contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for member reviews (T5.12): a member who
// attended a class rates (1–5) and optionally writes a review of the trainer who
// led it; the public trainer detail page renders the visible reviews + the live
// aggregate; a manager can soft-hide an abusive one. The API validates inbound
// bodies/queries with these Zod schemas and the web/admin clients reuse the
// inferred types, so the server and the UIs can never drift on the wire format.

import { z } from 'zod';

/** A star rating — an integer 1–5. Mirrored by the DB `reviews_rating_range` CHECK. */
export const reviewRatingSchema = z.coerce.number().int().min(1).max(5);

/** A review's moderation state — the wire mirror of the Prisma `ReviewStatus` enum. */
export const reviewStatusSchema = z.enum(['VISIBLE', 'HIDDEN']);

/** A review's moderation state — {@link reviewStatusSchema}. */
export type ReviewStatusValue = z.infer<typeof reviewStatusSchema>;

/**
 * Body for `POST /reviews`. A member reviews the occurrence they *attended*
 * (identified by `classInstanceId`), so the trainer the review attaches to is
 * derived server-side from the occurrence — never sent by the client. `comment`
 * is optional (a bare star rating is valid) and bounded so a single review can't
 * be unboundedly large; an empty / whitespace-only comment normalises to absent.
 */
export const createReviewSchema = z.object({
  classInstanceId: z.string().min(1),
  rating: reviewRatingSchema,
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

/** Validated `POST /reviews` body — {@link createReviewSchema}. */
export type CreateReviewData = z.infer<typeof createReviewSchema>;

/** Successful `POST /reviews` response — the new review's id (`201`). */
export interface CreateReviewResponse {
  id: string;
}

/**
 * One review as the public trainer detail page needs it — a denormalised,
 * read-only card. `authorName` is the reviewer's display name (their email's
 * local part is never exposed); `comment` is `null` for a bare star rating.
 * Hidden reviews never appear in this projection.
 */
export const publicReviewSchema = z.object({
  id: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  authorName: z.string(),
  createdAt: z.string().datetime(),
});

/** A single public review card — {@link publicReviewSchema}. */
export type PublicReview = z.infer<typeof publicReviewSchema>;

/**
 * Query for `GET /trainers/:id/reviews`. `gymId` scopes the listing to one tenant
 * (the public page resolves it from the active subdomain), `page` is 1-based and
 * `limit` is capped — the reviews list is paginated server-side so a popular
 * trainer's history never loads in full.
 */
export const listTrainerReviewsQuerySchema = z.object({
  gymId: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/** Validated `GET /trainers/:id/reviews` query — {@link listTrainerReviewsQuerySchema}. */
export type ListTrainerReviewsQuery = z.infer<typeof listTrainerReviewsQuerySchema>;

/**
 * Successful `GET /trainers/:id/reviews` response — one page of the trainer's
 * `VISIBLE` reviews plus the live aggregate. `avgRating` is the mean star rating
 * across *all* visible reviews (rounded to one decimal), not just this page, and
 * `total` is their full count, so the page can show "4.8 (23 reviews)" while
 * listing ten. An empty list (no reviews yet) is a normal `200` with `avgRating`
 * `0` and `total` `0`.
 */
export interface ListTrainerReviewsResponse {
  reviews: PublicReview[];
  avgRating: number;
  total: number;
  page: number;
  limit: number;
}

/**
 * One review as the staff moderation list needs it — the public card plus the
 * fields a manager moderates on: the current `status` (so hidden reviews are
 * visible to staff), the author's `email`, and the reviewed occurrence so a
 * manager can see which class drew the review.
 */
export const adminReviewSchema = publicReviewSchema.extend({
  status: reviewStatusSchema,
  authorEmail: z.string(),
  classInstanceId: z.string().nullable(),
  classTitle: z.string().nullable(),
});

/** A single staff-facing review row — {@link adminReviewSchema}. */
export type AdminReview = z.infer<typeof adminReviewSchema>;

/**
 * Query for `GET /admin/trainers/:id/reviews`. Tenant-scoped (the gym comes from
 * the session, not the wire), paginated like the public listing, and narrowable
 * by `status` — omitting it returns every review (visible *and* hidden), the
 * default the moderation queue needs.
 */
export const listAdminTrainerReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: reviewStatusSchema.optional(),
});

/** Validated `GET /admin/trainers/:id/reviews` query — {@link listAdminTrainerReviewsQuerySchema}. */
export type ListAdminTrainerReviewsQuery = z.infer<typeof listAdminTrainerReviewsQuerySchema>;

/**
 * Successful `GET /admin/trainers/:id/reviews` response — one filtered page of
 * the trainer's reviews plus the totals the pager needs. `total` is the count
 * after the optional `status` filter.
 */
export interface ListAdminTrainerReviewsResponse {
  data: AdminReview[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Successful `POST /admin/reviews/:id/hide` | `/unhide` response — the moderated
 * review in its new state, so the console can update the row in place without a
 * refetch. Managers may flip visibility but never edit the content.
 */
export interface SetReviewVisibilityResponse {
  review: AdminReview;
}
