// T5.4 — Recurring-billing decision rule.
//
// The pure, framework-agnostic rule the renewal job (T5.4) applies to every
// subscription whose paid period has elapsed: given the subscription's billing
// state and the current instant, decide *what should happen to it* — retry the
// charge, expire a lapsed grace window, honour a scheduled cancellation, or leave
// it alone. It sits beside the billing-period arithmetic (`subscription-period`)
// and the lifecycle state machine (`subscription-state-machine`) so the three pure
// rules the job composes all live in @fit/db and are unit-testable without a
// database, a scheduler, or a payment provider.
//
// The rule is deliberately *classification only*: it decides the branch, and the
// job's service performs the side effects (charging via the payment-provider
// abstraction, advancing the period, transitioning the status). Splitting it this
// way keeps the calendar/grace policy — the part that is easy to get subtly wrong —
// pure and exhaustively testable, while the service stays a thin orchestrator.

import { MS_PER_DAY } from './subscription-freeze-policy';
import { addInterval } from './subscription-period';
import { SubscriptionStatus } from '../generated/client';
import type { SubscriptionInterval } from '../generated/client';

/**
 * How long a subscription may sit `PAST_DUE` (a failed renewal charge) before the
 * job gives up retrying and expires it. Measured in whole days from the elapsed
 * `currentPeriodEnd`. A member keeps access through the grace window (`PAST_DUE` is
 * an entitled status), so this is the retry runway before a lapse becomes final.
 */
export const DEFAULT_RENEWAL_GRACE_DAYS = 7;

/**
 * The subset of a {@link Subscription} the decision rule reads. A structural shape
 * (not the Prisma row) so the rule stays decoupled from the query projection and
 * trivially constructible in tests.
 */
export interface BillableSubscription {
  status: SubscriptionStatus;
  /** End of the currently-paid period — the subscription is *due* once this passes. */
  currentPeriodEnd: Date;
  /** Renewal cadence, snapshotted at enrolment; drives the next period's length. */
  interval: SubscriptionInterval;
  /** A member-requested cancellation that should take effect at period end. */
  cancelAtPeriodEnd: boolean;
}

/** Knobs for {@link classifyDueSubscription}. */
export interface ClassifyDueOptions {
  /** The instant to evaluate against — a subscription is due when `currentPeriodEnd <= now`. */
  now: Date;
  /** Grace-window length in whole days; defaults to {@link DEFAULT_RENEWAL_GRACE_DAYS}. */
  graceDays?: number;
}

/**
 * What the billing job should do with a subscription this pass — a discriminated
 * union so the service `switch`es exhaustively:
 *
 *   • `charge`  — the period has elapsed and a renewal charge is owed. Carries the
 *                 `nextPeriodStart` / `nextPeriodEnd` to persist *iff* the charge
 *                 succeeds, computed contiguously from the old period end so the
 *                 renewal cadence never drifts (a 15th-of-the-month subscriber
 *                 always renews on the 15th, even if the job runs late).
 *   • `cancel`  — the period elapsed on a subscription flagged `cancelAtPeriodEnd`;
 *                 honour the member's scheduled cancellation instead of charging.
 *   • `expire`  — a `PAST_DUE` subscription whose grace window has now elapsed; the
 *                 lapse is final.
 *   • `skip`    — nothing to do: not yet due, terminal, or frozen (a paused
 *                 membership is not billed until it resumes).
 */
export type RenewalAction =
  | { action: 'charge'; nextPeriodStart: Date; nextPeriodEnd: Date }
  | { action: 'cancel' }
  | { action: 'expire' }
  | { action: 'skip' };

/**
 * Classify one subscription for the current billing pass. Pure — no I/O, no charge;
 * it only reads the state and the clock and returns the branch to take.
 *
 * Precedence once a subscription is due (`currentPeriodEnd <= now`):
 *   1. `cancelAtPeriodEnd` wins — the member asked to stop, so we never charge them
 *      for the next period even if the charge would have succeeded.
 *   2. A `PAST_DUE` subscription past its grace window `expire`s — retries are over.
 *   3. Otherwise `charge`: a due `ACTIVE` subscription's first renewal, or a
 *      `PAST_DUE` one still inside its grace window (a retry).
 *
 * `FROZEN` (paused) and the terminal `CANCELED` / `EXPIRED` states are always
 * `skip` — a frozen membership resumes before it bills again, and terminal ones
 * never bill. `EXPIRE` is only ever returned for `PAST_DUE`, matching the state
 * machine (there is no `ACTIVE → EXPIRED` transition — a fresh failure goes
 * `ACTIVE → PAST_DUE` first).
 */
export function classifyDueSubscription(
  sub: BillableSubscription,
  options: ClassifyDueOptions,
): RenewalAction {
  const graceDays = options.graceDays ?? DEFAULT_RENEWAL_GRACE_DAYS;
  const nowMs = options.now.getTime();

  // Only ACTIVE / PAST_DUE subscriptions ever bill. Frozen holds the slot but is
  // not charged; terminal states are done.
  if (sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.PAST_DUE) {
    return { action: 'skip' };
  }

  // Not yet due — the current period is still paid up.
  if (sub.currentPeriodEnd.getTime() > nowMs) {
    return { action: 'skip' };
  }

  // A scheduled cancellation takes effect now rather than renewing.
  if (sub.cancelAtPeriodEnd) {
    return { action: 'cancel' };
  }

  // A past-due subscription whose grace runway has elapsed lapses for good.
  if (sub.status === SubscriptionStatus.PAST_DUE) {
    const graceEndsMs = sub.currentPeriodEnd.getTime() + graceDays * MS_PER_DAY;
    if (nowMs > graceEndsMs) {
      return { action: 'expire' };
    }
  }

  // Otherwise a renewal charge is owed. The next period is contiguous with the
  // elapsed one so the cadence never drifts, regardless of when the job runs.
  const nextPeriodStart = sub.currentPeriodEnd;
  const nextPeriodEnd = addInterval(sub.currentPeriodEnd, sub.interval);
  return { action: 'charge', nextPeriodStart, nextPeriodEnd };
}
