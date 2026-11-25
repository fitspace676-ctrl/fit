// Reconstructing a subscription's history from the row it left behind.
//
// There is no per-status event log, so "was this membership in force at instant
// X" is derived from the row: its current period, `status`, `createdAt`,
// `canceledAt` and `updatedAt`. The rule at `now` is EXACTLY the dashboard's
// active rule (`common/live-membership.util.ts`, #441): a TRIAL / ACTIVE /
// PAST_DUE membership whose period contains the instant, on an ACTIVE account.
// A period that is over is not in force whatever the status column says, and a
// FROZEN membership is not "active" (it is its own figure).
//
// History is approximate where the row cannot remember it: a subscription renewed
// in place keeps one row, so its earlier periods are taken to run back to
// `createdAt`; a row that moved `ACTIVE → FROZEN` is taken to have been active
// until `updatedAt`; and the ACCOUNT's state is today's, applied to the past.
//
// Shared by the Members tab (active trend, retention, churn) and the Revenue tab
// (MRR trend, revenue per member) so the two can never answer "how many members
// are active" differently.

import { SubscriptionStatus } from '@fit/db';

/** The subscription fields every reconstruction here reads. */
export interface SubscriptionTimelineRow {
  memberId: string;
  status: SubscriptionStatus;
  createdAt: Date;
  canceledAt: Date | null;
  updatedAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  /**
   * `false` when the member's account is not ACTIVE (suspended or invited): such a
   * person is never counted active, as at check-in. Omitted means active.
   */
  accountActive?: boolean;
}

function earlier(a: Date, b: Date): Date {
  return a < b ? a : b;
}

/**
 * When a subscription's membership ended (or will end), or `null` for a FROZEN
 * one, which is open-ended until it resumes.
 *
 *  • CANCELED — when it was cancelled (`canceledAt`, else `updatedAt`), but never
 *    after the period it was cancelled in.
 *  • EXPIRED  — the end of its period. `updatedAt` only when that is earlier: an
 *    import or a later edit touches `updatedAt` long after the membership ran out,
 *    and dating the expiry by it put a whole history of expiries on import day.
 *  • TRIAL / ACTIVE / PAST_DUE — the end of the current period, which may still
 *    be ahead. The caller compares it with the instant it asks about.
 */
export function churnMoment(sub: SubscriptionTimelineRow): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED) {
    return earlier(sub.canceledAt ?? sub.updatedAt, sub.currentPeriodEnd);
  }
  if (sub.status === SubscriptionStatus.EXPIRED) {
    return earlier(sub.updatedAt, sub.currentPeriodEnd);
  }
  if (sub.status === SubscriptionStatus.FROZEN) return null;
  return sub.currentPeriodEnd;
}

/**
 * When a subscription's membership began, as far as the row remembers. A period
 * that has not started yet starts at its own start (a scheduled membership is not
 * in force before it); one that has may have been renewed in place, so it runs
 * back to when the row was created.
 */
function liveFrom(sub: SubscriptionTimelineRow, now: Date): Date {
  return sub.currentPeriodStart > now
    ? sub.currentPeriodStart
    : earlier(sub.createdAt, sub.currentPeriodStart);
}

/**
 * Whether a subscription was a membership in force at `at` (inclusive at both
 * ends: in force AT its last instant, not after). At `at = now` this is the
 * dashboard's active rule exactly.
 */
export function wasLiveAt(sub: SubscriptionTimelineRow, at: Date, now = new Date()): boolean {
  if (sub.accountActive === false) return false;
  if (at < liveFrom(sub, now)) return false;
  if (sub.status === SubscriptionStatus.FROZEN) {
    // In force until it was frozen, frozen since.
    return at < sub.updatedAt && at <= sub.currentPeriodEnd;
  }
  // A terminal row was in force until it ended; a live-status row while its
  // period runs. Either way, up to and including `churnMoment`.
  const end = churnMoment(sub);
  return end !== null && at <= end;
}

/** Whether a subscription is a FROZEN membership now (its own figure, not active). */
export function isFrozen(sub: SubscriptionTimelineRow): boolean {
  return sub.status === SubscriptionStatus.FROZEN;
}

/** The distinct members holding a membership in force at `at`. */
export function liveMembersAt(
  subs: SubscriptionTimelineRow[],
  at: Date,
  now = new Date(),
): Set<string> {
  const ids = new Set<string>();
  for (const sub of subs) {
    if (wasLiveAt(sub, at, now)) ids.add(sub.memberId);
  }
  return ids;
}

/** How many distinct members held a membership in force at `at`. */
export function liveCountAt(subs: SubscriptionTimelineRow[], at: Date, now = new Date()): number {
  return liveMembersAt(subs, at, now).size;
}
