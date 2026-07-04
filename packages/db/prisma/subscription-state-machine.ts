// T8.3 — Subscription lifecycle state machine.
//
// The single source of truth for how a member's {@link Subscription} moves between
// the states of {@link SubscriptionStatus}. Every status change in the app — a
// member or staff freezing/cancelling, the recurring-billing job (a later T8 task)
// flagging a failed charge or expiring a lapsed grace window — goes through
// {@link applyEvent} so an illegal jump (e.g. reviving a CANCELED subscription, or
// freezing one that already expired) is rejected in one place rather than guarded
// ad hoc at each call site.
//
// Design notes:
//   • Pure + framework-agnostic: it imports only the generated `SubscriptionStatus`
//     enum and is consumed both by the API (admin/member actions) and the billing
//     job, so it lives in @fit/db beside `generate-instances` and is re-exported
//     from the package root.
//   • Event-driven: callers express intent ("the renewal charge failed") as a
//     {@link SubscriptionEvent}, not a target status. The machine owns the mapping
//     from (state, event) → next state, which keeps the meaning of each transition
//     in one table instead of scattered `if (status === ...)` checks.
//   • The live set ({@link LIVE_SUBSCRIPTION_STATUSES}) is kept in lock-step with
//     the partial unique index in the migrations: a member holds at most one live
//     subscription per gym, and FROZEN counts as live (a paused membership still
//     occupies the slot).

import { SubscriptionStatus } from '../generated/client';

/**
 * An intent that may move a subscription between states. Callers raise the event
 * that happened; the machine decides the resulting status.
 *
 *   • `RENEW`          — a renewal charge succeeded (the billing job advances the
 *                        period). From `PAST_DUE` this recovers to `ACTIVE`; from
 *                        `TRIAL` the first charge at trial end auto-converts to
 *                        `ACTIVE`; from `ACTIVE` it is a no-op self-loop (period
 *                        advanced, state unchanged).
 *   • `PAYMENT_FAILED` — a renewal charge failed. Moves `ACTIVE` (or a `TRIAL`
 *                        whose first charge failed) into the `PAST_DUE` grace
 *                        window; a repeat failure while already `PAST_DUE` is an
 *                        idempotent self-loop.
 *   • `FREEZE`         — a member/staff request to pause an active membership.
 *   • `UNFREEZE`       — resume a paused membership back to `ACTIVE`.
 *   • `CANCEL`         — end the subscription now (member or staff). Terminal.
 *   • `EXPIRE`         — the grace window elapsed without a successful retry; the
 *                        subscription lapses. Terminal.
 */
export type SubscriptionEvent =
  | 'RENEW'
  | 'PAYMENT_FAILED'
  | 'FREEZE'
  | 'UNFREEZE'
  | 'CANCEL'
  | 'EXPIRE';

/**
 * The transition table: for each current status, the events it accepts and the
 * status each produces. An (status, event) pair absent here is illegal — that is
 * the whole point, so terminal states (`CANCELED`, `EXPIRED`) map to `{}`.
 *
 * `satisfies` (not a type annotation) keeps the literal narrow so
 * {@link availableEvents} can read back the exact event keys per status.
 */
export const SUBSCRIPTION_TRANSITIONS = {
  [SubscriptionStatus.TRIAL]: {
    RENEW: SubscriptionStatus.ACTIVE,
    PAYMENT_FAILED: SubscriptionStatus.PAST_DUE,
    CANCEL: SubscriptionStatus.CANCELED,
  },
  [SubscriptionStatus.ACTIVE]: {
    RENEW: SubscriptionStatus.ACTIVE,
    PAYMENT_FAILED: SubscriptionStatus.PAST_DUE,
    FREEZE: SubscriptionStatus.FROZEN,
    CANCEL: SubscriptionStatus.CANCELED,
  },
  [SubscriptionStatus.PAST_DUE]: {
    RENEW: SubscriptionStatus.ACTIVE,
    PAYMENT_FAILED: SubscriptionStatus.PAST_DUE,
    CANCEL: SubscriptionStatus.CANCELED,
    EXPIRE: SubscriptionStatus.EXPIRED,
  },
  [SubscriptionStatus.FROZEN]: {
    UNFREEZE: SubscriptionStatus.ACTIVE,
    CANCEL: SubscriptionStatus.CANCELED,
  },
  [SubscriptionStatus.CANCELED]: {},
  [SubscriptionStatus.EXPIRED]: {},
} satisfies Record<SubscriptionStatus, Partial<Record<SubscriptionEvent, SubscriptionStatus>>>;

/**
 * Statuses in which a subscription occupies the member's single live slot per gym.
 * Mirrors the partial unique index predicate in the migrations: a member can hold
 * at most one subscription in any of these states at a time. FROZEN is live — a
 * paused membership still holds the slot — and TRIAL is live too: a member on a free
 * trial must let it convert (or cancel) before enrolling again.
 */
export const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
] as const;

/**
 * Terminal statuses — no event moves a subscription out of them. A new enrolment
 * creates a fresh row rather than reviving one of these.
 */
export const TERMINAL_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.CANCELED,
  SubscriptionStatus.EXPIRED,
] as const;

/**
 * Statuses that grant the member access right now. `TRIAL` is entitled — a free
 * trial grants full access during the introductory period; `ACTIVE` is paid up and
 * `PAST_DUE` is still entitled inside its grace window (pending a retry); `FROZEN`
 * is live but paused, so it grants no access. Distinct from
 * {@link LIVE_SUBSCRIPTION_STATUSES}, which is about the uniqueness slot, not access.
 */
export const ENTITLED_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
] as const;

/** True when `status` occupies the member's single live subscription slot. */
export function isLiveStatus(status: SubscriptionStatus): boolean {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}

/** True when `status` is terminal — no further transitions are possible. */
export function isTerminalStatus(status: SubscriptionStatus): boolean {
  return (TERMINAL_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}

/** True when `status` currently grants the member access (paid up or in grace). */
export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return (ENTITLED_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}

/** True when `event` is a legal transition out of `status`. */
export function canApplyEvent(status: SubscriptionStatus, event: SubscriptionEvent): boolean {
  return event in SUBSCRIPTION_TRANSITIONS[status];
}

/**
 * The status `event` would produce from `status`, or `null` if the transition is
 * illegal. The non-throwing companion to {@link applyEvent} — useful for building
 * a UI (which actions to offer) without exception handling.
 */
export function nextStatus(
  status: SubscriptionStatus,
  event: SubscriptionEvent,
): SubscriptionStatus | null {
  const transitions: Partial<Record<SubscriptionEvent, SubscriptionStatus>> =
    SUBSCRIPTION_TRANSITIONS[status];
  return transitions[event] ?? null;
}

/** The events legal from `status`, in declaration order. Empty for terminal states. */
export function availableEvents(status: SubscriptionStatus): SubscriptionEvent[] {
  return Object.keys(SUBSCRIPTION_TRANSITIONS[status]) as SubscriptionEvent[];
}

/**
 * Thrown by {@link applyEvent} when an event is not legal from the current status.
 * Carries the offending `from` status and `event` so a caller (e.g. an API
 * controller) can map it to a 409/422 with a precise message.
 */
export class InvalidSubscriptionTransitionError extends Error {
  constructor(
    readonly from: SubscriptionStatus,
    readonly event: SubscriptionEvent,
  ) {
    super(`Cannot apply "${event}" to a subscription in "${from}"`);
    this.name = 'InvalidSubscriptionTransitionError';
  }
}

/**
 * Apply `event` to a subscription in `status` and return the resulting status,
 * throwing {@link InvalidSubscriptionTransitionError} if the transition is illegal.
 * This is the guarded entry point every status change should funnel through so the
 * legal-transition rule lives in exactly one place.
 */
export function applyEvent(
  status: SubscriptionStatus,
  event: SubscriptionEvent,
): SubscriptionStatus {
  const next = nextStatus(status, event);
  if (next === null) {
    throw new InvalidSubscriptionTransitionError(status, event);
  }
  return next;
}
