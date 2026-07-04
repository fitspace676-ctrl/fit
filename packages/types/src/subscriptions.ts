// @fit/types — member-facing subscription freeze/pause contracts (Zod schemas + types).
//
// Shapes crossing the API boundary for the freeze (pause) flow (T8.4): the
// `POST /subscriptions/:id/freeze` request a member submits to pause their
// membership, and the freeze / unfreeze responses. The API validates the inbound
// body with `freezeSubscriptionSchema` and the member clients reuse the inferred
// types, so the panel and the controller can never drift on the wire format.
//
// Distinct from the staff console's subscription-*plan* CRUD (`subscriptions-admin.ts`,
// T8.2): this is a member acting on their *own* `Subscription`. The per-plan freeze
// allowance (`freezeDaysPerPeriod`) is enforced server-side — a request that would
// overrun it is a `422 EXCEEDS_FREEZE_ALLOWANCE` carrying `remainingDays` — and a
// re-freeze of an already-frozen subscription is a `409 ALREADY_FROZEN`.

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  POST /subscriptions  &  POST /admin/subscriptions/enroll  (enrolment, T5.3) */
/* -------------------------------------------------------------------------- */

/**
 * Body for `POST /subscriptions` — a member enrolling *themselves* on a plan. Only
 * the `planId` crosses the wire; the member is resolved from the session (never a
 * member id on the wire) and the price / currency / interval are snapshotted
 * server-side from the plan, so the client can't dictate the terms it pays.
 */
export const enrollSubscriptionSchema = z.object({
  planId: z.string().trim().min(1, 'A plan is required'),
});

/** Validated `POST /subscriptions` body — {@link enrollSubscriptionSchema}. */
export type EnrollSubscriptionData = z.infer<typeof enrollSubscriptionSchema>;

/**
 * A subscription's lifecycle state on the wire — mirrors the Prisma
 * `SubscriptionStatus` enum. A fresh enrolment is `ACTIVE`, or `TRIAL` when the plan
 * has a free trial (`trialDays > 0`) that has yet to convert on the first charge.
 */
export const enrolledSubscriptionStatusSchema = z.enum([
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'FROZEN',
  'CANCELED',
  'EXPIRED',
]);

/**
 * The subscription an enrolment created, echoed back so the caller (member
 * checkout or the staff console) can render the new membership without a follow-up
 * read. `priceAmount` is in the currency's MINOR units, snapshotted from the plan
 * at enrolment; `planName` is `null` only if the plan is later deleted (the
 * subscription survives via `SetNull`). `currentPeriodStart` / `currentPeriodEnd`
 * are ISO-8601 instants bounding the first paid period.
 */
export const enrolledSubscriptionSchema = z.object({
  id: z.string().min(1),
  status: enrolledSubscriptionStatusSchema,
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string(),
  interval: z.enum(['MONTH', 'YEAR']),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  createdAt: z.string(),
});
export type EnrolledSubscription = z.infer<typeof enrolledSubscriptionSchema>;

/**
 * Successful enrolment response (`201`) for both `POST /subscriptions` (member)
 * and `POST /admin/subscriptions/enroll` (staff): the newly created
 * {@link EnrolledSubscription}. Enrolment is rejected with `404
 * SUBSCRIPTION_PLAN_NOT_FOUND` (unknown / cross-tenant plan), `409
 * SUBSCRIPTION_PLAN_INACTIVE` (a deactivated plan), and `409 ALREADY_SUBSCRIBED`
 * (the member already holds a live subscription — one live membership per member
 * per gym).
 */
export interface EnrollSubscriptionResponse {
  subscription: EnrolledSubscription;
}

/** The most days a single freeze request may span (one year — a generous ceiling the schema rejects past). */
export const MAX_FREEZE_DURATION_DAYS = 365;

/**
 * Body for `POST /subscriptions/:id/freeze` — pause a membership from `startDate`
 * for `durationDays` whole days. `startDate` is an ISO-8601 instant; `durationDays`
 * is a positive integer (coerced, since a form may submit it as a string), capped
 * at {@link MAX_FREEZE_DURATION_DAYS}. The plan's `freezeDaysPerPeriod` allowance is
 * the real limit, enforced server-side against the period's prior usage.
 */
export const freezeSubscriptionSchema = z.object({
  startDate: z.string().datetime(),
  durationDays: z.coerce
    .number()
    .int('Duration must be a whole number of days')
    .min(1, 'Duration must be at least 1 day')
    .max(MAX_FREEZE_DURATION_DAYS, `A freeze can be at most ${MAX_FREEZE_DURATION_DAYS} days`),
});

/** Validated `POST /subscriptions/:id/freeze` body — {@link freezeSubscriptionSchema}. */
export type FreezeSubscriptionInput = z.input<typeof freezeSubscriptionSchema>;

/** Parsed `POST /subscriptions/:id/freeze` body (after coercion/defaults). */
export type FreezeSubscriptionData = z.infer<typeof freezeSubscriptionSchema>;

/**
 * Successful `POST /subscriptions/:id/freeze` response — the subscription is now
 * `FROZEN`; `frozenUntil` is the ISO-8601 instant it will auto-resume (the member
 * may unfreeze earlier).
 */
export interface FreezeSubscriptionResponse {
  frozenUntil: string;
}

/**
 * Successful `POST /subscriptions/:id/unfreeze` response — the subscription is back
 * to `ACTIVE` and `newPeriodEnd` is the ISO-8601 next-renewal instant after pushing
 * it out by the days actually spent frozen.
 */
export interface UnfreezeSubscriptionResponse {
  newPeriodEnd: string;
}
