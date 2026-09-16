// @fit/types — admin Class-Type contracts (Zod schemas + inferred types).
//
// A ClassType is a gym's reusable catalogue entry for a *kind* of class (Boxing,
// Yoga Flow) with no schedule of its own. Staff curate types on the Class Types
// tab; the schedule then places single occurrences of a type at a chosen time.
// These mirror the class-template pricing/validation shapes so the two forms feel
// the same, minus everything schedule-related (rrule / validFrom / trainer).

import { z } from 'zod';
import { sortDirSchema } from './members';
import { classPricingRuleSchema, type ClassPricingRule } from './classes-admin';
import {
  branchAvailabilityQuerySchema,
  branchExclusivityPatchSchema,
  branchExclusivitySchema,
} from './locations-admin';

/** Lifecycle of a class type — `ACTIVE` types are offered when scheduling. */
export const classTypeStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A class type's lifecycle state — {@link classTypeStatusSchema}. */
export type ClassTypeStatus = z.infer<typeof classTypeStatusSchema>;

/** A minor-unit money field (or null), coercing blank strings to null. */
const nullableMinorField = z.preprocess(
  (value) => (value === '' || value === null || value === undefined ? null : value),
  z.coerce.number().int().min(0).max(1_000_000_00).nullable(),
);

/**
 * The editable class-type fields shared by the create + update bodies. `name` is
 * required; `description` is free text. `capacity` and `durationMinutes` are
 * positive integers; `minAttendance` is optional. `color` is a hex calendar
 * colour. Pricing mirrors the class-template rules. Numbers are coerced because
 * the admin form submits them as strings.
 */
const classTypeProfileFields = {
  name: z.string().trim().min(1, 'Name is required').max(160),
  description: z.string().trim().max(2000).default(''),
  durationMinutes: z.coerce
    .number()
    .int('Duration must be a whole number of minutes')
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot exceed 24 hours'),
  capacity: z.coerce
    .number()
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(100000),
  minAttendance: z
    .preprocess(
      (value) => (value === '' || value === null || value === undefined ? null : value),
      z.coerce.number().int().min(0).max(100_000).nullable(),
    )
    .default(null),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #2563eb')
    .default('#2563eb'),
  pricingRule: classPricingRuleSchema.default('FREE'),
  priceMinor: nullableMinorField.default(null),
  includedPlanIds: z.array(z.string().trim().min(1)).max(100).default([]),
};

/**
 * Shared pricing guard: a `PAID` type needs a per-session `priceMinor`, and an
 * `INCLUDED` type needs at least one plan in `includedPlanIds`. `FREE` clears both.
 */
function refinePricing(
  value: { pricingRule?: ClassPricingRule; priceMinor?: number | null; includedPlanIds?: string[] },
  ctx: z.RefinementCtx,
): void {
  if (
    value.pricingRule === 'PAID' &&
    (value.priceMinor === null || value.priceMinor === undefined || value.priceMinor <= 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A paid class needs a price above zero',
      path: ['priceMinor'],
    });
  }
  if (value.pricingRule === 'INCLUDED' && (value.includedPlanIds?.length ?? 0) === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pick at least one plan this class is included in',
      path: ['includedPlanIds'],
    });
  }
}

/** `POST /admin/class-types` body — the profile fields plus the initial status. */
export const createClassTypeSchema = z
  .object({
    ...classTypeProfileFields,
    status: classTypeStatusSchema.default('ACTIVE'),
    /**
     * The branch this type is exclusive to, or **`null` for "runs at every
     * branch"** — see {@link branchExclusivitySchema}. Declared here rather than
     * in `classTypeProfileFields` because the PATCH body is `.partial()` and
     * needs the no-default variant, so the two spellings are kept apart.
     */
    locationId: branchExclusivitySchema,
  })
  .superRefine(refinePricing);

/** Raw (pre-parse) create input — the form's string-ish values. */
export type CreateClassTypeInput = z.input<typeof createClassTypeSchema>;

/** Validated create payload the service persists. */
export type CreateClassTypeData = z.infer<typeof createClassTypeSchema>;

/** `PATCH /admin/class-types/:id` body — every field optional (partial update). */
export const updateClassTypeSchema = z
  .object({
    ...classTypeProfileFields,
    status: classTypeStatusSchema,
    /**
     * Omit to leave the type's scope untouched; send `null` to widen it back to
     * every branch — see {@link branchExclusivityPatchSchema}.
     */
    locationId: branchExclusivityPatchSchema,
  })
  .partial()
  .superRefine(refinePricing);

/** Raw (pre-parse) update input. */
export type UpdateClassTypeInput = z.input<typeof updateClassTypeSchema>;

/** Validated update payload the service persists. */
export type UpdateClassTypeData = z.infer<typeof updateClassTypeSchema>;

/** A column the class-type roster may be sorted by. */
export const classTypeSortSchema = z.enum(['name', 'capacity', 'status', 'createdAt']);

/** A sortable class-type column — {@link classTypeSortSchema}. */
export type ClassTypeSort = z.infer<typeof classTypeSortSchema>;

/**
 * Query for `GET /admin/class-types`. Pagination is mandatory (1-based `page`,
 * `limit` capped at 100); `search` matches name, `status` narrows, and
 * `sort` + `dir` order. Numbers are coerced (they arrive as query strings).
 *
 * **`locationId` is back, and it is a different filter from the one Stage 1
 * removed.** This endpoint carried no branch param through Stages 1–6, and that
 * was a recorded exemption rather than an oversight: the only path to a branch
 * was `instances: { some: { locationId } }`, which answers "which types have
 * *occurred* at this branch" — hiding a freshly created type from everywhere
 * until it was first scheduled, and pinning a type to a branch forever on one
 * occurrence years ago.
 *
 * Stage 7 gave `ClassType` a stored `locationId` meaning **branch-exclusive**,
 * with **`null` meaning "offered at every branch"**, and this param reads it
 * through the availability predicate: the branch's exclusives PLUS everything
 * gym-wide. Neither old failure mode survives — a new type is `null` and shows
 * everywhere, and scheduling one somewhere changes nothing about where it is
 * offered. See {@link branchAvailabilityQuerySchema}.
 */
export const listAdminClassTypesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: classTypeStatusSchema.optional(),
  locationId: branchAvailabilityQuerySchema,
  sort: classTypeSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/class-types` query. */
export type ListAdminClassTypesQuery = z.infer<typeof listAdminClassTypesQuerySchema>;

/** One class type as the roster table renders it. `createdAt` is an ISO instant. */
export interface AdminClassTypeRow {
  id: string;
  name: string;
  durationMinutes: number;
  capacity: number;
  minAttendance: number | null;
  color: string;
  status: ClassTypeStatus;
  pricingRule: ClassPricingRule;
  priceMinor: number | null;
  includedPlanIds: string[];
  /**
   * The branch this type is exclusive to, or **`null` for "runs at every
   * branch"** — the state of very nearly every row. Not "which branch has
   * scheduled it": an occurrence's branch lives on `ClassInstance.locationId`
   * and is a different question.
   */
  locationName: string | null;
  createdAt: string;
}

/** One class type as the detail / edit form needs it — the row plus description. */
export interface AdminClassTypeDetail extends AdminClassTypeRow {
  description: string;
  /**
   * The raw branch id the edit form binds its select to — `null` meaning
   * **"offered at every branch"**, the select's default option rather than a
   * value waiting to be filled in.
   */
  locationId: string | null;
  updatedAt: string;
}

/** Successful `GET /admin/class-types/:id` response. */
export type GetAdminClassTypeResponse = AdminClassTypeDetail;

/**
 * Successful `GET /admin/class-types` response — one page of the roster plus the
 * totals the pager needs. `total` is the count after filters.
 */
export interface ListAdminClassTypesResponse {
  data: AdminClassTypeRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * A slim active-type option the schedule's "Add Class" type-picker offers.
 * `durationMinutes` / `capacity` / `color` let the picker preview the occurrence
 * it would create without a second fetch.
 */
export interface AdminClassTypeOption {
  id: string;
  name: string;
  durationMinutes: number;
  capacity: number;
  color: string;
  /**
   * How the type is charged. A class template copies these at save rather than
   * asking again: pricing is decided once, on the type, and the template form
   * only picks which type it is. There is no stored link between the two, so the
   * copy is a snapshot — editing a type does not retro-price existing templates.
   */
  pricingRule: ClassPricingRule;
  priceMinor: number | null;
  includedPlanIds: string[];
  minAttendance: number | null;
}
