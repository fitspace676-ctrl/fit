// @fit/mobile — member booking reads + the book / waitlist / cancel actions.
//
// The class-detail screen (T6.4) needs two things the public discovery reads
// (`lib/classes.ts`) don't cover: the caller's *own* booking state for an
// occurrence (am I already booked / waitlisted?) and the mutating actions that
// change it. All three go through the authenticated `apiFetch` client:
//
//   • GET    /me/bookings            — the member's bookings (to find this one)
//   • POST   /class-instances/:id/bookings  — book a seat, or queue on waitlist
//   • DELETE /class-instances/:id/bookings  — cancel / leave the waitlist
//
// The member books *themselves* (the session resolves the member id), so the
// write calls carry no body — only the optional `Idempotency-Key` header that
// makes a retried POST safe. Responses are Zod-validated against `@fit/types`,
// so the wire contract can never silently drift from the API.

import {
  bookClassInstanceResultSchema,
  cancelBookingResultSchema,
  listMemberBookingsResultSchema,
  type BookClassInstanceResult,
  type CancelBookingResult,
  type MemberBookingHistoryEntry,
  type MemberBookingScope,
} from '@fit/types';
import { apiFetch } from './api-client';

/** The booking statuses that represent a *live* hold on an occurrence — a
 * confirmed seat or a waitlist place. `ATTENDED` / `NO_SHOW` / `CANCELED` are
 * terminal and never block a fresh booking, so the detail screen offers Book
 * again once a booking has reached one of them. */
const LIVE_BOOKING_STATUSES = new Set(['BOOKED', 'WAITLIST']);

/** Arguments for {@link fetchMemberBookings}. */
export interface FetchMemberBookingsArgs {
  /** Which slice to load; defaults to the member's full history (`all`). */
  scope?: MemberBookingScope;
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the signed-in member's bookings via `GET /me/bookings`, parsed and
 * validated. The mobile app only reaches this screen behind the auth gate, so a
 * `401`/`403` (no longer a member this token can read) is treated as an empty
 * history rather than an error — the detail screen then simply offers Book.
 */
export async function fetchMemberBookings({
  scope = 'all',
  signal,
}: FetchMemberBookingsArgs = {}): Promise<MemberBookingHistoryEntry[]> {
  const params = new URLSearchParams({ scope });

  const response = await apiFetch(`/me/bookings?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return [];
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load bookings (${response.status})`);
  }

  return listMemberBookingsResultSchema.parse(await response.json()).bookings;
}

/**
 * The caller's live booking for a given occurrence, or `null` when they hold
 * none. "Live" means a confirmed seat (`BOOKED`) or a waitlist place
 * (`WAITLIST`); a `CANCELED` / `ATTENDED` / `NO_SHOW` row is treated as "no
 * current booking", so the screen offers Book again. Drives whether the detail
 * screen shows Book / Join waitlist or a Cancel action.
 */
export function findLiveBooking(
  bookings: MemberBookingHistoryEntry[],
  instanceId: string,
): MemberBookingHistoryEntry | null {
  return (
    bookings.find(
      (entry) => entry.classInstance.id === instanceId && LIVE_BOOKING_STATUSES.has(entry.status),
    ) ?? null
  );
}

/**
 * Book the calling member into an occurrence via
 * `POST /class-instances/:id/bookings`. When the class is full the API queues
 * the member onto the waitlist instead — both are a success, distinguished by
 * the result's `status` (`BOOKED` vs `WAITLIST`). `idempotencyKey` makes a
 * retried request safe (a replay returns the original booking, no second seat);
 * the caller mints one per logical attempt. A non-OK response throws with the
 * API's message so the screen can surface it (e.g. `ALREADY_BOOKED`).
 */
export async function bookClassInstance(
  instanceId: string,
  idempotencyKey?: string,
): Promise<BookClassInstanceResult> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const response = await apiFetch(`/class-instances/${instanceId}/bookings`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw await bookingError(response, 'Failed to book this class');
  }

  return bookClassInstanceResultSchema.parse(await response.json());
}

/**
 * Cancel the calling member's booking for an occurrence via
 * `DELETE /class-instances/:id/bookings` — releasing a confirmed seat (the head
 * of the waitlist is auto-promoted server-side) or leaving the waitlist. A
 * non-OK response throws with the API's message (e.g.
 * `CANCELLATION_WINDOW_PASSED`) so the screen can show why.
 */
export async function cancelBooking(instanceId: string): Promise<CancelBookingResult> {
  const response = await apiFetch(`/class-instances/${instanceId}/bookings`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw await bookingError(response, 'Failed to cancel this booking');
  }

  return cancelBookingResultSchema.parse(await response.json());
}

/** Build an `Error` from a non-OK booking response, preferring the API's own
 * message and falling back to `<fallback> (<status>)`. */
async function bookingError(response: Response, fallback: string): Promise<Error> {
  const detail = (await response.json().catch(() => null)) as { message?: string } | null;
  return new Error(detail?.message ?? `${fallback} (${response.status})`);
}
