// @fit/types — trainer admin contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's trainer management
// (T4.4): the paginated `GET /admin/trainers` roster the admin table renders, the
// `GET /admin/trainers/:id` detail view, and the create / edit / deactivate
// writes. The API validates inbound queries/bodies with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the table / form and the
// controller can never drift on the wire format.
//
// Distinct from the *public* trainer-discovery contracts in `trainers.ts` (T3.6):
// those are the denormalised card an unauthenticated visitor browses; these are
// the editable management record a gym curates. Both project the same underlying
// `Trainer` model — the admin write is the source the public read surfaces.

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * A trainer's lifecycle within the gym, mirroring the Prisma `TrainerStatus`
 * enum. `ACTIVE` is a current trainer (and the only state the public roster
 * surfaces); `INACTIVE` is soft-deactivated — hidden but retained (T4.4). The
 * roster filter and the status badge both key off this.
 */
export const trainerStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A trainer's lifecycle state — {@link trainerStatusSchema}. */
export type TrainerStatus = z.infer<typeof trainerStatusSchema>;

/** Sortable columns for the trainer roster. Mirrors the `orderBy` keys the service maps. */
export const trainerSortSchema = z.enum(['name', 'status', 'createdAt']);

/** A column the trainer roster may be sorted by — {@link trainerSortSchema}. */
export type TrainerSort = z.infer<typeof trainerSortSchema>;

/**
 * Query for `GET /admin/trainers`. Pagination is mandatory server-side (`page` is
 * 1-based, `limit` capped at 100); `search` matches the trainer name/headline,
 * `status` narrows the list, and `sort` + `dir` drive ordering. Every field is
 * optional with a sensible default so a bare `GET /admin/trainers` is valid.
 * Numbers are coerced because they arrive as query strings.
 */
export const listAdminTrainersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: trainerStatusSchema.optional(),
  sort: trainerSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/trainers` query — {@link listAdminTrainersQuerySchema}. */
export type ListAdminTrainersQuery = z.infer<typeof listAdminTrainersQuerySchema>;

/**
 * The soonest upcoming class a trainer is scheduled to lead — the "next class"
 * footer each roster card shows (e.g. "Today 18:00 · Power Spin"). `null` when the
 * trainer has no future `SCHEDULED` occurrence. `startsAt` is an ISO-8601 instant
 * the card formats in the staff member's local zone; `title` is the class
 * template's title.
 */
export interface TrainerNextClass {
  startsAt: string;
  title: string;
}

/**
 * One trainer as the roster card renders it. `photoUrl` is `null` when the
 * trainer has no headshot (the card renders an initials avatar). `specialties`
 * is the denormalised tag list shown as chips. `createdAt` is an ISO-8601 instant
 * the card formats in the staff member's local zone.
 *
 * The card's live figures are backed by real tenant-scoped queries: `rating` /
 * `reviewCount` are the trainer's denormalised aggregate over `VISIBLE` reviews
 * (T5.12); `classesThisWeek` counts the trainer's `ClassInstance`s in the current
 * calendar week (Mon–Sun); `nextClass` is the soonest upcoming occurrence they
 * lead. No metric is fabricated — a trainer with no reviews reads `0` / `0`.
 */
export interface AdminTrainerRow {
  id: string;
  name: string;
  headline: string;
  photoUrl: string | null;
  specialties: string[];
  status: TrainerStatus;
  createdAt: string;
  /** Average star rating over the trainer's `VISIBLE` reviews (`0` when none). */
  rating: number;
  /** Number of the trainer's `VISIBLE` reviews (`0` when none). */
  reviewCount: number;
  /** Count of this trainer's `ClassInstance`s in the current calendar week. */
  classesThisWeek: number;
  /** The soonest upcoming class the trainer leads, or `null` when none is scheduled. */
  nextClass: TrainerNextClass | null;
  /**
   * The gym-staff record this coach *is* — the id the Staff screen lists them
   * under. Every coach has one: creating a trainer creates the (login-less) staff
   * record alongside it, so the two screens can never disagree about who works
   * here. `null` only for a profile whose staff record was removed, which the API
   * also deactivates.
   */
  staffId: string | null;
}

/**
 * The gym-wide roster KPIs the list page's four cards render, aggregated across
 * the *whole filtered roster* (not just the visible page). Every figure is real:
 * `total` / `active` are counts; `classesPerWeek` sums each trainer's current-week
 * `ClassInstance`s; `avgRating` is the mean of the reviewed trainers' ratings
 * (`0` when none have reviews). `PT clients` has no data source in the schema and
 * is deliberately omitted rather than fabricated.
 */
export interface AdminTrainerSummary {
  total: number;
  active: number;
  classesPerWeek: number;
  avgRating: number;
}

/**
 * Successful `GET /admin/trainers` response — one page of the roster plus the
 * totals the pager needs and the gym-wide `summary` KPIs. `total` is the count
 * *after* filters, `page` / `limit` echo the request. An empty `data` is a normal
 * result the grid renders as its empty state.
 */
export interface ListAdminTrainersResponse {
  data: AdminTrainerRow[];
  total: number;
  page: number;
  limit: number;
  summary: AdminTrainerSummary;
}

/**
 * The trainer's own "This week" figures the detail Overview side card renders,
 * each backed by a real tenant-scoped query over the current calendar week
 * (Mon–Sun): `classesLed` counts the trainer's `ClassInstance`s this week,
 * `newReviews` the `VISIBLE` reviews posted this week, and `membersTrained` the
 * distinct members who *attended* one of the trainer's classes this week.
 */
export interface TrainerThisWeek {
  classesLed: number;
  newReviews: number;
  membersTrained: number;
}

/**
 * One trainer as the detail page needs it — the roster row plus the full `bio`,
 * the `updatedAt` instant, and the detail-only KPIs. A missing / cross-tenant id
 * is a `404`, not an empty body, so the page distinguishes "no such trainer" from
 * a valid record.
 *
 * `hiredAt` is the trainer's `createdAt` (the schema has no separate hire date);
 * `showUpRate` is `ATTENDED / (ATTENDED + NO_SHOW)` across the trainer's classes
 * over the last 90 days, or `null` when there were no attended-or-missed bookings
 * to measure (rather than a misleading `0`). `PT clients` is omitted — no source.
 */
export interface AdminTrainerDetail extends AdminTrainerRow {
  bio: string;
  updatedAt: string;
  /** The trainer's hire date — the schema's `createdAt` (ISO-8601). */
  hiredAt: string;
  /** Attendance rate over the last 90 days, or `null` when nothing to measure. */
  showUpRate: number | null;
  /** The trainer's own current-week activity counts. */
  thisWeek: TrainerThisWeek;
}

/** Successful `GET /admin/trainers/:id` response — the trainer detail spread flat. */
export type GetAdminTrainerResponse = AdminTrainerDetail;

/**
 * The editable trainer fields shared by the create + update bodies. `name` is
 * required; `headline` / `bio` are free text with generous bounds (empty is
 * allowed and normalised to `''`). `photoUrl` is the R2 public URL of the
 * uploaded headshot — a valid URL or `null`; an empty string is treated as "no
 * photo" (`null`). `specialties` is a de-duplicated, trimmed tag list (each
 * 1–60 chars), capped so the roster chips stay sane.
 */
const trainerProfileFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  headline: z.string().trim().max(160).default(''),
  bio: z.string().trim().max(2000).default(''),
  photoUrl: z
    .union([
      z.string().trim().max(2048).url('Photo URL must be a valid URL'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  specialties: z
    .array(z.string().trim().min(1).max(60))
    .max(20, 'A trainer can have at most 20 specialties')
    .default([])
    .transform((tags) => Array.from(new Set(tags.filter((tag) => tag.length > 0)))),
};

/**
 * Body for `POST /admin/trainers` — create a trainer (T4.4). The profile fields
 * plus an initial `status` that defaults to `ACTIVE` (a staff-added trainer is
 * live on the roster unless explicitly created inactive). The API re-validates
 * with this exact schema, so the admin form and the controller can never drift.
 */
export const createTrainerSchema = z.object({
  ...trainerProfileFields,
  status: trainerStatusSchema.default('ACTIVE'),
});

/** Validated `POST /admin/trainers` body — {@link createTrainerSchema}. */
export type CreateTrainerInput = z.input<typeof createTrainerSchema>;

/** Parsed `POST /admin/trainers` body (after defaults/transforms applied). */
export type CreateTrainerData = z.infer<typeof createTrainerSchema>;

/**
 * Body for `PATCH /admin/trainers/:id` — edit a trainer's profile (T4.4). The
 * same mutable profile fields as create; `status` is changed through the
 * dedicated deactivate / reactivate actions, not here.
 */
export const updateTrainerSchema = z.object(trainerProfileFields);

/** Validated `PATCH /admin/trainers/:id` body — {@link updateTrainerSchema}. */
export type UpdateTrainerInput = z.input<typeof updateTrainerSchema>;

/** Parsed `PATCH /admin/trainers/:id` body (after defaults/transforms applied). */
export type UpdateTrainerData = z.infer<typeof updateTrainerSchema>;

/**
 * Successful `POST /admin/trainers` response (`201 Created`) — the newly created
 * trainer as the detail page renders it.
 */
export type CreateTrainerResponse = AdminTrainerDetail;

/** Successful `PATCH /admin/trainers/:id` response — the updated trainer detail. */
export type UpdateTrainerResponse = AdminTrainerDetail;

/**
 * Successful `POST /admin/trainers/:id/deactivate` and `.../reactivate` response —
 * the trainer detail with the new `status` (`INACTIVE` / `ACTIVE`).
 */
export type SetTrainerStatusResponse = AdminTrainerDetail;

/**
 * One personal-training client of a trainer, as the detail page's Clients tab
 * lists them.
 *
 * The relationship is `ServiceSession`: staff open a slot of a service on the PT
 * calendar (`staffId` is the coach's `GymMember`), a member books it (`memberId`
 * is set and an invoice is raised), and the slot runs to `COMPLETED`. A client is
 * therefore a member with at least one `BOOKED` or `COMPLETED` session with this
 * coach - `OPEN` slots have no member and `CANCELLED` ones did not happen.
 *
 * Counts are all-time; the two instants bracket the relationship (`lastSessionAt`
 * is the most recent session that has already started, `nextSessionAt` the
 * soonest still ahead), so a front desk can see at a glance who is active and who
 * has drifted. Both are `null` when there is nothing on that side of now.
 */
export interface TrainerClientRow {
  memberId: string;
  name: string;
  /** `BOOKED` + `COMPLETED` sessions with this coach, all time. */
  sessionCount: number;
  /** Of those, the ones that ran. */
  completedCount: number;
  /** Of those, the ones still ahead. */
  upcomingCount: number;
  /** The most recent session that has already started, ISO-8601, or `null`. */
  lastSessionAt: string | null;
  /** The soonest session still ahead, ISO-8601, or `null`. */
  nextSessionAt: string | null;
}

/**
 * Successful `GET /admin/trainers/:id/clients` response. `clients` is ordered
 * with the live relationships first - anyone with an upcoming session, soonest
 * first - then everyone else by their most recent session, so the list reads as
 * "who this coach is working with" rather than as an archive. `totalSessions`
 * sums `sessionCount` across the rows.
 *
 * An empty list is a normal `200`: a coach with no PT bookings, or one whose
 * staff record was removed (`Trainer.staffId` is `null`, so no session can point
 * at them).
 */
export interface ListTrainerClientsResponse {
  clients: TrainerClientRow[];
  totalSessions: number;
}
