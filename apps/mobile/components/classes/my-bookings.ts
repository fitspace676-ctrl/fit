// @fit/mobile — "am I on this class?", as a lookup.
//
// `GET /class-instances` is `@Public()` and its card shape carries no member
// state at all — there is no `status` on `ClassInstanceCard`, by design, because
// the same endpoint serves the gym's public web site. The member's own side
// comes from `GET /me/bookings`, whose rows embed the full occurrence. So the
// screen holds two queries and joins them here.
//
// The join is by `classInstance.id` rather than by index or by title, and it is
// written once because the list card and the detail's sticky bar must never
// disagree about whether the member is booked — the same reason `ClassCard`
// derives `spotsLeft` itself.

import type { ListMemberBookingsResponse } from '@fit/types';
import type { ClassCardStatus } from '@fit/ui-mobile';

import { sectionPhase, type SectionPhase, type SectionQueryLike } from '../home/section';

/** The member's standing on one class. */
export interface MyBooking {
  /** What `ClassCard` needs: a seat, a queue place, or nothing. */
  readonly status: ClassCardStatus;
  /** 1-based queue place while waitlisted, else `null`. */
  readonly waitlistPosition: number | null;
}

/** Nothing booked — the value every unlisted class resolves to. */
export const NO_BOOKING: MyBooking = { status: null, waitlistPosition: null };

/**
 * Class instance id → the member's standing on it.
 *
 * Only `BOOKED` and `WAITLIST` produce a state: `ATTENDED` / `NO_SHOW` are past
 * classes and `CANCELED` is a booking the member gave up, none of which should
 * make a bookable class render as taken. `memberBookingStatusSchema` carries all
 * five, so this narrowing is the whole reason the function exists.
 */
export function bookingsByClassId(
  data: ListMemberBookingsResponse | undefined,
): Record<string, MyBooking> {
  const map: Record<string, MyBooking> = {};
  for (const entry of data?.bookings ?? []) {
    if (entry.status !== 'BOOKED' && entry.status !== 'WAITLIST') continue;
    map[entry.classInstance.id] = {
      status: entry.status,
      waitlistPosition: entry.waitlistPosition,
    };
  }
  return map;
}

/**
 * The phase of the BOOKINGS half of the join — the half that is easy to forget.
 *
 * ===========================================================================
 * A STATUS DERIVED FROM THE ABSENCE OF DATA IN A QUERY NOBODY CHECKED.
 *
 * `bookingsByClassId(undefined)` returns `{}`, every lookup misses, and every
 * card renders `status: null` — "Book". That is not "we do not know yet"; it is
 * a positive claim that the member is NOT booked, drawn as a button, made on no
 * evidence at all. Pressing it returns `409 ALREADY_BOOKED`.
 *
 * It is the same failure as the deleted app's hardcoded `ACTIVE` / `22/30`,
 * wearing different clothes, and Home already refuses it in as many words
 * (`app/(tabs)/home.tsx`: "without the member's own bookings every class would
 * render as un-booked, which is a lie with a button attached"). Its two
 * siblings — the classes list and the class detail — did not, which is what
 * this exists to fix. Fold the result into `combinePhases` with the class
 * query's own phase and the error box appears instead of the lie.
 *
 * ---------------------------------------------------------------------------
 * WHY `signedIn` IS A PARAMETER AND NOT AN OVERSIGHT.
 *
 * `GET /me/bookings` is scoped by the SESSION's gym (`useMyBookings` →
 * `useGymId`), so on these two PUBLIC routes a signed-out visitor has the query
 * DISABLED — `isPending: true`, `fetchStatus: 'idle'`, `data: undefined`,
 * forever. `sectionPhase` reads that as `loading`, which would skeleton the
 * whole public schedule for the rest of the session: precisely the
 * forever-skeleton §7 records the discovery-gym gap for.
 *
 * And signed out there is no booking to miss. `{}` is then the TRUTH rather
 * than a guess, so the phase is trivially `ready`.
 */
export function myBookingsPhase(
  query: SectionQueryLike,
  online: boolean,
  signedIn: boolean,
): SectionPhase {
  return signedIn ? sectionPhase(query, online) : 'ready';
}
