// Reconstructing a subscription's history from the row it left behind.
//
// There is no per-status event log, so "was this live at instant X" is derived
// from `createdAt`, `status`, `canceledAt` and `updatedAt`. That is exact for the
// current state and for a clean cancel/expire, and approximate for a subscription
// that moved between live states in the past (`ACTIVE → FROZEN → ACTIVE`) —
// `updatedAt` remembers only the most recent move.
//
// Shared by the Members tab (active-member trend, retention) and the Revenue tab
// (MRR trend, revenue per member) so the two can never answer "how many members
// are active" differently. Lifted out of `dashboard-members.service.ts`, which
// owned it privately first.

import { isLiveStatus, SubscriptionStatus } from '@fit/db';

/** The subscription fields every reconstruction here reads. */
export interface SubscriptionTimelineRow {
  memberId: string;
  status: SubscriptionStatus;
  createdAt: Date;
  canceledAt: Date | null;
  updatedAt: Date;
}

/** A subscription's terminal instant, or `null` while it is still live. */
export function churnMoment(sub: SubscriptionTimelineRow): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED) return sub.canceledAt ?? sub.updatedAt;
  if (sub.status === SubscriptionStatus.EXPIRED) return sub.updatedAt;
  return null;
}

/** Whether a subscription existed and had not yet ended at `at`. */
export function wasLiveAt(sub: SubscriptionTimelineRow, at: Date): boolean {
  if (sub.createdAt >= at) return false;
  const churnedAt = churnMoment(sub);
  if (churnedAt !== null && churnedAt < at) return false;
  // A live-status row that has not churned was live; a terminal row that churned
  // after `at` was live then too. The isLiveStatus predicate from @fit/db handles
  // type widening correctly; the tuple LIVE_SUBSCRIPTION_STATUSES would not.
  return churnedAt !== null || isLiveStatus(sub.status);
}

/** The distinct members holding at least one live subscription at `at`. */
export function liveMembersAt(subs: SubscriptionTimelineRow[], at: Date): Set<string> {
  const ids = new Set<string>();
  for (const sub of subs) {
    if (wasLiveAt(sub, at)) ids.add(sub.memberId);
  }
  return ids;
}

/** How many distinct members held a live subscription at `at`. */
export function liveCountAt(subs: SubscriptionTimelineRow[], at: Date): number {
  return liveMembersAt(subs, at).size;
}
