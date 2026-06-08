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
