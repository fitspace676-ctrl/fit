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
 * The dunning retry ladder (T5.5): the offsets, in whole days from the elapsed
 * `currentPeriodEnd`, at which the job re-attempts a failed renewal charge. A member
 * keeps access through the whole ladder (`PAST_DUE` is an entitled status). After
 * the initial period-end charge fails (`ACTIVE → PAST_DUE`, retry 0), the job retries
 * on day +2, +5 and +7; if the day-+7 retry also fails the ladder is exhausted and
 * the subscription expires. The last offset is therefore the effective grace window.
 *
 * `readonly` so callers can't mutate the shared default in place.
 */
export const DEFAULT_RENEWAL_RETRY_OFFSET_DAYS: readonly number[] = [2, 5, 7];

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
  /**
   * How many scheduled retries have already failed in the current past-due episode
   * (0 for an `ACTIVE` subscription, or one that just entered `PAST_DUE`). Indexes
   * the retry ladder to place the next attempt; once it reaches the ladder length,
   * the retries are exhausted and the subscription expires.
   */
  paymentRetries: number;
}

/** Knobs for {@link classifyDueSubscription}. */
export interface ClassifyDueOptions {
  /** The instant to evaluate against — a subscription is due when `currentPeriodEnd <= now`. */
  now: Date;
  /**
   * The retry ladder — days after the elapsed `currentPeriodEnd` at which to
   * re-attempt a failed charge, ascending. Defaults to
   * {@link DEFAULT_RENEWAL_RETRY_OFFSET_DAYS}. An empty ladder expires a past-due
   * subscription immediately (no retries).
   */
  retryOffsetDays?: readonly number[];
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
 *   • `expire`  — a `PAST_DUE` subscription whose retry ladder is exhausted; the
 *                 lapse is final.
 *   • `skip`    — nothing to do: not yet due, terminal, frozen (a paused membership
 *                 is not billed until it resumes), or past-due but waiting between
 *                 scheduled retries.
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
 *   2. A `PAST_DUE` subscription drives the retry ladder: its retries exhausted, it
 *      `expire`s; before its next scheduled retry window, it `skip`s; on or after a
 *      retry window, it `charge`s (a retry).
 *   3. Otherwise `charge`: a due `ACTIVE` subscription's renewal, or a due `TRIAL`
 *      subscription's first charge (which the caller's `RENEW` converts to `ACTIVE`).
 *
 * A due `TRIAL` behaves like `ACTIVE` here — it has no retry ladder (`paymentRetries`
 * is 0) — so it either `cancel`s (the member cancelled during the trial: nothing is
 * charged) or `charge`s at trial end. `FROZEN` (paused) and the terminal `CANCELED` /
 * `EXPIRED` states are always `skip` — a frozen membership resumes before it bills
 * again, and terminal ones never bill. `EXPIRE` is only ever returned for `PAST_DUE`,
 * matching the state machine (there is no `ACTIVE → EXPIRED` transition — a fresh
 * failure goes `ACTIVE`/`TRIAL → PAST_DUE` first).
 */
export function classifyDueSubscription(
  sub: BillableSubscription,
  options: ClassifyDueOptions,
): RenewalAction {
  const retryOffsets = options.retryOffsetDays ?? DEFAULT_RENEWAL_RETRY_OFFSET_DAYS;
  const nowMs = options.now.getTime();

  // Only TRIAL / ACTIVE / PAST_DUE subscriptions ever bill: a TRIAL's first charge
  // falls due at trial end (converting it to ACTIVE), an ACTIVE renews, a PAST_DUE
  // retries. Frozen holds the slot but is not charged; terminal states are done.
  if (
    sub.status !== SubscriptionStatus.ACTIVE &&
    sub.status !== SubscriptionStatus.PAST_DUE &&
    sub.status !== SubscriptionStatus.TRIAL
  ) {
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

  // A past-due subscription walks the retry ladder rather than being charged every
  // pass: expire once the rungs are used up, wait between them, else retry now.
  if (sub.status === SubscriptionStatus.PAST_DUE) {
    const retries = Math.max(0, sub.paymentRetries);
    // Ladder exhausted — every scheduled retry has failed, so the lapse is final.
    if (retries >= retryOffsets.length) {
      return { action: 'expire' };
    }
    // The next retry lands `retryOffsets[retries]` days after the elapsed period end
    // (the anchor stays fixed while past-due, so the schedule never drifts). Before
    // that instant there is nothing to do this pass.
    const nextRetryMs = sub.currentPeriodEnd.getTime() + retryOffsets[retries]! * MS_PER_DAY;
    if (nowMs < nextRetryMs) {
      return { action: 'skip' };
    }
    // Otherwise the retry window has opened — fall through to charge it.
  }

  // A renewal charge is owed. The next period is contiguous with the elapsed one so
  // the cadence never drifts, regardless of when the job runs.
  const nextPeriodStart = sub.currentPeriodEnd;
  const nextPeriodEnd = addInterval(sub.currentPeriodEnd, sub.interval);
  return { action: 'charge', nextPeriodStart, nextPeriodEnd };
}
