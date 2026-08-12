// @fit/types — personal-training package-plan admin contracts (Zod schemas + types).
//
// Shapes crossing the API boundary for the staff console's package-plan management
// (T4.11): the paginated `GET /admin/packages` roster the admin table renders, the
// `GET /admin/packages/:id` detail view, and the create / edit / deactivate writes.
// The API validates inbound queries/bodies with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the table / form and the
// controller can never drift on the wire format.
//
// A package plan is a gym-curated personal-training offering with a price, a
// billing cadence, an optional session count, and a flat list of perk features —
// distinct from a retail `Product` (T4.6). Price is carried in the currency's
// MINOR units (cents/tetri) as an integer, so no float rounding crosses the wire;
// the client formats it with `Intl.NumberFormat` against `currency` (ISO 4217).
// The features list mirrors the Location model's `amenities` (a flat list edited
// as a whole on the form), and the billing/session fields align with the public
// purchase-wizard `packageSummarySchema` (T3.9).

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * A package plan's lifecycle within the gym, mirroring the Prisma
 * `PackagePlanStatus` enum. `ACTIVE` is a plan the gym currently sells; `INACTIVE`
 * is soft-deactivated — hidden but retained (T4.11). The roster filter and the
 * status badge both key off this.
 */
export const packagePlanStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A package plan's lifecycle state — {@link packagePlanStatusSchema}. */
export type PackagePlanStatus = z.infer<typeof packagePlanStatusSchema>;

/**
 * How a package plan is billed, mirroring the Prisma `PackageBillingInterval`
 * enum. `MONTH`/`YEAR` are recurring; `ONE_TIME` is a single charge (a session
 * pack or day pass). The form offers these and the detail/roster surface a
 * per-interval suffix for recurring plans.
 */
export const packageBillingIntervalSchema = z.enum(['MONTH', 'YEAR', 'ONE_TIME']);

/** A package plan's billing cadence — {@link packageBillingIntervalSchema}. */
export type PackageBillingInterval = z.infer<typeof packageBillingIntervalSchema>;

/** Sortable columns for the package-plan roster. Mirrors the `orderBy` keys the service maps. */
export const packagePlanSortSchema = z.enum(['name', 'price', 'status', 'createdAt']);

/** A column the package-plan roster may be sorted by — {@link packagePlanSortSchema}. */
export type PackagePlanSort = z.infer<typeof packagePlanSortSchema>;

/** The most features a single package plan may list (keeps the form + stored row sane). */
export const MAX_PACKAGE_FEATURES = 20;

/**
 * Query for `GET /admin/packages`. Pagination is mandatory server-side (`page` is
 * 1-based, `limit` capped at 100); `search` matches the plan name/description,
 * `status` narrows the list, and `sort` + `dir` drive ordering. Every field is
 * optional with a sensible default so a bare `GET /admin/packages` is valid.
 * Numbers are coerced because they arrive as query strings.
 */
export const listAdminPackagePlansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: packagePlanStatusSchema.optional(),
  sort: packagePlanSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/packages` query — {@link listAdminPackagePlansQuerySchema}. */
export type ListAdminPackagePlansQuery = z.infer<typeof listAdminPackagePlansQuerySchema>;

/**
 * One package plan as the roster table renders it. `priceAmount` is the price in
 * `currency`'s minor units the table formats. `billingInterval` drives the price
 * suffix; `sessionCount` is the number of PT sessions the plan grants, or `null`
 * for unlimited. `featureCount` is the size of the features list so the roster can
 * show "3 features" without shipping the whole list. `popular` flags the
 * emphasised plan. `createdAt` is an ISO-8601 instant the table formats locally.
 */
export interface AdminPackagePlanRow {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  billingInterval: PackageBillingInterval;
  sessionCount: number | null;
  featureCount: number;
  popular: boolean;
  status: PackagePlanStatus;
  createdAt: string;
}

/**
 * Successful `GET /admin/packages` response — one page of the roster plus the
 * totals the pager needs. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the table renders as its
 * empty state.
 */
export interface ListAdminPackagePlansResponse {
  data: AdminPackagePlanRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One package plan as the detail / edit page needs it — the roster row plus the
 * `description`, the full ordered `features` list, and the `updatedAt` instant. A
 * missing / cross-tenant id is a `404`, not an empty body, so the page
 * distinguishes "no such plan" from a valid record.
 */
export interface AdminPackagePlanDetail extends AdminPackagePlanRow {
  description: string;
  features: string[];
  updatedAt: string;
}

/** Successful `GET /admin/packages/:id` response — the plan detail spread flat. */
export type GetAdminPackagePlanResponse = AdminPackagePlanDetail;

/**
 * The editable package-plan fields shared by the create + update bodies. `name` is
 * required; `description` is free text (empty allowed, normalised to `''`).
 * `priceAmount` is the price in the currency's minor units — a non-negative
 * integer, defaulting to `0`. `currency` is not client-settable — the API stamps
 * the gym's own `settings.locale.currency` when the plan is created, so a gym can
 * never end up selling in a currency it does not price in. `billingInterval`
 * defaults to `MONTH`. `sessionCount`
 * is a positive integer or `null` (unlimited), defaulting to `null`. `features` is
 * the ordered perk list, each a short non-empty label, capped at
 * {@link MAX_PACKAGE_FEATURES}. `popular` defaults to `false`. Numbers are coerced
 * because the admin form submits them as strings.
 */
const packagePlanProfileFields = {
  name: z.string().trim().min(1, 'Name is required').max(160),
  description: z.string().trim().max(2000).default(''),
  priceAmount: z.coerce
    .number()
    .int('Price must be a whole number of minor units')
    .nonnegative('Price cannot be negative')
    .default(0),
  billingInterval: packageBillingIntervalSchema.default('MONTH'),
  sessionCount: z.coerce
    .number()
    .int('Session count must be a whole number')
    .positive('Session count must be greater than zero')
    .nullable()
    .default(null),
  features: z
    .array(z.string().trim().min(1, 'A feature cannot be empty').max(120))
    .max(MAX_PACKAGE_FEATURES, `A plan can have at most ${MAX_PACKAGE_FEATURES} features`)
    .default([]),
  popular: z.coerce.boolean().default(false),
};

/**
 * Body for `POST /admin/packages` — create a package plan (T4.11). The profile
 * fields plus an initial `status` that defaults to `ACTIVE` (a staff-added plan is
 * live unless explicitly created inactive). The API re-validates with this exact
 * schema, so the admin form and the controller can never drift.
 */
export const createPackagePlanSchema = z.object({
  ...packagePlanProfileFields,
  status: packagePlanStatusSchema.default('ACTIVE'),
});

/** Validated `POST /admin/packages` body — {@link createPackagePlanSchema}. */
export type CreatePackagePlanInput = z.input<typeof createPackagePlanSchema>;

/** Parsed `POST /admin/packages` body (after defaults/transforms applied). */
export type CreatePackagePlanData = z.infer<typeof createPackagePlanSchema>;

/**
 * Body for `PATCH /admin/packages/:id` — edit a package plan (T4.11). The same
 * mutable profile fields as create; `status` is changed through the dedicated
 * deactivate / reactivate actions, not here.
 */
export const updatePackagePlanSchema = z.object(packagePlanProfileFields);

/** Validated `PATCH /admin/packages/:id` body — {@link updatePackagePlanSchema}. */
export type UpdatePackagePlanInput = z.input<typeof updatePackagePlanSchema>;

/** Parsed `PATCH /admin/packages/:id` body (after defaults/transforms applied). */
export type UpdatePackagePlanData = z.infer<typeof updatePackagePlanSchema>;

/**
 * Successful `POST /admin/packages` response (`201 Created`) — the newly created
 * package plan as the detail page renders it.
 */
export type CreatePackagePlanResponse = AdminPackagePlanDetail;

/** Successful `PATCH /admin/packages/:id` response — the updated plan detail. */
export type UpdatePackagePlanResponse = AdminPackagePlanDetail;

/**
 * Successful `POST /admin/packages/:id/deactivate` and `.../reactivate` response —
 * the plan detail with the new `status` (`INACTIVE` / `ACTIVE`).
 */
export type SetPackagePlanStatusResponse = AdminPackagePlanDetail;
