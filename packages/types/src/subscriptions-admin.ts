// @fit/types — recurring-membership subscription-plan admin contracts (Zod schemas + types).
//
// Shapes crossing the API boundary for the staff console's subscription-plan
// management (T8.2): the paginated `GET /admin/subscriptions` roster the admin
// table renders, the `GET /admin/subscriptions/:id` detail view, and the create /
// edit / deactivate writes. The API validates inbound queries/bodies with these
// Zod schemas and the `@fit/admin` console reuses the inferred types, so the table
// / form and the controller can never drift on the wire format.
//
// A subscription plan is a gym-curated *recurring* membership offering with a
// per-interval price, a renewal cadence, and a flat list of perk features —
// distinct from the one-off PT `PackagePlan` (T4.11) and a retail `Product`
// (T4.6). Price is carried in the currency's MINOR units (cents/tetri) as an
// integer, so no float rounding crosses the wire; the client formats it with
// `Intl.NumberFormat` against `currency` (ISO 4217). The features list mirrors the
// package plan's (a flat list edited as a whole on the form). Unlike a package
// plan there is no `sessionCount` (a recurring membership is open-ended) and the
// `interval` is `MONTH`/`YEAR` only — a recurring charge has no `ONE_TIME`.

import { z } from 'zod';
import { sortDirSchema } from './members';

/**
 * A subscription plan's lifecycle within the gym, mirroring the Prisma
 * `SubscriptionPlanStatus` enum. `ACTIVE` is a plan the gym currently offers;
 * `INACTIVE` is soft-deactivated — hidden but retained (T8.2). The roster filter
 * and the status badge both key off this.
 */
export const subscriptionPlanStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

/** A subscription plan's lifecycle state — {@link subscriptionPlanStatusSchema}. */
export type SubscriptionPlanStatus = z.infer<typeof subscriptionPlanStatusSchema>;

/**
 * How a subscription plan renews, mirroring the Prisma `SubscriptionInterval`
 * enum. `MONTH`/`YEAR` are the only cadences — a *recurring* membership has no
 * `ONE_TIME` (deliberately distinct from {@link PackageBillingInterval}). The form
 * offers these and the detail/roster surface a per-interval price suffix.
 */
export const subscriptionIntervalSchema = z.enum(['MONTH', 'YEAR']);

/** A subscription plan's renewal cadence — {@link subscriptionIntervalSchema}. */
export type SubscriptionInterval = z.infer<typeof subscriptionIntervalSchema>;

/** Sortable columns for the subscription-plan roster. Mirrors the `orderBy` keys the service maps. */
export const subscriptionPlanSortSchema = z.enum(['name', 'price', 'status', 'createdAt']);

/** A column the subscription-plan roster may be sorted by — {@link subscriptionPlanSortSchema}. */
export type SubscriptionPlanSort = z.infer<typeof subscriptionPlanSortSchema>;

/** The most features a single subscription plan may list (keeps the form + stored row sane). */
export const MAX_SUBSCRIPTION_FEATURES = 20;

/**
 * Query for `GET /admin/subscriptions`. Pagination is mandatory server-side (`page`
 * is 1-based, `limit` capped at 100); `search` matches the plan name/description,
 * `status` narrows the list, and `sort` + `dir` drive ordering. Every field is
 * optional with a sensible default so a bare `GET /admin/subscriptions` is valid.
 * Numbers are coerced because they arrive as query strings.
 */
export const listAdminSubscriptionPlansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: subscriptionPlanStatusSchema.optional(),
  sort: subscriptionPlanSortSchema.default('name'),
  dir: sortDirSchema.default('asc'),
});

/** Validated `GET /admin/subscriptions` query — {@link listAdminSubscriptionPlansQuerySchema}. */
export type ListAdminSubscriptionPlansQuery = z.infer<typeof listAdminSubscriptionPlansQuerySchema>;

/**
 * One subscription plan as the roster table renders it. `priceAmount` is the
 * per-interval price in `currency`'s minor units the table formats.
 * `interval` drives the price suffix. `featureCount` is the size of the features
 * list so the roster can show "3 features" without shipping the whole list.
 * `popular` flags the emphasised plan. `createdAt` is an ISO-8601 instant the
 * table formats locally.
 */
export interface AdminSubscriptionPlanRow {
  id: string;
  name: string;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  featureCount: number;
  popular: boolean;
  status: SubscriptionPlanStatus;
  createdAt: string;
}

/**
 * Successful `GET /admin/subscriptions` response — one page of the roster plus the
 * totals the pager needs. `total` is the count *after* filters, `page` / `limit`
 * echo the request. An empty `data` is a normal result the table renders as its
 * empty state.
 */
export interface ListAdminSubscriptionPlansResponse {
  data: AdminSubscriptionPlanRow[];
  total: number;
  page: number;
  limit: number;
}

/**
 * One subscription plan as the detail / edit page needs it — the roster row plus
 * the `description`, the full ordered `features` list, and the `updatedAt`
 * instant. A missing / cross-tenant id is a `404`, not an empty body, so the page
 * distinguishes "no such plan" from a valid record.
 */
export interface AdminSubscriptionPlanDetail extends AdminSubscriptionPlanRow {
  description: string;
  features: string[];
  updatedAt: string;
}

/** Successful `GET /admin/subscriptions/:id` response — the plan detail spread flat. */
export type GetAdminSubscriptionPlanResponse = AdminSubscriptionPlanDetail;

/**
 * The editable subscription-plan fields shared by the create + update bodies.
 * `name` is required; `description` is free text (empty allowed, normalised to
 * `''`). `priceAmount` is the per-interval price in the currency's minor units — a
 * non-negative integer, defaulting to `0`. `currency` is a 3-letter ISO-4217 code,
 * upper-cased and defaulting to `USD`. `interval` defaults to `MONTH`. `features`
 * is the ordered perk list, each a short non-empty label, capped at
 * {@link MAX_SUBSCRIPTION_FEATURES}. `popular` defaults to `false`. Numbers are
 * coerced because the admin form submits them as strings.
 */
const subscriptionPlanProfileFields = {
  name: z.string().trim().min(1, 'Name is required').max(160),
  description: z.string().trim().max(2000).default(''),
  priceAmount: z.coerce
    .number()
    .int('Price must be a whole number of minor units')
    .nonnegative('Price cannot be negative')
    .default(0),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, 'Currency must be a 3-letter ISO code')
    .default('USD'),
  interval: subscriptionIntervalSchema.default('MONTH'),
  features: z
    .array(z.string().trim().min(1, 'A feature cannot be empty').max(120))
    .max(MAX_SUBSCRIPTION_FEATURES, `A plan can have at most ${MAX_SUBSCRIPTION_FEATURES} features`)
    .default([]),
  popular: z.coerce.boolean().default(false),
};

/**
 * Body for `POST /admin/subscriptions` — create a subscription plan (T8.2). The
 * profile fields plus an initial `status` that defaults to `ACTIVE` (a staff-added
 * plan is live unless explicitly created inactive). The API re-validates with this
 * exact schema, so the admin form and the controller can never drift.
 */
export const createSubscriptionPlanSchema = z.object({
  ...subscriptionPlanProfileFields,
  status: subscriptionPlanStatusSchema.default('ACTIVE'),
});

/** Validated `POST /admin/subscriptions` body — {@link createSubscriptionPlanSchema}. */
export type CreateSubscriptionPlanInput = z.input<typeof createSubscriptionPlanSchema>;

/** Parsed `POST /admin/subscriptions` body (after defaults/transforms applied). */
export type CreateSubscriptionPlanData = z.infer<typeof createSubscriptionPlanSchema>;

/**
 * Body for `PATCH /admin/subscriptions/:id` — edit a subscription plan (T8.2). The
 * same mutable profile fields as create; `status` is changed through the dedicated
 * deactivate / reactivate actions, not here.
 */
export const updateSubscriptionPlanSchema = z.object(subscriptionPlanProfileFields);

/** Validated `PATCH /admin/subscriptions/:id` body — {@link updateSubscriptionPlanSchema}. */
export type UpdateSubscriptionPlanInput = z.input<typeof updateSubscriptionPlanSchema>;

/** Parsed `PATCH /admin/subscriptions/:id` body (after defaults/transforms applied). */
export type UpdateSubscriptionPlanData = z.infer<typeof updateSubscriptionPlanSchema>;

/**
 * Successful `POST /admin/subscriptions` response (`201 Created`) — the newly
 * created subscription plan as the detail page renders it.
 */
export type CreateSubscriptionPlanResponse = AdminSubscriptionPlanDetail;

/** Successful `PATCH /admin/subscriptions/:id` response — the updated plan detail. */
export type UpdateSubscriptionPlanResponse = AdminSubscriptionPlanDetail;

/**
 * Successful `POST /admin/subscriptions/:id/deactivate` and `.../reactivate`
 * response — the plan detail with the new `status` (`INACTIVE` / `ACTIVE`).
 */
export type SetSubscriptionPlanStatusResponse = AdminSubscriptionPlanDetail;
