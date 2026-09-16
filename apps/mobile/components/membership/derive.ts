// @fit/mobile — the membership numbers, derived in ONE place.
//
// ===========================================================================
// THIS MODULE EXISTS BECAUSE OF THE `ACTIVE` / `22 / 30` / `73%` CARD.
//
// §1 of `docs/mobile-rebuild-plan.md` names the deleted app's home screen as
// one of the reasons the app was deleted: its membership card was three
// hardcoded literals. Every one of those numbers is on `GET /me/subscription`
// — `status`, `currentPeriodStart`, `currentPeriodEnd` — and the only work
// needed was to subtract two instants.
//
// The card now appears on THREE screens (home, profile, membership), which is
// exactly the shape that produces three slightly different subtractions and
// then a bug report saying "the phone says 8 days and the web says 9". So the
// arithmetic lives here, once, and the screens interpolate its output into
// copy. Nothing in this file returns a sentence: sentences need a locale, and
// the locale belongs to the screen.
//
// ---------------------------------------------------------------------------
// THREE THINGS THAT ARE DECISIONS RATHER THAN TRANSCRIPTION.
//
//   1. `CANCELED` COUNTS AS HAVING A PLAN while the period has not lapsed. A
//      cancelled-but-unexpired subscription is still in force — the member paid
//      for the month and can still train. The period check in
//      {@link billingPeriodProgress} is what ends it, not the status. This
//      mirrors `apps/web/.../home/page.tsx`'s `ACTIVE_STATUSES` exactly, on
//      purpose: two surfaces reading one endpoint must not disagree about
//      whether the member has a membership.
//
//   2. `PAST_DUE` COUNTS TOO. The plan is live and the member may train; what
//      is wrong is the payment, and `member.membership.pastDue.*` is the copy
//      that says so. Hiding the card would hide the only place that says it.
//
//   3. NO PERIOD ⇒ NO METER. `daysTotal === 0` means the caller draws NO
//      progress indicator at all, rather than a 0% bar. A bar at zero reads as
//      "your membership is spent"; an absent bar reads as "there is nothing to
//      show", which is the truth. `MembershipBlock` makes this cheap —
//      `progressValue` is optional and the whole indicator disappears with it.
//
// ---------------------------------------------------------------------------
// WHAT CANNOT BE BUILT FROM THIS PAYLOAD, AND IS THEREFORE NOT HERE.
//
// **There is no "cancel membership".** `MeSubscription` exposes
// `cancelAtPeriodEnd`, which reads like the backing field for a toggle, and it
// is not: the only member-callable subscription routes are enroll / freeze /
// unfreeze (`apps/mobile/lib/api/endpoints.ts`). Cancellation lives on
// `admin/subscriptions` behind `BillingManage`, which a `MEMBER` token does not
// hold. So `cancelAtPeriodEnd` is rendered as the STATUS LINE
// `member.membership.cancelNotice` — "Set to cancel - won't renew." — and there
// is no affordance beside it. See {@link isSetToCancel}.

import type { CreditPackSummary, MeSubscription, MeSubscriptionStatus } from '@fit/types';

/** Milliseconds in a day. Whole days is the unit every membership number uses. */
const DAY_MS = 86_400_000;

/**
 * The statuses that mean "this member currently has a plan".
 *
 * See decisions 1 and 2 in the header for why `PAST_DUE` and `CANCELED` are in
 * the set. `TRIAL` is in it because a trial is a live membership that can book.
 */
export const ACTIVE_STATUSES: readonly MeSubscriptionStatus[] = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
];

/** Does this subscription entitle the member to train right now? */
export function hasLivePlan(subscription: MeSubscription | null | undefined): boolean {
  if (!subscription) return false;
  return ACTIVE_STATUSES.includes(subscription.status);
}

/** Is the plan paused? `frozenUntil` is the instant it resumes on its own. */
export function isFrozen(subscription: MeSubscription | null | undefined): boolean {
  return subscription?.status === 'FROZEN';
}

/**
 * Is the plan set to lapse at the end of this period?
 *
 * A STATUS, not a control. There is no member route that sets or clears it —
 * see the header. The screens render `member.membership.cancelNotice` beside
 * the renewal date and offer nothing to press.
 */
export function isSetToCancel(subscription: MeSubscription | null | undefined): boolean {
  return subscription?.cancelAtPeriodEnd === true;
}

/** How far through the billing period the member is. */
export interface BillingPeriod {
  /** Whole days elapsed, clamped into `[0, daysTotal]`. */
  readonly daysUsed: number;
  /** Whole days the period spans. `0` when there is no dated period. */
  readonly daysTotal: number;
  /** `daysTotal - daysUsed`. `0` when there is no dated period. */
  readonly daysLeft: number;
  /** Is there a period to draw at all? `false` ⇒ draw no meter. */
  readonly hasPeriod: boolean;
}

/** No dated period — the value every unusable subscription resolves to. */
const NO_PERIOD: BillingPeriod = { daysUsed: 0, daysTotal: 0, daysLeft: 0, hasPeriod: false };

/**
 * The billing period as whole days, from the two ISO instants the API sends.
 *
 * Defensive about three real shapes the wire can carry — an absent period, an
 * unparseable instant, and an end that is not after the start — because each
 * one produces a `NaN` width that React Native renders as a crash rather than
 * as a wrong bar. All three answer {@link NO_PERIOD}, i.e. "draw nothing".
 */
export function billingPeriodProgress(
  subscription: MeSubscription | null | undefined,
  now: Date,
): BillingPeriod {
  const start = subscription?.currentPeriodStart;
  const end = subscription?.currentPeriodEnd;
  if (start === undefined || end === undefined) return NO_PERIOD;

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return NO_PERIOD;

  const daysTotal = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
  const elapsed = Math.round((now.getTime() - startMs) / DAY_MS);
  const daysUsed = Math.min(daysTotal, Math.max(0, elapsed));
  return { daysUsed, daysTotal, daysLeft: daysTotal - daysUsed, hasPeriod: true };
}

/**
 * The percentage a meter should draw, `0`–`100`.
 *
 * Returns `null` — not `0` — when there is no period, so the caller's
 * `progressValue={percent ?? undefined}` removes the indicator instead of
 * drawing an empty one. See decision 3.
 */
export function periodPercent(period: BillingPeriod): number | null {
  if (!period.hasPeriod) return null;
  return Math.round((period.daysUsed / period.daysTotal) * 100);
}

/** The freeze allowance, as the freeze sheet has to reason about it. */
export interface FreezeAllowance {
  /** Whole days still available this period. */
  readonly remaining: number;
  /** Days already committed against this period. */
  readonly used: number;
  /** The plan's per-period grant. `0` ⇒ the plan has no freeze feature. */
  readonly perPeriod: number;
  /** Does the plan offer freezes at all? */
  readonly offered: boolean;
  /** Is there anything left to spend? */
  readonly available: boolean;
}

/**
 * The freeze allowance off `GET /me/subscription`.
 *
 * The whole reason it is on that payload is so a sheet can DISABLE its control
 * rather than discover the plan's limit as a `400` — which is what
 * `useSubscriptionMutations.ts` says in as many words. `offered` and
 * `available` are separate because they have different copy:
 * `member.membership.freeze.notAvailable` ("your plan doesn't include
 * freezes") versus `.exhausted` ("you've used all your freeze days").
 */
export function freezeAllowance(subscription: MeSubscription | null | undefined): FreezeAllowance {
  const perPeriod = subscription?.freezeDaysPerPeriod ?? 0;
  const used = subscription?.freezeDaysUsed ?? 0;
  const remaining = subscription?.freezeDaysRemaining ?? 0;
  return {
    perPeriod,
    used,
    remaining,
    offered: perPeriod > 0,
    available: remaining > 0,
  };
}

/**
 * The freeze durations the sheet offers, in days, narrowed to the allowance.
 *
 * `member.profile.mobile.freezeSheet` carries exactly three options — 2 weeks,
 * 1 month, 2 months — so the set is copy-driven rather than invented. An option
 * longer than the remaining allowance is dropped instead of being offered and
 * refused; if every one is too long, the member's own remaining count is
 * offered as `optDays`, which is the one honest choice left.
 */
export const FREEZE_OPTION_DAYS = [14, 30, 60] as const;

/** A duration the freeze sheet may offer. */
export interface FreezeOption {
  /** Whole days. */
  readonly days: number;
  /**
   * Which `member.profile.mobile.freezeSheet` key names it, or `null` for the
   * remainder option, which the caller renders with `optDays`.
   */
  readonly key: 'opt2w' | 'opt1m' | 'opt2m' | null;
}

const OPTION_KEYS: Readonly<Record<number, FreezeOption['key']>> = {
  14: 'opt2w',
  30: 'opt1m',
  60: 'opt2m',
};

/** The options a member with `remaining` days may actually pick. */
export function freezeOptions(remaining: number): FreezeOption[] {
  const fits = FREEZE_OPTION_DAYS.filter((days) => days <= remaining).map((days) => ({
    days,
    key: OPTION_KEYS[days] ?? null,
  }));
  if (fits.length > 0) return fits;
  return remaining > 0 ? [{ days: remaining, key: null }] : [];
}

// ── Credit packs ───────────────────────────────────────────────────────────
//
// The PT-credit strip on home and on profile, and the "2/3" figure with its
// pips. Two totals, summed across every pack the member holds, because
// `GET /members/me/credit-packs` returns packs and the artboard draws a
// balance.

/** The member's PT-credit balance, across every pack they hold. */
export interface CreditBalance {
  /** Credits still spendable. */
  readonly remaining: number;
  /** Credits the packs were bought with. `0` ⇒ the member has never bought one. */
  readonly total: number;
  /** Does the member hold any pack at all? */
  readonly hasPacks: boolean;
}

/** Sum the balances. A booking spends one of these, which is why it is live. */
export function creditBalance(packs: readonly CreditPackSummary[] | undefined): CreditBalance {
  const list = packs ?? [];
  let remaining = 0;
  let total = 0;
  for (const pack of list) {
    remaining += pack.remainingCredits;
    total += pack.totalCredits;
  }
  return { remaining, total, hasPacks: list.length > 0 };
}
