// @fit/types — class-booking contracts (Zod schemas + inferred types).
//
// The shapes crossing the API boundary when a member books a scheduled class
// occurrence: `POST /class-instances/:id/bookings` (T5.4). The member books
// *themselves* (the caller's gym membership is the booking's `memberId` — there
// is no member id on the wire), so the request carries no body; the only input
// beyond the path's instance id is the optional `Idempotency-Key` header that
// makes a retried POST safe.
//
// The API validates that header with {@link idempotencyKeySchema} and projects
// the created (or replayed) booking to {@link BookClassInstanceResult}; the
// mobile / member clients reuse the inferred types so the booking call and the
// controller can never drift on the wire format.

import { z } from 'zod';

/**
 * The outcome status a *fresh* booking can land in (T5.4): `BOOKED` holds a
 * confirmed seat; `WAITLIST` is queued (with a `waitlistPosition`) because the
 * occurrence was already at capacity. The post-class attendance states
 * (`ATTENDED` / `NO_SHOW`) and `CANCELED` are reached by later transitions, not
 * by the booking endpoint, so they are intentionally absent from this set.
 */
export const bookingOutcomeSchema = z.enum(['BOOKED', 'WAITLIST']);

/** The status a fresh booking can land in — {@link bookingOutcomeSchema}. */
export type BookingOutcome = z.infer<typeof bookingOutcomeSchema>;

/**
 * The client-supplied idempotency token (the `Idempotency-Key` request header).
 * A non-empty, bounded string the caller mints per logical booking attempt and
 * reuses across retries: the API persists it on the booking under a unique
 * constraint, so a retried POST returns the original booking instead of creating
 * a second one. Optional — a request without it still books, just without replay
 * protection. The 200-char ceiling matches the typical UUID / ULID a client
 * generates while bounding what is stored.
 */
export const idempotencyKeySchema = z.string().min(1).max(200);

/** A validated idempotency token — {@link idempotencyKeySchema}. */
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;

/**
 * Successful `POST /class-instances/:id/bookings` response — the created (or, on
 * an idempotent retry, the previously created) booking. `status` is `BOOKED`
 * when a seat was secured and `WAITLIST` when the occurrence was full;
 * `waitlistPosition` is the 1-based queue position while `WAITLIST` and `null`
 * when `BOOKED`. `capacity` / `bookedCount` are the occurrence's seat totals
 * *after* this booking, so the client can render remaining spots without a
 * follow-up read. `idempotentReplay` is `true` when the request matched an
 * existing booking by its idempotency key (no new seat was taken) — the body is
 * otherwise identical to the original create, so a retry is safe and transparent.
 */
export const bookClassInstanceResultSchema = z.object({
  bookingId: z.string().min(1),
  classInstanceId: z.string().min(1),
  status: bookingOutcomeSchema,
  waitlistPosition: z.number().int().positive().nullable(),
  capacity: z.number().int().nonnegative(),
  bookedCount: z.number().int().nonnegative(),
  idempotentReplay: z.boolean(),
});

/** A class-booking result — {@link bookClassInstanceResultSchema}. */
export type BookClassInstanceResult = z.infer<typeof bookClassInstanceResultSchema>;

/** Successful `POST /class-instances/:id/bookings` response — alias for symmetry with the other modules. */
export type BookClassInstanceResponse = BookClassInstanceResult;
