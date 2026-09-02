// @fit/types — the Services catalogue wire contract (design:
// docs/superpowers/specs/2026-08-25-services-design.md, stage 1).
//
// A service is a staff-delivered, priced thing a gym sells at the desk: a
// personal-training hour bound to a trainer, or a custom one (a massage) named by
// staff. The admin form and `POST /admin/services` share these schemas, so the
// two can never drift.

import { z } from 'zod';
import { sortDirSchema } from './members';

export const serviceTypeSchema = z.enum(['PERSONAL_TRAINING', 'CUSTOM']);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

/**
 * The optional cover image, as a public URL. `''` and absent both normalise to
 * null so "no cover" has exactly one representation on the wire.
 */
const coverUrlSchema = z
  .preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().url('The cover image must be a URL').max(2048).nullable(),
  )
  .default(null);

/**
 * The gym's category a service is filed under, as an id. `''` and absent both
 * normalise to null so "no category" has exactly one representation.
 */
const categoryIdSchema = z
  .preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().min(1).nullable(),
  )
  .default(null);

/** The fields every service carries, whatever its type. */
const serviceProfileFields = {
  staffId: z.string().trim().min(1, 'Pick a staff member'),
  priceMinor: z.number().int().nonnegative(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  description: z.string().trim().max(2000).default(''),
  coverUrl: coverUrlSchema,
  categoryId: categoryIdSchema,
};

// ── Categories ───────────────────────────────────────────────────────────────

/** A category's name: short, and unique within the gym (the API says so with 409). */
export const serviceCategoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Give the category a name')
  .max(60);

/** Body for `POST /admin/services/categories`. */
export const createServiceCategorySchema = z.object({ name: serviceCategoryNameSchema });
export type CreateServiceCategoryInput = z.input<typeof createServiceCategorySchema>;
export type CreateServiceCategoryData = z.infer<typeof createServiceCategorySchema>;

/**
 * One of the gym's service categories. `serviceCount` is how many services
 * (active or archived) are filed under it - a category in use cannot be
 * deleted (`409 SERVICE_CATEGORY_IN_USE`).
 */
export interface ServiceCategory {
  id: string;
  name: string;
  serviceCount: number;
}

export interface ListServiceCategoriesResponse {
  data: ServiceCategory[];
}

/**
 * Body for `POST /admin/services`, discriminated on `type`. A PT service has no
 * `name` (generated from its trainer); a CUSTOM one is named by staff.
 *
 * There is no schedule on a service any more: it never produced a bookable
 * slot (those are opened one by one on the PT calendar), so the owner had the
 * whole recurrence section removed on 2026-09-02 rather than keep a form that
 * described nothing.
 */
export const createServiceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('PERSONAL_TRAINING'),
    ...serviceProfileFields,
  }),
  z.object({
    type: z.literal('CUSTOM'),
    name: z.string().trim().min(1, 'Give the service a name').max(120),
    ...serviceProfileFields,
  }),
]);

export type CreateServiceInput = z.input<typeof createServiceSchema>;
export type CreateServiceData = z.infer<typeof createServiceSchema>;

/**
 * Body for `PATCH /admin/services/:id`. `type` is immutable. `name` is ignored by
 * the API on a PT service (regenerated when `staffId` changes).
 */
export const updateServiceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  staffId: z.string().trim().min(1).optional(),
  priceMinor: z.number().int().nonnegative().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  description: z.string().trim().max(2000).optional(),
  coverUrl: coverUrlSchema.optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
});

export type UpdateServiceData = z.infer<typeof updateServiceSchema>;

export const serviceSortSchema = z.enum(['name', 'price', 'createdAt']);

/** Query for `GET /admin/services`. Numbers are coerced from query strings. */
export const listAdminServicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  type: serviceTypeSchema.optional(),
  status: serviceStatusSchema.default('ACTIVE'),
  staffId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1).optional(),
  sort: serviceSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

export type ListAdminServicesQuery = z.infer<typeof listAdminServicesQuerySchema>;

/** The staff member on a service row. */
export interface AdminServiceStaff {
  id: string;
  name: string;
  photoUrl: string | null;
  isTrainer: boolean;
}

/** The category on a service row, or null when it is filed under none. */
export interface AdminServiceCategoryRef {
  id: string;
  name: string;
}

/** One service as the admin roster and POS render it. */
export interface AdminServiceRow {
  id: string;
  type: ServiceType;
  name: string;
  staff: AdminServiceStaff;
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  description: string;
  coverUrl: string | null;
  category: AdminServiceCategoryRef | null;
  status: ServiceStatus;
  createdAt: string;
}

/** Whole-set counts for the roster's KPI tiles (independent of the page). */
export interface ServiceRosterSummary {
  total: number;
  personalTraining: number;
  custom: number;
  /** How many categories the gym has made - the tile that replaced "custom". */
  categories: number;
  archived: number;
}

export interface ListAdminServicesResponse {
  data: AdminServiceRow[];
  total: number;
  page: number;
  limit: number;
  summary: ServiceRosterSummary;
}

export type ServiceResponse = AdminServiceRow;

/** A staff member the service form can pick — `GET /admin/services/staff`. */
export interface ServiceStaffOption {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  isTrainer: boolean;
}

export interface ListServiceStaffResponse {
  data: ServiceStaffOption[];
}

// ── Member portal (public catalogue) ─────────────────────────────────────────

/**
 * Query for the public `GET /services?gymId=<id>` — the member portal's
 * catalogue. Like `/trainers` and `/products` the route is unauthenticated and
 * the gym is named explicitly (resolved from the subdomain), not by a session.
 */
export const listServicesQuerySchema = z.object({
  gymId: z.string().min(1),
});

export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

/** One ACTIVE service as the member portal renders it. Parsed client-side. */
export const serviceCardSchema = z.object({
  id: z.string(),
  type: serviceTypeSchema,
  name: z.string(),
  description: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
  durationMinutes: z.number().int(),
  coverUrl: z.string().nullable(),
  /** The gym's category name, or null. */
  category: z.string().nullable(),
  staff: z.object({
    id: z.string(),
    name: z.string(),
    photoUrl: z.string().nullable(),
  }),
});

export type ServiceCard = z.infer<typeof serviceCardSchema>;

export interface ListServicesResponse {
  services: ServiceCard[];
}
