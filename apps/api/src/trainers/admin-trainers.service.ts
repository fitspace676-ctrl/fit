import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingStatus,
  GymMemberStatus,
  InstanceStatus,
  Prisma,
  ReviewStatus,
  Role,
  TrainerStatus,
} from '@fit/db';
import {
  weeklyAvailabilitySchema,
  type AdminTrainerDetail,
  type AdminTrainerRow,
  type AdminTrainerSummary,
  type CreateTrainerData,
  type CreateTrainerResponse,
  type GetAdminTrainerResponse,
  type GetTrainerAvailabilityResponse,
  type ListAdminTrainersQuery,
  type ListAdminTrainersResponse,
  type SetTrainerAvailabilityData,
  type SetTrainerAvailabilityResponse,
  type SetTrainerStatusResponse,
  type TrainerNextClass,
  type TrainerThisWeek,
  type UpdateTrainerData,
  type UpdateTrainerResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { placeholderEmail, splitDisplayName } from '../common/directory-identity';
import { MediaCleanupService } from '../storage/media-cleanup.service';

/** Milliseconds in a day — the window arithmetic for the show-up rate. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The columns the roster/detail queries select off `Trainer`. Every field is the
 * gym's own content (no cross-tenant join), so the whole row is safe to project.
 * `rating` / `reviewCount` are the denormalised aggregate the reviews service
 * keeps live (T5.12), so the card renders the real rating without a COUNT/AVG join.
 */
const TRAINER_SELECT = {
  id: true,
  name: true,
  headline: true,
  bio: true,
  photoUrl: true,
  specialties: true,
  status: true,
  rating: true,
  reviewCount: true,
  createdAt: true,
  updatedAt: true,
  staffId: true,
} satisfies Prisma.TrainerSelect;

type TrainerRecord = Prisma.TrainerGetPayload<{ select: typeof TRAINER_SELECT }>;

/**
 * The [start, end) instants of the current calendar week (Monday 00:00 local →
 * the following Monday 00:00). "Classes / week" and the "This week" counts both
 * measure this window, so a gym operator reads them as literally "this week".
 */
function currentWeekRange(now = new Date()): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 0 = Sunday … 6 = Saturday. Rewind to the most recent Monday.
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  return { start, end };
}

/**
 * Staff-console trainer management for a gym (read + write, T4.4).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `trainer`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym by
 * the Prisma tenant extension, so staff can only ever read or mutate their own
 * gym's trainers — there is no `gymId` to pass or to forget. The roster is
 * paginated server-side so it scales without loading every trainer into memory.
 *
 * The managed record here is the source the *public* trainers index (`GET
 * /trainers`, T3.6) ultimately surfaces; this service owns the editable shape,
 * including the R2-hosted `photoUrl` the admin form uploads.
 */
@Injectable()
export class AdminTrainersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly media: MediaCleanupService,
  ) {}

  /**
   * One page of the gym's trainers, filtered + sorted server-side. `total` is the
   * filtered count (so the pager is accurate) and the page is bounded by
   * `skip`/`take`. An empty page is a normal result.
   */
  async listTrainers(query: ListAdminTrainersQuery): Promise<ListAdminTrainersResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;
    const week = currentWeekRange();

    const [rows, total, summary] = await Promise.all([
      this.prisma.client.trainer.findMany({
        where,
        select: TRAINER_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.trainer.count({ where }),
      this.buildSummary(where, week),
    ]);

    // Enrich only the visible page with the two per-trainer figures that need a
    // per-row query (this week's class count + the next class), keyed by id so the
    // two lookups run as two set-based queries rather than N per card.
    const ids = rows.map((row) => row.id);
    const [classesByTrainer, nextByTrainer] = await Promise.all([
      this.classesThisWeekByTrainer(ids, week),
      this.nextClassByTrainer(ids, week.start),
    ]);

    return {
      data: rows.map((row) =>
        this.toRow(row, classesByTrainer.get(row.id) ?? 0, nextByTrainer.get(row.id) ?? null),
      ),
      total,
      page: query.page,
      limit: query.limit,
      summary,
    };
  }

  /**
   * One trainer's detail for the detail / edit page. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 TRAINER_NOT_FOUND`.
   */
  async getTrainer(id: string): Promise<GetAdminTrainerResponse> {
    const row = await this.prisma.client.trainer.findFirst({
      where: { id },
      select: TRAINER_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }

    const week = currentWeekRange();
    // The detail page's live figures — each a real, tenant-scoped query over the
    // trainer's classes / reviews. Run in parallel; the row is already resolved.
    const [classesByTrainer, nextByTrainer, showUpRate, thisWeek] = await Promise.all([
      this.classesThisWeekByTrainer([id], week),
      this.nextClassByTrainer([id], week.start),
      this.showUpRate(id),
      this.thisWeekCounts(id, week),
    ]);

    return this.toDetail(
      row,
      classesByTrainer.get(id) ?? 0,
      nextByTrainer.get(id) ?? null,
      showUpRate,
      thisWeek,
    );
  }

  /**
   * Create a trainer (T4.4). The whole insert runs on the tenant-scoped client, so
   * `gymId` is stamped from the request's tenant context by the extension; it is
   * also passed explicitly here as belt-and-braces and to satisfy the create
   * input's static type.
   *
   * A coach is also a person the gym employs, so the same transaction adds them to
   * the **staff directory** with the `TRAINER` role (staff ⇄ trainer link) — a
   * login-less record, exactly what `POST /staff` creates when no email is given.
   * Without it the two screens would disagree about who works here: a coach added
   * for the schedule would be invisible on the Staff roster. Returns the new
   * trainer's detail (`201`).
   */
  async createTrainer(input: CreateTrainerData): Promise<CreateTrainerResponse> {
    const gymId = this.tenant.gymId;
    const { firstName, lastName } = splitDisplayName(input.name);

    const id = await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: placeholderEmail(), name: input.name },
        select: { id: true },
      });
      const staff = await tx.gymMember.create({
        data: {
          gymId,
          userId: user.id,
          role: Role.TRAINER,
          status: GymMemberStatus.ACTIVE,
          firstName,
          lastName,
        },
        select: { id: true },
      });
      const row = await tx.trainer.create({
        data: {
          gymId,
          name: input.name,
          headline: input.headline,
          bio: input.bio,
          photoUrl: input.photoUrl,
          specialties: input.specialties,
          status: input.status,
          staffId: staff.id,
        },
        select: { id: true },
      });
      return row.id;
    });

    // Return through the detail read so the response carries the same enriched
    // shape as `GET /admin/trainers/:id` (a fresh trainer's KPIs are all empty).
    return this.getTrainer(id);
  }

  /**
   * Edit a trainer's profile (T4.4). The id must resolve to a trainer in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through {@link deactivateTrainer} /
   * {@link reactivateTrainer}. Returns the updated detail.
   */
  async updateTrainer(id: string, input: UpdateTrainerData): Promise<UpdateTrainerResponse> {
    const existing = await this.requireTrainer(id);
    const { firstName, lastName } = splitDisplayName(input.name);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.trainer.update({
        where: { id },
        data: {
          name: input.name,
          headline: input.headline,
          bio: input.bio,
          photoUrl: input.photoUrl,
          specialties: input.specialties,
        },
      });
      // Renaming the coach renames the person, so the staff roster follows —
      // otherwise the same human would be listed under two different names.
      if (existing.staffId) {
        await tx.gymMember.update({
          where: { id: existing.staffId },
          data: { firstName, lastName },
        });
        const staff = await tx.gymMember.findFirst({
          where: { id: existing.staffId },
          select: { userId: true },
        });
        if (staff) {
          await tx.user.update({ where: { id: staff.userId }, data: { name: input.name } });
        }
      }
    });

    // A replaced portrait leaves its predecessor behind; free it once the edit is
    // committed. Best-effort by design — the nightly sweep is the backstop.
    await this.media.discardUnreferenced([existing.photoUrl], [input.photoUrl]);

    return this.getTrainer(id);
  }

  /**
   * Deactivate a trainer (T4.4) — set `status` to `INACTIVE` so they drop off the
   * public roster while the record is preserved. Idempotent; `404`-on-miss.
   */
  async deactivateTrainer(id: string): Promise<SetTrainerStatusResponse> {
    return this.setStatus(id, TrainerStatus.INACTIVE);
  }

  /**
   * Reactivate a trainer (T4.4) — the inverse of {@link deactivateTrainer}, setting
   * `status` back to `ACTIVE`. Idempotent and `404`-on-miss like its counterpart.
   */
  async reactivateTrainer(id: string): Promise<SetTrainerStatusResponse> {
    return this.setStatus(id, TrainerStatus.ACTIVE);
  }

  /**
   * One trainer's weekly availability (T5.11). The stored JSON is parsed through
   * {@link weeklyAvailabilitySchema} so callers always get a complete, canonical
   * seven-day map — a brand-new trainer (default `{}`) reads back as fully
   * unavailable. A missing / cross-tenant id is a `404 TRAINER_NOT_FOUND`.
   */
  async getAvailability(id: string): Promise<GetTrainerAvailabilityResponse> {
    const row = await this.prisma.client.trainer.findFirst({
      where: { id },
      select: { availability: true },
    });
    if (!row) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
    return { availability: weeklyAvailabilitySchema.parse(row.availability ?? {}) };
  }

  /**
   * Replace a trainer's weekly availability (T5.11). The whole week is persisted as
   * one canonical JSON document (the body was already validated + normalised by
   * {@link weeklyAvailabilitySchema}). The id must resolve to a trainer in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). Returns the
   * stored availability.
   */
  async setAvailability(
    id: string,
    input: SetTrainerAvailabilityData,
  ): Promise<SetTrainerAvailabilityResponse> {
    await this.requireTrainer(id);
    await this.prisma.client.trainer.update({
      where: { id },
      data: { availability: input.availability as unknown as Prisma.InputJsonValue },
    });
    return this.getAvailability(id);
  }

  /** Set a trainer's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(id: string, status: TrainerStatus): Promise<SetTrainerStatusResponse> {
    await this.requireTrainer(id);
    await this.prisma.client.trainer.update({ where: { id }, data: { status } });
    return this.getTrainer(id);
  }

  /**
   * Resolve a trainer in the caller's gym or throw `404 TRAINER_NOT_FOUND`. The
   * scoped `where` constrains `gymId`, so a cross-tenant id never matches — the
   * guard for every write.
   */
  private async requireTrainer(
    id: string,
  ): Promise<{ id: string; staffId: string | null; photoUrl: string | null }> {
    const trainer = await this.prisma.client.trainer.findFirst({
      where: { id },
      select: { id: true, staffId: true, photoUrl: true },
    });
    if (!trainer) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
    return trainer;
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the trainer's
   * name + headline.
   */
  private buildWhere(query: ListAdminTrainersQuery): Prisma.TrainerWhereInput {
    const where: Prisma.TrainerWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { headline: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Map the requested sort column to a Prisma `orderBy`. */
  private buildOrderBy(query: ListAdminTrainersQuery): Prisma.TrainerOrderByWithRelationInput {
    switch (query.sort) {
      case 'status':
        return { status: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'name':
      default:
        return { name: query.dir };
    }
  }

  /**
   * Project a queried row + its computed figures to the roster {@link AdminTrainerRow}.
   * `rating` / `reviewCount` are the denormalised aggregate; `classesThisWeek` and
   * `nextClass` are the per-trainer figures the caller resolved in set-based queries.
   */
  private toRow(
    row: TrainerRecord,
    classesThisWeek: number,
    nextClass: TrainerNextClass | null,
  ): AdminTrainerRow {
    return {
      id: row.id,
      name: row.name,
      headline: row.headline,
      photoUrl: row.photoUrl,
      specialties: row.specialties,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      rating: row.rating,
      reviewCount: row.reviewCount,
      classesThisWeek,
      nextClass,
      staffId: row.staffId,
    };
  }

  /** Project a queried row + its detail-only KPIs to the full {@link AdminTrainerDetail}. */
  private toDetail(
    row: TrainerRecord,
    classesThisWeek: number,
    nextClass: TrainerNextClass | null,
    showUpRate: number | null,
    thisWeek: TrainerThisWeek,
  ): AdminTrainerDetail {
    return {
      ...this.toRow(row, classesThisWeek, nextClass),
      bio: row.bio,
      updatedAt: row.updatedAt.toISOString(),
      // The schema has no dedicated hire date — the trainer's createdAt is when
      // they joined the roster, which is what "Hired <month year>" describes.
      hiredAt: row.createdAt.toISOString(),
      showUpRate,
      thisWeek,
    };
  }

  /**
   * The gym-wide roster KPIs for the list page's four cards, aggregated across the
   * whole filtered roster (the same `where`, no pagination): the total + active
   * counts, the sum of every matched trainer's current-week `ClassInstance`s, and
   * the mean rating over the trainers that have at least one review. Every figure
   * is real; `PT clients` has no source and is deliberately absent.
   */
  private async buildSummary(
    where: Prisma.TrainerWhereInput,
    week: { start: Date; end: Date },
  ): Promise<AdminTrainerSummary> {
    const [total, active, ratingAgg, allIds] = await Promise.all([
      this.prisma.client.trainer.count({ where }),
      this.prisma.client.trainer.count({ where: { ...where, status: TrainerStatus.ACTIVE } }),
      // Mean over trainers that actually have reviews, so an unreviewed roster
      // doesn't drag the average toward 0.
      this.prisma.client.trainer.aggregate({
        where: { ...where, reviewCount: { gt: 0 } },
        _avg: { rating: true },
      }),
      this.prisma.client.trainer.findMany({ where, select: { id: true } }),
    ]);

    const classesByTrainer = await this.classesThisWeekByTrainer(
      allIds.map((row) => row.id),
      week,
    );
    let classesPerWeek = 0;
    for (const count of classesByTrainer.values()) {
      classesPerWeek += count;
    }

    return {
      total,
      active,
      classesPerWeek,
      avgRating: Math.round((ratingAgg._avg.rating ?? 0) * 10) / 10,
    };
  }

  /**
   * The count of each trainer's `ClassInstance`s in the current calendar week,
   * keyed by trainer id. One `groupBy` over the occurrences whose template belongs
   * to one of `trainerIds` and whose `startsAt` falls in the week — a set-based
   * query, not one per card. Trainers with no classes this week are simply absent
   * from the map (the caller defaults them to `0`).
   */
  private async classesThisWeekByTrainer(
    trainerIds: string[],
    week: { start: Date; end: Date },
  ): Promise<Map<string, number>> {
    if (trainerIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.client.classInstance.findMany({
      where: {
        startsAt: { gte: week.start, lt: week.end },
        template: { trainerId: { in: trainerIds } },
      },
      select: { template: { select: { trainerId: true } } },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      // The query filters on `template.trainerId`, so only template-backed
      // occurrences reach here — `template` is always present.
      const trainerId = row.template?.trainerId;
      if (trainerId) {
        counts.set(trainerId, (counts.get(trainerId) ?? 0) + 1);
      }
    }
    return counts;
  }

  /**
   * The soonest upcoming (`SCHEDULED`, `startsAt >= from`) class each of
   * `trainerIds` leads, keyed by trainer id. Ordered soonest-first and reduced to
   * the first hit per trainer, so the map holds each trainer's *next* class only.
   * A trainer with nothing upcoming is absent (the caller defaults to `null`).
   */
  private async nextClassByTrainer(
    trainerIds: string[],
    from: Date,
  ): Promise<Map<string, TrainerNextClass>> {
    if (trainerIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.client.classInstance.findMany({
      where: {
        startsAt: { gte: from },
        status: InstanceStatus.SCHEDULED,
        template: { trainerId: { in: trainerIds } },
      },
      select: {
        startsAt: true,
        template: { select: { trainerId: true, title: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
    const next = new Map<string, TrainerNextClass>();
    for (const row of rows) {
      // Filtered on `template.trainerId`, so `template` is always present here.
      const trainerId = row.template?.trainerId;
      if (trainerId && !next.has(trainerId)) {
        next.set(trainerId, {
          startsAt: row.startsAt.toISOString(),
          title: row.template?.title ?? 'Class',
        });
      }
    }
    return next;
  }

  /**
   * The trainer's attendance rate over the last 90 days —
   * `ATTENDED / (ATTENDED + NO_SHOW)` across bookings on the trainer's classes,
   * rounded to a whole percentage. Returns `null` (not a misleading `0`) when no
   * booking in the window was attended or missed, so the UI can show "—".
   */
  private async showUpRate(trainerId: string): Promise<number | null> {
    const since = new Date(Date.now() - 90 * DAY_MS);
    const bookingWhere = (status: BookingStatus): Prisma.BookingWhereInput => ({
      status,
      classInstance: {
        startsAt: { gte: since },
        template: { trainerId },
      },
    });
    const [attended, noShow] = await Promise.all([
      this.prisma.client.booking.count({ where: bookingWhere(BookingStatus.ATTENDED) }),
      this.prisma.client.booking.count({ where: bookingWhere(BookingStatus.NO_SHOW) }),
    ]);
    const denom = attended + noShow;
    if (denom === 0) {
      return null;
    }
    return Math.round((attended / denom) * 100);
  }

  /**
   * The trainer's own current-week activity: classes led (their `ClassInstance`s
   * this week), new `VISIBLE` reviews posted this week, and the distinct members
   * who *attended* one of their classes this week. Each is a real, tenant-scoped
   * count over the same Mon–Sun window the "Classes / week" figure uses.
   */
  private async thisWeekCounts(
    trainerId: string,
    week: { start: Date; end: Date },
  ): Promise<TrainerThisWeek> {
    const [classesLed, newReviews, attendedMembers] = await Promise.all([
      this.prisma.client.classInstance.count({
        where: {
          startsAt: { gte: week.start, lt: week.end },
          template: { trainerId },
        },
      }),
      this.prisma.client.review.count({
        where: {
          trainerId,
          status: ReviewStatus.VISIBLE,
          createdAt: { gte: week.start, lt: week.end },
        },
      }),
      this.prisma.client.booking.findMany({
        where: {
          status: BookingStatus.ATTENDED,
          classInstance: {
            startsAt: { gte: week.start, lt: week.end },
            template: { trainerId },
          },
        },
        select: { memberId: true },
        distinct: ['memberId'],
      }),
    ]);
    return { classesLed, newReviews, membersTrained: attendedMembers.length };
  }
}
