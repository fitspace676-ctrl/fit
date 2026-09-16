// @fit/mobile — a failed booking, turned into a sentence the member can read.
//
// Modelled on `components/auth/auth-error.ts`, and for the same reason: the
// API's `message` is server-authored English prose that changes without notice,
// while `code` is the contract. The difference is that here the copy **exists**
// — `member.actions.err*` is seven keys in both locales, written for exactly
// these codes — so every arm below points at a real string rather than at a
// generic fallback.
//
// ---------------------------------------------------------------------------
// THE ONE CODE WITH NO KEY: `SUBSCRIPTION_FROZEN`.
//
// `apps/api/src/classes/bookings.service.ts:456` blocks booking while the
// member's membership is frozen and answers **403 `SUBSCRIPTION_FROZEN`**
// (note: 403, not the 409 the work-package brief predicted) carrying
// `frozenUntil`. There is no `member.actions.errFrozen`, and this is not a
// failure a retry fixes — the member has to resume the plan — so it is treated
// as its own state by {@link isSubscriptionFrozen} rather than being flattened
// into `errGeneric`. The screen renders the membership vocabulary that DOES
// exist (`member.membership.status.FROZEN` + `freeze.frozenHint`) and offers
// `member.membership.managePlan` as the way out.
//
// `apps/web`'s equivalent map (`ClassBookingModal.messageKey`) handles three
// codes and lets everything else fall through; this one covers the five the
// fetchers document plus the frozen case.

import { ApiError } from '../../lib/http/api-error';
import type { MessageKey } from '../../lib/i18n/keys';

/** The catalogue key for a failed book / cancel. */
export function bookingErrorKey(error: unknown): MessageKey {
  if (!ApiError.is(error)) return 'member.actions.errGeneric';

  switch (error.code) {
    case 'ALREADY_BOOKED':
      return 'member.actions.errAlreadyBooked';
    case 'CLASS_NOT_BOOKABLE':
      return 'member.actions.errNotBookable';
    case 'CANCELLATION_WINDOW_PASSED':
      return 'member.actions.errWindowPassed';
    case 'NOT_FOUND':
      return 'member.actions.errNotFound';
    case 'UNAUTHENTICATED':
    case 'UNAUTHORIZED':
      return 'member.actions.errAuth';
    default:
      // Covers `IDEMPOTENCY_KEY_REUSED`, every 5xx and every transport failure.
      return 'member.actions.errGeneric';
  }
}

/**
 * Is this the "your membership is frozen" refusal?
 *
 * Deep-linked to the membership screen rather than shown as an error, because
 * the member has done nothing wrong and pressing the button again cannot work.
 */
export function isSubscriptionFrozen(error: unknown): boolean {
  return ApiError.is(error) && error.code === 'SUBSCRIPTION_FROZEN';
}

// NOTE — there is deliberately no `isRetryableBookingError` here, unlike
// `components/auth/auth-error.ts`. On a form the retry IS the submit button, and
// on these two screens it is the CTA the member just pressed, sitting a line
// away and re-rendered against the CURRENT state by the invalidation matrix. A
// predicate would only feed a second button that does the same thing.
