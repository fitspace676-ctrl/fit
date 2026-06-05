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
 * One trainer as the roster table renders it. `photoUrl` is `null` when the
 * trainer has no headshot (the table renders an initials avatar). `specialties`
 * is the denormalised tag list shown as chips. `createdAt` is an ISO-8601 instant
 * the table formats in the staff member's local zone.
 */
export interface AdminTrainerRow {
  id: string;
  name: string;
  headline: string;
  photoUrl: string | null;
  specialties: string[];
  status: TrainerStatus;
  createdAt: string;
}

/**
 * Successful `GET /admin/trainers` response — one page of the roster plus the
 * totals the pager needs. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the table renders as its
 * empty state.
 */
export interface ListAdminTrainersResponse {
  data: AdminTrainerRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One trainer as the detail / edit page needs it — the roster row plus the full
 * `bio` and the `updatedAt` instant. A missing / cross-tenant id is a `404`, not
 * an empty body, so the page distinguishes "no such trainer" from a valid record.
 */
export interface AdminTrainerDetail extends AdminTrainerRow {
  bio: string;
  updatedAt: string;
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
