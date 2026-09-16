// @fit/mobile — everything Home computes, as pure functions.
//
// ===========================================================================
// HOME AGGREGATES SEVEN ENDPOINTS AND DERIVES A DOZEN NUMBERS FROM THEM.
//
// Every one of those numbers is a chance to ship `22 / 30` again, so they are
// all here, all pure, and all tested — rather than inline in a 600-line screen
// where a reviewer reads past them.
//
// The rule this file is written to: **a figure on Home is a fact the API sent,
// or it is not on Home.** Where the artboard draws a number the API cannot
// answer, the tile is absent — not zero, not estimated, not "coming soon".
//
// ---------------------------------------------------------------------------
// WHAT THE ARTBOARD ASKS FOR THAT THE API CANNOT ANSWER.
//
//   `member.home.dayStreak` ("Day streak") and `member.home.checkInsMonth`
//   ("Check-ins") both need a CHECK-IN LOG. There is none: the only check-in
//   surface on the API is `@Controller('admin/check-ins')`, behind
//   `MemberRead` / `MemberWrite`, which a `MEMBER` token cannot call — the
//   same finding that closed Q1 and removed the QR screen (plan §7). The web
//   dashboard fakes the streak as `Math.min(attendedCount, 30)`, which is not
//   a streak; it is the attended count wearing a streak's label. Neither key
//   is read here and neither tile is drawn.
//
//   What IS real is the member's own booking history: `GET /me/bookings`
//   carries every status in the lifecycle, so "classes booked" and "classes
//   attended" are counts of rows, not estimates. Those are the tiles Home
//   draws, beside the PT-credit balance, which is a live server figure.
//
// ---------------------------------------------------------------------------
// TIME IS THE DEVICE'S WALL CLOCK, THROUGHOUT.
//
// Web reads every instant in the gym's IANA zone through
// `Intl.DateTimeFormat({timeZone})`. `Intl` is banned in this app (the
// catalogues exist because no runtime we ship carries Georgian locale data)
// and `createDateTimeFormat` is UTC-only, so mobile renders the device's wall
// clock via the one `wallClock()` shift in `components/services/date-format.ts`.
// Plan §7 records the decision and the one web bug it avoids.
//
// The COMPARISONS below (`>= now`) are on raw instants, never on shifted ones:
// a `wallClock()` result is deliberately not the same moment in time and must
// never be compared against `Date.now()`.

import type { MemberBookingHistoryEntry, MemberServiceSession } from '@fit/types';

/** How many upcoming bookings the bookings section shows. */
export const UPCOMING_LIMIT = 5;

/** How many products the shop rail shows. */
export const SHOP_RAIL_LIMIT = 4;

/** How many services the services section shows. */
export const SERVICES_LIMIT = 3;

/**
 * How many trainers the trainers section shows.
 *
 * A teaser, like the shop rail: the roster is `/trainers`, which the section's
 * own button goes to. Three is what fits under the fold on a 390×844 screen
 * without pushing the shop off the end of the page.
 */
export const TRAINERS_LIMIT = 3;

function startsAtMs(entry: MemberBookingHistoryEntry): number {
  return new Date(entry.classInstance.startsAt).getTime();
}

/**
 * The member's still-to-happen bookings, soonest first.
 *
 * `BOOKED` and `WAITLIST` only: `ATTENDED` / `NO_SHOW` are in the past by
 * definition and `CANCELED` is a seat the member gave up — none of the three
 * belongs under a heading that says "upcoming". The time filter is separate
 * from the status filter because a `BOOKED` row whose class has already
 * started is also not upcoming, and the server's `scope` parameter is not
 * trusted to have been passed.
 */
export function upcomingBookings(
  bookings: readonly MemberBookingHistoryEntry[] | undefined,
  now: Date,
): MemberBookingHistoryEntry[] {
  const nowMs = now.getTime();
  return (bookings ?? [])
    .filter((entry) => entry.status === 'BOOKED' || entry.status === 'WAITLIST')
    .filter((entry) => {
      const ms = startsAtMs(entry);
      return Number.isFinite(ms) && ms >= nowMs;
    })
    .sort((a, b) => startsAtMs(a) - startsAtMs(b));
}

/** How many bookings the member has ever made, in any state. */
export function totalBookings(bookings: readonly MemberBookingHistoryEntry[] | undefined): number {
  return (bookings ?? []).length;
}

/**
 * How many classes the member actually attended.
 *
 * The one attendance fact the API gives a member: staff mark the roster
 * (`POST /admin/class-instances/:id/attendance`) and the resulting `ATTENDED`
 * status is echoed on the member's own history. Not a check-in count — see the
 * header — but a real, recorded visit to a class.
 */
export function attendedCount(bookings: readonly MemberBookingHistoryEntry[] | undefined): number {
  return (bookings ?? []).filter((entry) => entry.status === 'ATTENDED').length;
}

/** How many of the member's bookings are currently a waitlist place. */
export function waitlistCount(bookings: readonly MemberBookingHistoryEntry[] | undefined): number {
  return (bookings ?? []).filter((entry) => entry.status === 'WAITLIST').length;
}

/**
 * The member's next booked personal-training session, or `null`.
 *
 * `BOOKED` only. A member can book a PT session but **cannot release one** —
 * `admin/service-sessions/:id/cancel` is `ClassWrite` (plan §7) — so this row
 * carries no cancel affordance anywhere in the app, and that absence is
 * deliberate rather than unfinished.
 */
export function nextServiceSession(
  sessions: readonly MemberServiceSession[] | undefined,
  now: Date,
): MemberServiceSession | null {
  const nowMs = now.getTime();
  const upcoming = (sessions ?? [])
    .filter((session) => session.status === 'BOOKED')
    .filter((session) => {
      const ms = new Date(session.startsAt).getTime();
      return Number.isFinite(ms) && ms >= nowMs;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return upcoming[0] ?? null;
}
