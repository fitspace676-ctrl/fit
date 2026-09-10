// @fit/types — member self-service ("/me/*") contracts.
//
// The signed-in member reading/managing their own membership, profile, goals and
// order history. Each endpoint resolves the caller from the session — there is no
// member id on the wire — and is tenant-scoped to the caller's gym.

import { z } from 'zod';
import { orderStatusSchema } from './orders';

/* -------------------------------------------------------------------------- */
/*  GET /me/subscription                                                       */
/* -------------------------------------------------------------------------- */

/** A member subscription's lifecycle state — mirrors the Prisma enum. */
export const meSubscriptionStatusSchema = z.enum([
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'FROZEN',
  'CANCELED',
  'EXPIRED',
]);
export type MeSubscriptionStatus = z.infer<typeof meSubscriptionStatusSchema>;

/** The member's current membership, as the portal's Membership screen renders it. */
export const meSubscriptionSchema = z.object({
  id: z.string().min(1),
  status: meSubscriptionStatusSchema,
  /** Catalogue plan name, snapshotted; `null` for a bespoke / plan-less subscription. */
  planName: z.string().nullable(),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string(),
  interval: z.enum(['MONTH', 'YEAR']),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  /** ISO instant the freeze began, or `null` when not frozen. */
  frozenAt: z.string().nullable(),
  /** ISO instant the freeze auto-resumes, or `null` when not frozen. */
  frozenUntil: z.string().nullable(),
  /** The plan's freeze allowance — whole days of freeze granted per billing period. */
  freezeDaysPerPeriod: z.number().int().nonnegative(),
  /** Days of freeze already committed against this period's allowance. */
  freezeDaysUsed: z.number().int().nonnegative(),
  /** Days of the allowance still available this period (`max(0, perPeriod − used)`). */
  freezeDaysRemaining: z.number().int().nonnegative(),
  /** When the caller joined the gym (their `GymMember.joinedAt`). */
  memberSince: z.string(),
});
export type MeSubscription = z.infer<typeof meSubscriptionSchema>;

/** One invoice / payment row in the member's billing history. */
export const meInvoiceSchema = z.object({
  id: z.string().min(1),
  date: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  status: z.enum(['PAID', 'PENDING', 'FAILED', 'REFUNDED']),
});
export type MeInvoice = z.infer<typeof meInvoiceSchema>;

/**
 * `GET /me/subscription` response. `subscription` is `null` for a member who has
 * never subscribed; `invoices` is their billing history, most recent first (empty
 * until recurring billing records payments).
 */
export interface GetMeSubscriptionResponse {
  subscription: MeSubscription | null;
  invoices: MeInvoice[];
}

/* -------------------------------------------------------------------------- */
/*  GET / PATCH /me/profile                                                    */
/* -------------------------------------------------------------------------- */

/** The caller's editable profile (a User attribute set, gym-independent). */
export const meProfileSchema = z.object({
  userId: z.string().min(1),
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
});
export type MeProfile = z.infer<typeof meProfileSchema>;

/** `GET /me/profile` response. */
export interface GetMeProfileResponse {
  profile: MeProfile;
}

/**
 * Body for `PATCH /me/profile`. Every field optional — only the present ones are
 * written. `phone` may be explicitly `null` to clear it.
 */
export const updateMeProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().max(40).nullable().optional(),
  })
  .strict();
export type UpdateMeProfileInput = z.infer<typeof updateMeProfileSchema>;

/** `PATCH /me/profile` response — the updated profile. */
export interface UpdateMeProfileResponse {
  profile: MeProfile;
}

/* -------------------------------------------------------------------------- */
/*  GET / PUT /me/goals                                                        */
/* -------------------------------------------------------------------------- */

/** A single training goal with current/target progress. */
export const meGoalSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  /** Current value and target, free units (e.g. workouts, kg). */
  current: z.number().nonnegative(),
  target: z.number().positive(),
  /** Display unit, e.g. "sessions", "kg". */
  unit: z.string().max(24).default(''),
});
export type MeGoal = z.infer<typeof meGoalSchema>;

/** `GET /me/goals` response. */
export interface ListMeGoalsResponse {
  goals: MeGoal[];
}

/** Body for `PUT /me/goals` — replace the caller's goal set (max 8). */
export const putMeGoalsSchema = z.object({
  goals: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        current: z.number().nonnegative(),
        target: z.number().positive(),
        unit: z.string().trim().max(24).default(''),
      }),
    )
    .max(8),
});
export type PutMeGoalsInput = z.infer<typeof putMeGoalsSchema>;

/* -------------------------------------------------------------------------- */
/*  GET /me/orders                                                             */
/* -------------------------------------------------------------------------- */

// The caller's own purchase history — the list behind the mobile Orders tab, and
// the missing half of a pair that until now had only a detail view.
//
// WHY THIS EXISTS. `GET /checkout/:orderId` could confirm ONE order, but only if
// you already held its id — which the app only ever had for the purchase it had
// just made. There was no member-callable way to ask "what have I bought": the
// roster is `GET /orders` (`OrdersController`), gated on `BillingRead`, a
// permission `ROLE_PERMISSIONS.MEMBER` does not hold, so a member reaching for it
// gets a 403. Hence a `/me` route: the caller is resolved from the session and the
// query is constrained to their own membership, exactly as `GET /me/subscription`
// and `GET /me/bookings` are.
//
// The rows are deliberately a SUMMARY, not the detail: a card needs a date, a
// state, a total and enough of the basket to recognise it. Everything richer —
// the full itemised breakdown — stays on `GET /checkout/:orderId`, which the app
// already renders, so this contract adds a list without forking the detail.

/**
 * Query for `GET /me/orders`. The member is the authenticated caller (resolved
 * from the session, never off the wire), so the only inputs are the pager.
 * Purchase history grows without bound over a membership's life, so pagination is
 * mandatory server-side, mirroring `GET /admin/activity` and `GET /orders`:
 * `page` is 1-based and `limit` capped — at 50 rather than 100, because this is a
 * phone list that pages as it scrolls. Numbers are coerced (they arrive as query
 * strings), and both default, so a bare `GET /me/orders` is valid.
 */
export const listMyOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Validated `GET /me/orders` query — {@link listMyOrdersQuerySchema}. */
export type ListMyOrdersQuery = z.infer<typeof listMyOrdersQuerySchema>;

/** The raw (pre-coercion) query — what a client serialises into the URL. */
export type ListMyOrdersQueryInput = z.input<typeof listMyOrdersQuerySchema>;

/**
 * One row of the member's own order history, as a list card renders it.
 *
 * `status` is the same three-state public enum the confirmation screen already
 * shows ({@link orderStatusSchema}) — including its lossy edge, a `REFUNDED`
 * order reading as `cancelled` — so the list and the detail it links into cannot
 * disagree about what an order's state is called. Staff see the true lifecycle on
 * the admin order detail, which has its own richer enum.
 *
 * `total` is in the currency's MINOR units (as everywhere in the order contracts);
 * `itemCount` is the number of priced LINES, matching {@link AdminOrderRow} — a
 * discount adjustment is a line, so this is "lines on the order", not "units
 * bought". `itemLabels` is the first {@link MY_ORDER_LABEL_PREVIEW} of those lines
 * in the order they were written, which is what lets a card read "Whey Protein,
 * Shaker +2 more" without a second fetch; an order with no lines (nothing today
 * writes one, but the relation permits it) is a normal empty array.
 *
 * There is no human order NUMBER here because the `Order` row has none — its `id`
 * is a cuid and is what `GET /checkout/:orderId` is addressed by. Rendering a
 * short prefix of it is a display choice, not a contract one.
 */
export const memberOrderSummarySchema = z.object({
  id: z.string().min(1),
  status: orderStatusSchema,
  total: z.number().int().nonnegative(),
  currency: z.string().length(3),
  itemCount: z.number().int().nonnegative(),
  itemLabels: z.array(z.string()),
  /** ISO-8601 instant the order was placed. */
  createdAt: z.string().datetime(),
});

/** A single member order-history row — {@link memberOrderSummarySchema}. */
export type MemberOrderSummary = z.infer<typeof memberOrderSummarySchema>;

/**
 * How many line labels {@link memberOrderSummarySchema}'s `itemLabels` carries.
 * Two: enough for a card to name what the order was, few enough that the API is
 * not shipping a whole basket per row to render "+N more".
 */
export const MY_ORDER_LABEL_PREVIEW = 2;

/**
 * Successful `GET /me/orders` response — one page of the caller's orders, newest
 * first. `total` is the count across the whole history (so the client knows when
 * it has reached the end); `page` / `limit` echo the request. An empty `orders`
 * array is a normal `200` — a member who has never bought anything, and equally a
 * caller with no membership in this gym at all.
 */
export const listMyOrdersResponseSchema = z.object({
  orders: z.array(memberOrderSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});

/** Validated `GET /me/orders` response — {@link listMyOrdersResponseSchema}. */
export type ListMyOrdersResponse = z.infer<typeof listMyOrdersResponseSchema>;
