// @fit/mobile — the join funnel's start-date window, and the sentence under it.
//
// ===========================================================================
// "TODAY" HERE IS THE **DEVICE'S** WALL CLOCK, NOT THE GYM'S TIME ZONE.
//
// `apps/web`'s `CheckoutScreen` resolves today in the gym's IANA zone:
//
//     new Intl.DateTimeFormat('en-CA', { timeZone, … }).format(new Date())
//
// Mobile cannot. `Intl` is banned outright in this app by a lint rule — the
// catalogues exist because no runtime we ship carries Georgian locale data, and
// Hermes' ICU is a subset of a browser's — and `@fit/i18n`'s
// `createDateTimeFormat` is UTC-only by construction, so there is no second
// route to a zoned calendar day either. Every stage before this one settled on
// the device's wall clock (§7, "Gym-timezone rendering is not possible on
// mobile, and that is a fix"), and this follows that decision rather than
// opening a third answer.
//
// WHAT IT COSTS, stated rather than hidden: a buyer whose phone is a day ahead
// of the gym's zone can be offered a `min` the API rejects — the server
// re-checks with `isStartDateWithinPolicy` against ITS today, so the failure is
// a refused signup, not a bad enrolment. The window is at least a fortnight wide
// by default (`maxDaysAhead: 14`), so the only day this can bite is the very
// first one, and only for a buyer travelling across the date line from their own
// gym. The alternative — shipping a zone database to move that edge case — is
// not proportionate.
// ===========================================================================

import { startDateBounds, type GymStartDatePolicy } from '@fit/types';

import type { MessageKey } from '../../lib/i18n/keys';

/** Today on the device, as the `YYYY-MM-DD` the API speaks. */
export function deviceToday(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  // `getFullYear` / `getMonth` / `getDate` are the LOCAL accessors — the wall
  // clock, deliberately. `toISOString().slice(0, 10)` would be UTC, which is
  // the same bug in a different direction and is silent everywhere east of
  // Greenwich after 4am local.
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The local midnight a `YYYY-MM-DD` day names, or `null` for anything else.
 *
 * The inverse of `schedule.ts`'s `dayKey`, and deliberately built from the LOCAL
 * constructor rather than `new Date(iso)`: `new Date('2026-09-09')` is parsed as
 * UTC midnight, which is the previous day west of Greenwich — the same silent
 * off-by-one {@link deviceToday} refuses `toISOString` for.
 */
export function dayFromIso(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (match === null) return null;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // `new Date(2026, 1, 31)` is 3 March, not an error. A day the calendar does
  // not have is not a day this picker may open on.
  return day.getMonth() === Number(match[2]) - 1 ? day : null;
}

/** The `[min, max]` days the picker may offer, both `YYYY-MM-DD`. */
export function startDateWindow(
  policy: GymStartDatePolicy,
  today: string,
): { min: string; max: string } {
  // The SHARED function, not a local reimplementation: the API validates with
  // `isStartDateWithinPolicy`, which is built on this, so a day the form offers
  // is by construction a day the server accepts.
  return startDateBounds(policy, today);
}

/**
 * Which sentence describes the window.
 *
 * A key selector rather than a formatted string, exactly as `apps/web`'s
 * `start-date.ts` does it: the sentence has to exist in both locales, and
 * choosing the wording is the only part of that which is logic. Widening a
 * fortnight to a month then changes the hint with no copy change at all.
 *
 * `maxDaysAhead: 0` wins over `allowPast` in both directions — a zero-width
 * window that opens backwards is still just today, and "the next 0 days" is not
 * a sentence to show a buyer. `allowPast` gets the symmetric phrasing because
 * `startDateBounds` opens the window as far back as it reaches forward.
 */
export function startDateHintKey(policy: GymStartDatePolicy): MessageKey {
  if (policy.maxDaysAhead === 0) return 'checkout.details.fields.startDateHintToday';
  return policy.allowPast
    ? 'checkout.details.fields.startDateHintWindow'
    : 'checkout.details.fields.startDateHintAhead';
}
