import { Injectable } from '@nestjs/common';
import { Prisma, ReviewStatus } from '@fit/db';
import type { ListTrainerReviewsQuery, ListTrainerReviewsResponse, PublicReview } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';

/** The review columns the public projection reads, joined to the reviewer's
 * display name (the email is never exposed on the public surface). */
const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  member: { select: { user: { select: { name: true } } } },
} satisfies Prisma.ReviewSelect;

type PublicReviewRecord = Prisma.ReviewGetPayload<{ select: typeof PUBLIC_REVIEW_SELECT }>;

/**
 * Public read of a trainer's reviews for the unauthenticated detail page
 * (`GET /trainers/:id/reviews`, T5.12).
 *
 * Mirrors the public {@link import('../trainers/trainers.service').TrainersService}
 * discovery surface: the endpoint is `@Public()` and excluded from the JWT
 * `TenantMiddleware`, so there is **no** tenant in scope and this runs on the
 * **unscoped** {@link PrismaService} — the gym is identified explicitly by the
 * `gymId` query param the page resolves from the subdomain, and every query
 * constrains `gymId` + `status = VISIBLE` by hand (a hidden review never reaches
 * the public, and a cross-tenant trainer id simply yields an empty page).
 *
 * The trainer's denormalised `Trainer.rating` is the same VISIBLE aggregate this
 * computes, but it is recomputed here from the reviews directly so the listing's
 * `avgRating` / `total` always agree with the rows on the page even if the
 * denormalised column were ever stale.
 */
@Injectable()
export class PublicReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of a trainer's `VISIBLE` reviews for `gymId`, newest first, plus the
   * live aggregate over *all* of them (`avgRating` rounded to one decimal,
   * `total` the full count). An unknown / cross-tenant trainer id, or a trainer
   * with no reviews, is a normal `200` with an empty list and a `0` average — the
   * page renders its "no reviews yet" state.
   */
  async listForTrainer(
    trainerId: string,
    query: ListTrainerReviewsQuery,
  ): Promise<ListTrainerReviewsResponse> {
    const where: Prisma.ReviewWhereInput = {
      trainerId,
      gymId: query.gymId,
      status: ReviewStatus.VISIBLE,
    };
    const skip = (query.page - 1) * query.limit;

    const [rows, total, agg] = await Promise.all([
      this.prisma.client.review.findMany({
        where,
        select: PUBLIC_REVIEW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.review.count({ where }),
      this.prisma.client.review.aggregate({ where, _avg: { rating: true } }),
    ]);

    const avg = agg._avg.rating ?? 0;
    return {
      reviews: rows.map((row) => toPublicReview(row)),
      avgRating: Math.round(avg * 10) / 10,
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}

/** Project a queried review row to the public {@link PublicReview} — the author's
 * display name falls back to a generic label when a member has no name set (their
 * email is never surfaced publicly), and a bare star rating has a `null` comment. */
function toPublicReview(row: PublicReviewRecord): PublicReview {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    authorName: row.member.user.name ?? 'Member',
    createdAt: row.createdAt.toISOString(),
  };
}
