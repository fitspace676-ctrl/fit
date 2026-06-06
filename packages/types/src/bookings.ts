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
import { classInstanceDetailSchema } from './classes';

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

/**
 * Successful `DELETE /class-instances/:id/bookings` response — the caller's
 * booking released (T5.5). `status` is always `CANCELED`; `promotedBookingId`
 * is the id of the waitlisted booking auto-promoted into the freed seat (the
 * head of the queue), or `null` when the cancelled booking held no seat (it was
 * itself a waitlist entry) or the queue was empty so the seat was simply
 * released. `capacity` / `bookedCount` are the occurrence's seat totals *after*
 * the cancellation — when a promotion happened `bookedCount` is unchanged (the
 * seat was transferred, not freed), so the client can re-render remaining spots
 * without a follow-up read.
 */
export const cancelBookingResultSchema = z.object({
  bookingId: z.string().min(1),
  classInstanceId: z.string().min(1),
  status: z.literal('CANCELED'),
  promotedBookingId: z.string().min(1).nullable(),
  capacity: z.number().int().nonnegative(),
  bookedCount: z.number().int().nonnegative(),
});

/** A booking-cancellation result — {@link cancelBookingResultSchema}. */
export type CancelBookingResult = z.infer<typeof cancelBookingResultSchema>;

/** Successful `DELETE /class-instances/:id/bookings` response — alias for symmetry with the other modules. */
export type CancelBookingResponse = CancelBookingResult;

// ── Attendance tracking (staff console, T5.7) ──────────────────────────────
//
// After a class occurrence has started, staff record who showed up. Attendance
// is a transition on a booking that *held a seat*: `BOOKED → ATTENDED | NO_SHOW`
// (and re-markable for corrections). Waitlisted / canceled bookings never held a
// seat, so they are not part of the roster and cannot be marked. The flow is
// staff-only and tenant-scoped (`/admin/class-instances/:id/attendance`).

/**
 * The attendance outcome a staff member records for a held seat (T5.7):
 * `ATTENDED` (the member showed up) or `NO_SHOW` (they did not). The booking's
 * other statuses (`BOOKED`, `WAITLIST`, `CANCELED`) are not attendance outcomes,
 * so they are intentionally absent — only these two can be *set* via the
 * attendance endpoint.
 */
export const attendanceStatusSchema = z.enum(['ATTENDED', 'NO_SHOW']);

/** A recordable attendance outcome — {@link attendanceStatusSchema}. */
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/**
 * The status a *held-seat* booking can be in on the attendance roster: still
 * `BOOKED` (not yet marked) or already resolved to `ATTENDED` / `NO_SHOW`. A
 * `WAITLIST` / `CANCELED` booking held no seat, so it never appears on the roster.
 */
export const rosterBookingStatusSchema = z.enum(['BOOKED', 'ATTENDED', 'NO_SHOW']);

/** A roster booking's current status — {@link rosterBookingStatusSchema}. */
export type RosterBookingStatus = z.infer<typeof rosterBookingStatusSchema>;

/**
 * One row of an occurrence's attendance roster — a held-seat booking and the
 * member who holds it. `memberName` is the person's display name (or `null` when
 * they never set one); `memberEmail` is always present so staff can still
 * identify them. `status` is the current attendance state; `bookedAt` is when the
 * seat was taken (ISO-8601), giving the roster a stable secondary sort.
 */
export const attendanceRosterEntrySchema = z.object({
  bookingId: z.string().min(1),
  memberId: z.string().min(1),
  memberName: z.string().nullable(),
  memberEmail: z.string(),
  status: rosterBookingStatusSchema,
  bookedAt: z.string(),
});

/** A single attendance-roster row — {@link attendanceRosterEntrySchema}. */
export type AttendanceRosterEntry = z.infer<typeof attendanceRosterEntrySchema>;

/**
 * An occurrence's full attendance roster (`GET /admin/class-instances/:id/
 * attendance`, T5.7). `status` is the occurrence's lifecycle state — once
 * attendance has been recorded it is `COMPLETED`. `attendedCount` / `noShowCount`
 * are derived tallies over `entries` so the UI can show "12 of 15 attended"
 * without a second pass; `bookedCount` is the occurrence's live held-seat counter
 * and `capacity` its seat ceiling. `entries` are the held-seat bookings in
 * booking order.
 */
export const attendanceRosterSchema = z.object({
  classInstanceId: z.string().min(1),
  status: z.enum(['SCHEDULED', 'CANCELED', 'COMPLETED']),
  startsAt: z.string(),
  endsAt: z.string(),
  capacity: z.number().int().nonnegative(),
  bookedCount: z.number().int().nonnegative(),
  attendedCount: z.number().int().nonnegative(),
  noShowCount: z.number().int().nonnegative(),
  entries: z.array(attendanceRosterEntrySchema),
});

/** An occurrence's attendance roster — {@link attendanceRosterSchema}. */
export type AttendanceRoster = z.infer<typeof attendanceRosterSchema>;

/** Successful `GET /admin/class-instances/:id/attendance` response. */
export type GetAttendanceRosterResponse = AttendanceRoster;

/** One booking → attendance-outcome assignment in a {@link markAttendanceSchema} request. */
export const markAttendanceEntrySchema = z.object({
  bookingId: z.string().min(1),
  status: attendanceStatusSchema,
});

/**
 * `POST /admin/class-instances/:id/attendance` request body (T5.7): one or more
 * `{ bookingId, status }` assignments recorded in a single call, so staff can
 * mark a whole roster at once. Each `bookingId` must appear at most once — two
 * conflicting outcomes for the same seat is a client bug, rejected up front
 * rather than resolved by last-write-wins. Capped at 500 entries (well above any
 * realistic class size) to bound the request.
 */
export const markAttendanceSchema = z
  .object({
    entries: z.array(markAttendanceEntrySchema).min(1).max(500),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.entries.forEach((entry, index) => {
      if (seen.has(entry.bookingId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate bookingId "${entry.bookingId}"`,
          path: ['entries', index, 'bookingId'],
        });
      }
      seen.add(entry.bookingId);
    });
  });

/** A validated mark-attendance request — {@link markAttendanceSchema}. */
export type MarkAttendanceData = z.infer<typeof markAttendanceSchema>;

/**
 * Successful `POST /admin/class-instances/:id/attendance` response — the full
 * roster after the marks were applied (with refreshed `attendedCount` /
 * `noShowCount`), so the client re-renders from one round-trip.
 */
export type MarkAttendanceResponse = AttendanceRoster;

// ── Member booking history (member panel, T5.10) ───────────────────────────
//
// A member's own bookings across their whole lifecycle — what `GET /me/bookings`
// returns for the member panel's "My bookings" page. Unlike the staff roster
// (one occurrence, held seats only) this is one member across many occurrences
// and *every* status: a confirmed seat, a waitlist place, a past `ATTENDED` /
// `NO_SHOW`, and a `CANCELED` booking all belong in the history. Each entry
// carries the full denormalised occurrence ({@link classInstanceDetailSchema})
// so the panel renders a card per booking without a second round-trip per class.

/**
 * The status a booking can be in on the member's history — the full Prisma
 * `BookingStatus` lifecycle (`BOOKED`, `WAITLIST`, `ATTENDED`, `NO_SHOW`,
 * `CANCELED`). Wider than {@link bookingOutcomeSchema}
 * (which is only the two states a *fresh* booking lands in) and
 * {@link rosterBookingStatusSchema} (only the held-seat states), because the
 * panel surfaces a member's bookings in every state they can reach.
 */
export const memberBookingStatusSchema = z.enum([
  'BOOKED',
  'WAITLIST',
  'ATTENDED',
  'NO_SHOW',
  'CANCELED',
]);

/** A member booking's lifecycle status — {@link memberBookingStatusSchema}. */
export type MemberBookingStatus = z.infer<typeof memberBookingStatusSchema>;

/**
 * Which slice of the member's bookings to return: `upcoming` (occurrences that
 * have not started yet, soonest first), `past` (already started, most recent
 * first), or `all` (everything, most recent first). The panel reads `all` once
 * and splits the two sections client-side; `upcoming` / `past` exist for callers
 * (e.g. the mobile home screen) that only need one. Defaults to `all`.
 */
export const memberBookingScopeSchema = z.enum(['upcoming', 'past', 'all']);

/** A member-bookings query scope — {@link memberBookingScopeSchema}. */
export type MemberBookingScope = z.infer<typeof memberBookingScopeSchema>;

/**
 * Query for `GET /me/bookings`. The member is the authenticated caller (resolved
 * from the session, never off the wire), so the only input is the optional
 * `scope` filter; an absent scope returns the member's full history.
 */
export const listMemberBookingsQuerySchema = z.object({
  scope: memberBookingScopeSchema.default('all'),
});

/** Validated `GET /me/bookings` query — {@link listMemberBookingsQuerySchema}. */
export type ListMemberBookingsQuery = z.infer<typeof listMemberBookingsQuerySchema>;

/**
 * One row of a member's booking history — the booking and the occurrence it is
 * against. `status` is the booking's current lifecycle state; `waitlistPosition`
 * is the 1-based queue place while `WAITLIST` and `null` otherwise; `bookedAt`
 * (ISO-8601) is when the booking was made, giving the history a stable sort
 * within an occurrence. `classInstance` is the full denormalised occurrence
 * ({@link classInstanceDetailSchema}) — title, schedule, trainer, location, live
 * seat totals, and the occurrence's own `status` — so the panel renders a card
 * (and a deep link to `/classes/:id`) straight from the entry.
 */
export const memberBookingHistoryEntrySchema = z.object({
  bookingId: z.string().min(1),
  status: memberBookingStatusSchema,
  waitlistPosition: z.number().int().positive().nullable(),
  bookedAt: z.string(),
  classInstance: classInstanceDetailSchema,
});

/** A single member booking-history row — {@link memberBookingHistoryEntrySchema}. */
export type MemberBookingHistoryEntry = z.infer<typeof memberBookingHistoryEntrySchema>;

/**
 * Successful `GET /me/bookings` response — the caller's bookings for the
 * requested {@link memberBookingScopeSchema scope}, ordered by the occurrence's
 * start (ascending for `upcoming`, descending for `past` / `all`). An empty
 * `bookings` array is a normal `200` — a member who has never booked.
 */
export const listMemberBookingsResultSchema = z.object({
  bookings: z.array(memberBookingHistoryEntrySchema),
});

/** A member booking-history result — {@link listMemberBookingsResultSchema}. */
export type ListMemberBookingsResult = z.infer<typeof listMemberBookingsResultSchema>;

/** Successful `GET /me/bookings` response — alias for symmetry with the other modules. */
export type ListMemberBookingsResponse = ListMemberBookingsResult;
