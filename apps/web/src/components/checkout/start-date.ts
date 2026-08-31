// @fit/web — the join wizard's start-date copy rule.
//
// The picker's BOUNDS come from `@fit/types` (`startDateBounds`), shared with the
// API so the form and the server cannot disagree about which days are allowed.
// What lives here is the other half a buyer needs: saying the window out loud,
// under the field, in a sentence built from the gym's own setting rather than
// written into a catalogue — so widening a fortnight to a month updates the hint
// with no copy change.
//
// It is a key selector rather than a formatted string because the sentence has
// to exist in both locales, and choosing the wording is the only part of that
// which is logic.

import type { GymStartDatePolicy } from '@fit/types';

/** A message under `checkout.details.fields` describing the start-date window. */
export type StartDateHintKey = 'startDateHintToday' | 'startDateHintAhead' | 'startDateHintWindow';

/**
 * Which sentence describes `policy`.
 *
 * `maxDaysAhead: 0` is its own wording in both directions — the window is a
 * single day, and "the next 0 days" is not a sentence a buyer should ever be
 * shown. It wins over `allowPast` because a zero-width window that opens
 * backwards is still just today.
 *
 * `allowPast` gets the symmetric phrasing because {@link startDateBounds} opens
 * the window as far back as it reaches forward: a gym allowing backdating with a
 * 14-day window accepts a month, centred on today, and a hint that mentioned
 * only the forward half would be wrong about half of it.
 */
export function startDateHintKey(policy: GymStartDatePolicy): StartDateHintKey {
  if (policy.maxDaysAhead === 0) return 'startDateHintToday';
  return policy.allowPast ? 'startDateHintWindow' : 'startDateHintAhead';
}
