import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, Prisma, ReviewStatus } from '@fit/db';
import type {
  AdminReview,
  CreateReviewData,
  CreateReviewResponse,
  ListAdminTrainerReviewsQuery,
  ListAdminTrainerReviewsResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** Audit-log action keys for the manager moderation actions (T5.12). */
const AUDIT_REVIEW_HIDE = 'review.hide';
const AUDIT_REVIEW_UNHIDE = 'review.unhide';

/** The review columns the staff moderation projection reads, joined to the
 * reviewer's identity and the reviewed occurrence's title. */
const ADMIN_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  status: true,
  classInstanceId: true,
  createdAt: true,
  member: { select: { user: { select: { name: true, email: true } } } },
  classInstance: {
    select: {
      template: { select: { title: true } },
      classType: { select: { name: true } },
    },
  },
} satisfies Prisma.ReviewSelect;

type AdminReviewRecord = Prisma.ReviewGetPayload<{ select: typeof ADMIN_REVIEW_SELECT }>;

/** The interactive-transaction client the extended tenant client hands to a
 * `$transaction` callback — the full model surface minus the session-management
 * methods Prisma forbids inside a transaction. Mirrors `Prisma.TransactionClient`
 * for the *extended* client, so a recompute helper can run on the same tx. */
type ScopedTransactionClient = Omit<
  TenantPrismaService['client'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Member review submission + staff moderation for a gym's reviews (T5.12).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `review` /
 * `booking` / `classInstance` / `trainer` / `auditLog` query is auto-constrained
 * to the caller's gym by the Prisma tenant extension, so a member only ever
 * reviews their own gym's classes and staff only ever moderate their own — there
 * is no `gymId` to pass or to forget. The *public* read of a trainer's visible
 * reviews lives in {@link import('./public-reviews.service').PublicReviewsService}
 * (unauthenticated, scoped by an explicit `gymId` query param).
 *
 * Two correctness properties the submission flow holds:
 *
 * - **Only attendees review, once.** A review is accepted only when an
 *   `ATTENDED` {@link import('@fit/db').Booking} exists for the same member +
 *   occurrence (`403 NOT_ATTENDED` otherwise), and the unique
 *   `(memberId, classInstanceId)` makes a second submission a `409
 *   ALREADY_REVIEWED` — enforced both by a pre-check and the DB constraint (a
 *   concurrent double-submit that races the pre-check is caught on the
 *   unique-violation and mapped to the same `409`).
 * - **The trainer aggregate stays live.** Posting a review or flipping its
 *   visibility recomputes the trainer's denormalised `rating` / `reviewCount`
 *   over `VISIBLE` reviews *in the same transaction*, so hiding an abusive review
 *   lowers the public average atomically with the moderation.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Post the calling member's review of a class occurrence they attended (T5.12).
   * Resolves the caller's own gym membership (a non-member is a `403`), then, in a
   * single transaction: loads the occurrence (`404 CLASS_INSTANCE_NOT_FOUND` if
   * unknown / cross-tenant), asserts the member holds an `ATTENDED` booking for it
   * (`403 NOT_ATTENDED`), rejects a duplicate (`409 ALREADY_REVIEWED`), inserts the
   * review with the trainer denormalised from the occurrence's template, and
   * recomputes that trainer's aggregate rating. Returns the new review's id.
   */
  async create(data: CreateReviewData): Promise<CreateReviewResponse> {
    const memberId = await this.requireCallerMembership();

    return this.prisma.client.$transaction(async (tx) => {
      const instance = await tx.classInstance.findFirst({
        where: { id: data.classInstanceId },
        select: { id: true, trainerId: true, template: { select: { trainerId: true } } },
      });
      if (!instance) {
        throw new NotFoundException({
          message: 'Class occurrence not found',
          code: 'CLASS_INSTANCE_NOT_FOUND',
        });
      }

      const attended = await tx.booking.findFirst({
        where: {
          classInstanceId: data.classInstanceId,
          memberId,
          status: BookingStatus.ATTENDED,
        },
        select: { id: true },
      });
      if (!attended) {
        throw new ForbiddenException({
          message: 'You can only review a class you attended',
          code: 'NOT_ATTENDED',
        });
      }

      const existing = await tx.review.findFirst({
        where: { memberId, classInstanceId: data.classInstanceId },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          message: 'You have already reviewed this class',
          code: 'ALREADY_REVIEWED',
        });
      }

      // The trainer comes from the template for a generated occurrence, or the
      // instance's own assignment for one scheduled from a type.
      const trainerId = instance.template?.trainerId ?? instance.trainerId ?? null;
      let review: { id: string };
      try {
        review = await tx.review.create({
          data: {
            // Stamped by the tenant extension at runtime; passed explicitly as
            // belt-and-braces and to satisfy the create input's static type.
            gymId: this.tenant.gymId,
            memberId,
            trainerId,
            classInstanceId: data.classInstanceId,
            rating: data.rating,
            comment: data.comment ?? null,
          },
          select: { id: true },
        });
      } catch (error) {
        // A concurrent double-submit that slipped past the pre-check trips the
        // unique (memberId, classInstanceId) index — same outcome as the pre-check.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException({
            message: 'You have already reviewed this class',
            code: 'ALREADY_REVIEWED',
          });
        }
        throw error;
      }

      if (trainerId) {
        await this.recomputeTrainerRating(tx, trainerId);
      }

      return { id: review.id };
    });
  }

  /**
   * One filtered, server-paginated page of a trainer's reviews for the staff
   * moderation queue (T5.12). Unlike the public listing this returns *every*
   * review (visible and hidden) unless narrowed by `status`, so a manager can
   * find and act on abusive ones. The trainer id must resolve to a trainer in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404
   * TRAINER_NOT_FOUND`). Newest first; an empty page is a normal result.
   */
  async listForModeration(
    trainerId: string,
    query: ListAdminTrainerReviewsQuery,
  ): Promise<ListAdminTrainerReviewsResponse> {
    await this.requireTrainer(trainerId);

    const where: Prisma.ReviewWhereInput = {
      trainerId,
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.review.findMany({
        where,
        select: ADMIN_REVIEW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.review.count({ where }),
    ]);

    return {
      data: rows.map((row) => toAdminReview(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Soft-hide an abusive review (T5.12) — flip its `status` to `HIDDEN`, dropping
   * it from the public listing and the trainer's aggregate, never touching the
   * content. Recomputes the trainer's rating and writes an audit-log row in the
   * same transaction so the moderation always leaves a trail. Idempotent;
   * `404 REVIEW_NOT_FOUND` for an unknown / cross-tenant id.
   */
  async hide(reviewId: string): Promise<AdminReview> {
    return this.setVisibility(reviewId, ReviewStatus.HIDDEN, AUDIT_REVIEW_HIDE);
  }

  /**
   * Restore a previously hidden review to `VISIBLE` (T5.12) — the inverse of
   * {@link hide}, re-counting it toward the trainer's aggregate and audit-logging
   * the action. Idempotent and `404`-on-miss like its counterpart.
   */
  async unhide(reviewId: string): Promise<AdminReview> {
    return this.setVisibility(reviewId, ReviewStatus.VISIBLE, AUDIT_REVIEW_UNHIDE);
  }

  /**
   * Flip a review's moderation `status`, recompute the affected trainer's
   * aggregate, and audit-log the action — all in one transaction. Shared by
   * {@link hide} / {@link unhide}. Returns the moderated review's staff projection.
   */
  private async setVisibility(
    reviewId: string,
    status: ReviewStatus,
    action: string,
  ): Promise<AdminReview> {
    const actorId = this.tenant.userId;
    if (!actorId) {
      // The route is behind RequirePermissions(ReviewModerate), so an authenticated
      // staff session is guaranteed; a missing actor is a coding error, not a 4xx.
      throw new InternalServerErrorException('No actor in scope for this moderation');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const review = await tx.review.findFirst({
        where: { id: reviewId },
        select: { id: true, trainerId: true, status: true, rating: true },
      });
      if (!review) {
        throw new NotFoundException({ message: 'Review not found', code: 'REVIEW_NOT_FOUND' });
      }

      if (review.status !== status) {
        await tx.review.update({ where: { id: reviewId }, data: { status } });
        if (review.trainerId) {
          await this.recomputeTrainerRating(tx, review.trainerId);
        }
        await tx.auditLog.create({
          data: {
            action,
            actorId,
            targetId: reviewId,
            metadata: {
              previousStatus: review.status,
              status,
              trainerId: review.trainerId,
              rating: review.rating,
            },
          },
        });
      }

      const updated = await tx.review.findFirstOrThrow({
        where: { id: reviewId },
        select: ADMIN_REVIEW_SELECT,
      });
      return toAdminReview(updated);
    });
  }

  /**
   * Recompute and persist a trainer's denormalised aggregate over its `VISIBLE`
   * reviews: `rating` is the mean star rating (rounded to one decimal, `0` when
   * there are none) and `reviewCount` their number. Runs on the transaction
   * client so the aggregate is consistent with the review write that triggered it.
   *
   * The pair is a **projection**, not a claim: it is rewritten wholesale from the
   * aggregate rather than nudged by a delta, because `rating` is a mean and the two
   * columns must come out of one and the same read or they contradict each other.
   * That only holds if this transaction is the sole writer of the pair between the
   * aggregate and the write, and under Postgres' READ COMMITTED it is *not* by
   * default: two members reviewing the same trainer at the same instant each take an
   * aggregate that cannot see the other's uncommitted row, both compute `N + 1`, and
   * the second write lands `N + 1` when the truth is `N + 2` — a drift that survives
   * until some later review happens to recompute it.
   *
   * So the row is locked first. Locking makes a concurrent recompute of the *same*
   * trainer block here rather than at its own `UPDATE`, so it takes its aggregate
   * only after we commit and therefore counts our review. Raw SQL because Prisma has
   * no lock primitive; it bypasses the tenant extension, which is why the lock pins
   * the primary key — and `trainerId` is never a value off the wire, it is read off a
   * tenant-scoped occurrence or review by both callers.
   *
   * `FOR NO KEY UPDATE`, not `FOR UPDATE`, and the distinction is load-bearing: the
   * review row this transaction has just inserted references the trainer, so Postgres
   * is already holding a `FOR KEY SHARE` on it for the foreign key. `FOR UPDATE`
   * conflicts with that, so two reviewers would each wait on the other's key-share and
   * one would die with a deadlock (`40P01`). `FOR NO KEY UPDATE` conflicts only with
   * the other writers — which is exactly the exclusion this needs — and it is the same
   * mode the `UPDATE` below would take anyway.
   */
  private async recomputeTrainerRating(
    tx: ScopedTransactionClient,
    trainerId: string,
  ): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "trainers" WHERE id = ${trainerId} FOR NO KEY UPDATE`;
    const agg = await tx.review.aggregate({
      where: { trainerId, status: ReviewStatus.VISIBLE },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const count = agg._count._all;
    const avg = agg._avg.rating ?? 0;
    await tx.trainer.update({
      where: { id: trainerId },
      data: {
        rating: Math.round(avg * 10) / 10,
        // atomic-counter-exempt: a projection of the review rows, not a counter
        // claimed against a prior read — the aggregate above IS the source of truth
        // and this column only caches it, so `{ increment }` would be the wrong
        // arithmetic (it could not repair a count that had already drifted, and
        // `rating` has no delta at all). The write is safe because the row lock
        // above makes this transaction the only writer of the pair between the
        // aggregate and here; remove that lock and two concurrent reviews both
        // store `N + 1`.
        reviewCount: count,
      },
    });
  }

  /**
   * Resolve the calling user's membership in the current gym — the `memberId` a
   * review is posted under. `@RequirePermissions(ReviewWrite)` guarantees an
   * authenticated caller; that user must also be a member of this gym, so a
   * non-member is a `403`. Mirrors {@link BookingsService.requireCallerMembership}.
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to post a review',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'You are not a member of this gym',
        code: 'NOT_A_MEMBER',
      });
    }
    return member.id;
  }

  /**
   * Resolve a trainer in the caller's gym or throw `404 TRAINER_NOT_FOUND`. The
   * scoped `where` constrains `gymId`, so a cross-tenant id never matches — the
   * guard for the moderation listing. Mirrors {@link AdminTrainersService.requireTrainer}.
   */
  private async requireTrainer(id: string): Promise<void> {
    const trainer = await this.prisma.client.trainer.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!trainer) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
  }
}

/** Project a queried review row + its joined identity / occurrence to the staff
 * {@link AdminReview}. The reviewer's name falls back to the email's local part
 * (a member with no display name is still identifiable); the class title is
 * `null` when the occurrence has since been deleted (the FK is `SetNull`). */
function toAdminReview(row: AdminReviewRecord): AdminReview {
  const email = row.member.user.email;
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment,
    status: row.status,
    authorName: row.member.user.name ?? email.split('@')[0] ?? email,
    authorEmail: email,
    classInstanceId: row.classInstanceId,
    classTitle: row.classInstance?.template?.title ?? row.classInstance?.classType?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
