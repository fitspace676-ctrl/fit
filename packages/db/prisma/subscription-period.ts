// T5.3 — Subscription billing-period arithmetic.
//
// The pure, framework-agnostic rule for advancing a subscription's paid period by
// one billing interval, sitting beside the freeze policy (T8.4) and the state
// machine (T8.3). Enrolment (T5.3) computes the first `currentPeriodEnd` from the
// start instant; the recurring-billing job (T5.4) advances `currentPeriodEnd` by
// the same interval on each successful renewal — so the two share exactly one
// definition of "one period later" and can never drift.
//
// Calendar-correct, not a fixed day count: a `MONTH` advances to the same
// day-of-month next month and a `YEAR` to the same date next year, so a member who
// enrols on the 15th always renews on the 15th. When the target month is shorter
// than the start day (Jan 31 → February, or Feb 29 → a non-leap year) the result is
// clamped to that month's last day rather than spilling into the following month.
// Deliberately distinct from the freeze policy's `addDays`, which counts whole days
// for the pause/compensation math where a fixed duration — not a calendar cadence —
// is what is owed.

import { SubscriptionInterval } from '../generated/client';

/**
 * `date` advanced by one billing `interval` (a `MONTH` or a `YEAR`), without
 * mutating the input. Computed in UTC so the result is timezone-independent and
 * matches how Prisma stores `DateTime`. The day-of-month is preserved, clamping to
 * the target month's last day when it has fewer days (e.g. Jan 31 + 1 month → Feb
 * 28/29; Feb 29 + 1 year → Feb 28), so the renewal date never rolls into the next
 * month.
 */
export function addInterval(date: Date, interval: SubscriptionInterval): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();

  if (interval === SubscriptionInterval.YEAR) {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }

  // A shorter target month overflows into the following one (e.g. setting the
  // month to February on a day-31 date lands in March); pulling the date back to
  // day 0 snaps it to the last day of the intended month.
  if (next.getUTCDate() < day) {
    next.setUTCDate(0);
  }

  return next;
}

/**
 * The `{ currentPeriodStart, currentPeriodEnd }` of a subscription's first paid
 * period: it starts at `start` (enrolment is proration-free — the member pays for a
 * whole period from now) and ends one `interval` later per {@link addInterval}. The
 * same shape the enrolment write persists.
 */
export function initialBillingPeriod(
  start: Date,
  interval: SubscriptionInterval,
): { currentPeriodStart: Date; currentPeriodEnd: Date } {
  return {
    currentPeriodStart: start,
    currentPeriodEnd: addInterval(start, interval),
  };
}
