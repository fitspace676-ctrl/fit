// T5.3 — Subscription billing-period arithmetic.
//
// The pure, framework-agnostic rule for advancing a subscription's paid period by
// one billing interval, sitting beside the freeze policy (T8.4) and the state
// machine (T8.3). Enrolment (T5.3) computes the first `currentPeriodEnd` from the
// start instant; the recurring-billing job (T5.4) advances `currentPeriodEnd` by
// the same interval on each successful renewal — so the two share exactly one
// definition of "one period later" and can never drift.
//
// A period is `count` intervals: days and weeks are a fixed number of days;
// months and years are calendar-correct, not a fixed day count: a `MONTH` advances to the same
// day-of-month next month and a `YEAR` to the same date next year, so a member who
// enrols on the 15th always renews on the 15th. When the target month is shorter
// than the start day (Jan 31 → February, or Feb 29 → a non-leap year) the result is
// clamped to that month's last day rather than spilling into the following month.
// Deliberately distinct from the freeze policy's `addDays`, which counts whole days
// for the pause/compensation math where a fixed duration — not a calendar cadence —
// is what is owed.

import { addDays } from './subscription-freeze-policy';
import { SubscriptionInterval } from '../generated/client';

/**
 * `date` advanced by `count` billing `interval`s (one by default), without
 * mutating the input. `DAY` and `WEEK` add whole days ({@link addDays}); `MONTH`
 * and `YEAR` move the calendar. Computed in UTC so the result is timezone-independent and
 * matches how Prisma stores `DateTime`. The day-of-month is preserved, clamping to
 * the target month's last day when it has fewer days (e.g. Jan 31 + 1 month → Feb
 * 28/29; Feb 29 + 1 year → Feb 28), so the renewal date never rolls into the next
 * month.
 */
export function addInterval(date: Date, interval: SubscriptionInterval, count = 1): Date {
  const steps = Math.max(1, Math.trunc(count));
  if (interval === SubscriptionInterval.DAY) {
    return addDays(date, steps);
  }
  if (interval === SubscriptionInterval.WEEK) {
    return addDays(date, steps * 7);
  }

  const next = new Date(date.getTime());
  const day = next.getUTCDate();

  if (interval === SubscriptionInterval.YEAR) {
    next.setUTCFullYear(next.getUTCFullYear() + steps);
  } else {
    next.setUTCMonth(next.getUTCMonth() + steps);
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
 * whole period from now) and ends `count` `interval`s later per {@link addInterval}.
 * The same shape the enrolment write persists.
 */
export function initialBillingPeriod(
  start: Date,
  interval: SubscriptionInterval,
  count = 1,
): { currentPeriodStart: Date; currentPeriodEnd: Date } {
  return {
    currentPeriodStart: start,
    currentPeriodEnd: addInterval(start, interval, count),
  };
}

/**
 * Roughly how many days one period of `count` `interval`s lasts (a month as 30,
 * a year as 365). For figures that compare plans of different lengths — a
 * monthly-equivalent price, a "30 days" label — never for a period's real dates.
 */
export function approximatePeriodDays(interval: SubscriptionInterval, count = 1): number {
  const steps = Math.max(1, Math.trunc(count));
  switch (interval) {
    case SubscriptionInterval.DAY:
      return steps;
    case SubscriptionInterval.WEEK:
      return steps * 7;
    case SubscriptionInterval.YEAR:
      return steps * 365;
    default:
      return steps * 30;
  }
}

/**
 * A price charged every `count` `interval`s as its monthly equivalent, in the same
 * minor units (not rounded). Whole months and years divide exactly (a yearly
 * price is a twelfth per month, as before); day and week plans go by a 30-day month.
 */
export function monthlyEquivalent(
  priceAmount: number,
  interval: SubscriptionInterval,
  count = 1,
): number {
  const steps = Math.max(1, Math.trunc(count));
  switch (interval) {
    case SubscriptionInterval.MONTH:
      return priceAmount / steps;
    case SubscriptionInterval.YEAR:
      return priceAmount / (steps * 12);
    default:
      return (priceAmount * 30) / approximatePeriodDays(interval, steps);
  }
}

/**
 * The `{ currentPeriodStart, currentPeriodEnd }` of a subscription's **free-trial**
 * period (T5.6): it starts at `start` (enrolment) and ends `trialDays` whole days
 * later — a fixed duration, so this uses {@link addDays} rather than the calendar
 * {@link addInterval} the paid periods advance by. The trial-end `currentPeriodEnd`
 * is when the subscription is *due*: the billing job's first charge there converts
 * `TRIAL → ACTIVE` and the next (paid) period runs one `interval` from that instant,
 * contiguous with the trial, so the renewal cadence anchors on the conversion date.
 * `trialDays` must be `> 0` — a plan with no trial uses {@link initialBillingPeriod}.
 */
export function trialBillingPeriod(
  start: Date,
  trialDays: number,
): { currentPeriodStart: Date; currentPeriodEnd: Date } {
  return {
    currentPeriodStart: start,
    currentPeriodEnd: addDays(start, trialDays),
  };
}
