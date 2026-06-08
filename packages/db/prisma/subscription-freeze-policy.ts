// T8.4 — Subscription freeze (pause) policy.
//
// The pure, framework-agnostic rules behind the freeze/pause flow, sitting beside
// the {@link applyEvent} state machine (T8.3): the state machine owns *whether* a
// FREEZE/UNFREEZE transition is legal, this module owns the *policy* around it —
// how long a member may freeze (the per-plan allowance) and how much paid time a
// resume gives back. Like the state machine it imports nothing framework-specific,
// so the API service composes it and the unit tests exercise it directly.
//
// Two quantities drive the flow:
//   • The allowance: a plan grants `freezeDaysPerPeriod` days of freeze per billing
//     period. Each freeze commits its requested duration against a running
//     `freezeDaysUsed` counter; a request that would overrun the cap is rejected.
//   • The compensation: a frozen membership grants no access, so on resume the
//     `currentPeriodEnd` is pushed out by the days actually spent frozen — the full
//     duration on an auto-resume, fewer when the member unfreezes early.

/** Milliseconds in a day — the unit the freeze allowance and compensation count in. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The default per-plan freeze allowance (days per billing period) a subscription
 * plan is created with. Mirrors the `@default(30)` on `SubscriptionPlan.
 * freezeDaysPerPeriod` so the policy default lives in one place the API and the
 * schema agree on. A plan with an allowance of `0` does not permit freezing.
 */
export const DEFAULT_FREEZE_DAYS_PER_PERIOD = 30;

/**
 * The verdict of checking a freeze request against the plan allowance.
 * `remainingDays` is what is left of the period's allowance *before* this request
 * (so a caller can surface "you have N days left" on rejection); `allowed` is
 * whether `durationDays` fits within it.
 */
export interface FreezeAllowance {
  allowed: boolean;
  remainingDays: number;
}

/**
 * Check a freeze of `durationDays` against the plan's `freezeDaysPerPeriod`
 * allowance given the days already committed this period (`freezeDaysUsed`).
 *
 * `remainingDays` is the allowance left before this request — `max(0, cap - used)`
 * — and the request is `allowed` only when its whole duration fits inside it. A
 * cap of `0` (freezing disabled) leaves `remainingDays` at 0, so every request is
 * rejected. Inputs are treated as whole days; a non-positive `durationDays` is not
 * a legal freeze and is rejected.
 */
export function evaluateFreezeAllowance(input: {
  freezeDaysPerPeriod: number;
  freezeDaysUsed: number;
  durationDays: number;
}): FreezeAllowance {
  const remainingDays = Math.max(0, input.freezeDaysPerPeriod - input.freezeDaysUsed);
  const allowed = input.durationDays > 0 && input.durationDays <= remainingDays;
  return { allowed, remainingDays };
}

/** `date` advanced by `days` whole days, without mutating the input. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/**
 * The auto-resume instant of a freeze: `startDate` plus `durationDays`. This is the
 * `frozenUntil` stamped on the subscription and the upper bound on the access the
 * resume compensates for.
 */
export function freezeUntil(startDate: Date, durationDays: number): Date {
  return addDays(startDate, durationDays);
}

/**
 * The number of whole days a freeze actually consumed by the time it resumes at
 * `now` — the amount `currentPeriodEnd` is pushed out to give the paused-for time
 * back. Measured from `frozenAt` and capped at `frozenUntil` (resuming after the
 * scheduled end never credits more than the booked duration; the early-unfreeze
 * case credits only the elapsed days). Never negative — a resume at or before the
 * freeze started compensates nothing.
 */
export function resumeExtensionDays(frozenAt: Date, frozenUntil: Date, now: Date): number {
  const cappedNow = now.getTime() > frozenUntil.getTime() ? frozenUntil : now;
  const elapsedMs = cappedNow.getTime() - frozenAt.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }
  return Math.round(elapsedMs / MS_PER_DAY);
}
