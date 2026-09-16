// @fit/mobile — what went wrong in the join funnel, as a closed set.
//
// ===========================================================================
// BRANCH ON `code`, NOT ON `status`. THREE OF THESE SHARE A STATUS.
//
// `409` is `EMAIL_TAKEN` from `POST /auth/signup` and `ALREADY_SUBSCRIBED` from
// `POST /checkout`, and the two need opposite screens: one prefills a sign-in,
// the other says "you already have this plan". C3a hit the same shape from the
// other side — the brief said `SUBSCRIPTION_FROZEN` was a 409 and it is a 403 —
// and branching on the code made that discrepancy moot. Same rule here.
//
// `apps/web`'s checkout does NOT do this: it lets every checkout failure fall
// to `setError(err.message)` and renders the API's own English sentence in the
// middle of a Georgian page. `checkout.payment.unavailable.title` /
// `.subtitle` are authored in both locales and go unread there. Mobile reads
// them, because an English server string on a Georgian screen is the exact
// defect `components/auth/auth-error.ts` was written to avoid.
// ===========================================================================

import { EMAIL_TAKEN_CODE, PRODUCT_UNAVAILABLE_CODE } from '@fit/types';

import { ApiError } from '../../lib/http/api-error';

/** `apps/api/src/subscriptions/subscription-enrollment.service.ts` — 409. */
const ALREADY_SUBSCRIBED_CODE = 'ALREADY_SUBSCRIBED';

/** `apps/api/src/auth/auth.service.ts` — 400 from `signupMember`. */
const GYM_NOT_FOUND_CODE = 'GYM_NOT_FOUND';

/**
 * Every way the funnel can fail, and each one is a different screen.
 *
 * Only `generic` is an apology; the other five are states with a way out.
 */
export type JoinFailure =
  /**
   * `409 EMAIL_TAKEN` — **a branch, not an error.** The address already has an
   * account, so the buyer is not stuck, they are one sign-in away. The funnel
   * returns to the details step (where the message can actually be seen) and
   * offers "sign in instead" with the address they typed already in hand.
   */
  | { readonly kind: 'emailTaken' }
  /**
   * `429`. `POST /auth/signup` is `authStrict` — five requests per 900 seconds
   * — and a real buyer meets it: two typos and a re-read of the password rule
   * is four. `seconds` is `Retry-After`, and it drives a live countdown.
   * **Never auto-retried**: retrying a rate-limit response is what the limiter
   * is defending against, and it turns a 15-minute wait into a longer one.
   */
  | { readonly kind: 'coolDown'; readonly seconds: number }
  /**
   * `422 PRODUCT_UNAVAILABLE`. The API returns ONE code for three different
   * situations — the product is missing, it belongs to another gym, or it is
   * not on sale — deliberately, so the endpoint never reveals whether an id
   * exists in a tenant the caller cannot see. **So the copy has to be equally
   * vague**: "no longer available", never "that plan was withdrawn". The
   * catalogue is invalidated and the buyer goes back to the picker.
   */
  | { readonly kind: 'productUnavailable' }
  /**
   * `409 ALREADY_SUBSCRIBED`. Nothing was bought and nothing needs to be: the
   * member already holds a live subscription. The membership query is
   * invalidated, because the cached answer is what let the funnel offer the
   * purchase in the first place.
   */
  | { readonly kind: 'alreadySubscribed' }
  /**
   * `400 GYM_NOT_FOUND` on signup — the tenant is unknown or suspended. Not
   * retryable by pressing again; the funnel has nothing to sell.
   */
  | { readonly kind: 'gymUnknown' }
  /** Anything else: a 5xx, a dead radio, a 400 the form should have caught. */
  | { readonly kind: 'generic'; readonly retryable: boolean };

/**
 * Fallback cool-down when a 429 arrives with no `Retry-After`.
 *
 * The API's throttler always sets it, so this defends against a proxy that
 * strips the header rather than an expected path. Deliberately the same 60s
 * `components/auth/use-cool-down.ts` chose, for the same reason: long enough to
 * be a real pause, short enough that a stripped header cannot lock a buyer out
 * for a quarter of an hour on a guess.
 */
export const FALLBACK_COOL_DOWN_SEC = 60;

/** Which failure this is. */
export function classifyJoinFailure(error: unknown): JoinFailure {
  if (!ApiError.is(error)) {
    return { kind: 'generic', retryable: false };
  }

  if (error.status === 429) {
    const header = error.retryAfterSec;
    const seconds =
      header === undefined || !Number.isFinite(header) || header <= 0
        ? FALLBACK_COOL_DOWN_SEC
        : Math.ceil(header);
    return { kind: 'coolDown', seconds };
  }

  switch (error.code) {
    case EMAIL_TAKEN_CODE:
      return { kind: 'emailTaken' };
    case PRODUCT_UNAVAILABLE_CODE:
      return { kind: 'productUnavailable' };
    case ALREADY_SUBSCRIBED_CODE:
      return { kind: 'alreadySubscribed' };
    case GYM_NOT_FOUND_CODE:
      return { kind: 'gymUnknown' };
    default:
      break;
  }

  // "Retryable" means re-pressing the button is honest advice. A transport
  // failure or a 5xx: yes. A 400 the server refused on the body's shape: no —
  // sending the identical body again cannot work, and offering "try again"
  // would be the app telling the buyer to do the same thing twice.
  return { kind: 'generic', retryable: error.isTransport || error.status >= 500 };
}
