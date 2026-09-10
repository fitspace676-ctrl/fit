// @fit/mobile — class bookings (`/class-instances/:id/bookings`, `/me/bookings`).
//
// ## The credit-pack coupling
//
// A confirmed seat is **paid for with a class credit**: `BookingsService.book`
// calls `creditPacks.chargeSeatCredit(tx, memberId)` inside the same transaction
// that claims the seat, and `cancel` calls `creditPacks.refundCredit(...)`
// (`apps/api/src/classes/bookings.service.ts`). A waitlist entry holds no seat
// and costs nothing until it is promoted — at which point the *promoted*
// member's pack is charged.
//
// So booking and cancelling both move a number the Profile screen renders, and
// both must invalidate `queryKeys.creditPacks(gymId)`. The old app did not, which
// is how a member could book three classes and still be shown their opening
// balance. That edge is in the invalidation matrix, not in a comment on a screen.

import type {
  BookClassInstanceResponse,
  CancelBookingResponse,
  ListMemberBookingsQuery,
  ListMemberBookingsResponse,
} from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/** Arguments for {@link bookClass}. */
export interface BookClassInput {
  /** The occurrence to book. */
  classId: string;
  /**
   * An optional `Idempotency-Key`. A repeat with the same key returns the
   * original booking (`idempotentReplay: true`) instead of taking a second seat
   * — and, crucially, instead of spending a second class credit. Mint one per
   * logical attempt (not per retry) and reuse it across retries; ≤200 chars, or
   * the server answers `400`.
   */
  idempotencyKey?: string;
}

/**
 * `POST /class-instances/:id/bookings` — book the caller in, or queue them.
 *
 * Answers **`200`, not `201`**, on both a fresh booking and an idempotent
 * replay, so a retry is byte-identical; the distinction is the body's
 * `idempotentReplay`. A full occurrence is still a success with
 * `status: 'WAITLIST'`.
 *
 * Failure modes worth branching on (`ApiError.code`): `CLASS_NOT_BOOKABLE`
 * (409 — canceled/completed), `ALREADY_BOOKED` (409),
 * `IDEMPOTENCY_KEY_REUSED` (409), `NOT_FOUND` (404).
 */
export async function bookClass(
  input: BookClassInput,
  options: FetchOptions = {},
): Promise<BookClassInstanceResponse> {
  return apiJson<BookClassInstanceResponse>(
    endpointPath(ENDPOINTS.bookClass, { id: input.classId }),
    {
      method: ENDPOINTS.bookClass.method,
      headers: input.idempotencyKey ? { 'Idempotency-Key': input.idempotencyKey } : undefined,
      signal: options.signal,
    },
  );
}

/**
 * `DELETE /class-instances/:id/bookings` — release the caller's seat.
 *
 * The response's `promotedBookingId` names the waitlist entry auto-promoted into
 * the freed seat, or `null` when nothing was promoted; when a promotion happened
 * `bookedCount` is unchanged, because the seat moved rather than freed.
 *
 * `CANCELLATION_WINDOW_PASSED` (409) is the one a screen must render specially:
 * the gym's cutoff has passed, and the credit is *not* refunded.
 */
export async function cancelBooking(
  input: { classId: string },
  options: FetchOptions = {},
): Promise<CancelBookingResponse> {
  return apiJson<CancelBookingResponse>(
    endpointPath(ENDPOINTS.cancelBooking, { id: input.classId }),
    {
      method: ENDPOINTS.cancelBooking.method,
      signal: options.signal,
    },
  );
}

/**
 * `GET /me/bookings?scope=upcoming|past|all` — the caller's booking history.
 *
 * The member is resolved from the session; there is no member id on the wire.
 * Each row embeds the full occurrence detail, so a list renders cards and deep
 * links without a second round trip per row.
 */
export async function listMyBookings(
  params: Partial<ListMemberBookingsQuery> = {},
  options: FetchOptions = {},
): Promise<ListMemberBookingsResponse> {
  return apiJson<ListMemberBookingsResponse>(endpointPath(ENDPOINTS.listMyBookings), {
    method: ENDPOINTS.listMyBookings.method,
    query: { scope: params.scope },
    signal: options.signal,
  });
}
