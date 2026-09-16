// @fit/mobile — a refused enrolment or purchase, turned into a sentence.
//
// The same shape as `components/classes/booking-errors.ts`, and for the same
// reason it gives: the API's `message` is server-authored English prose that
// changes without notice, while `code` is the contract. And here too the copy
// already exists — `member.membership.plan.err*` and `billing.credits.err*`
// were written for exactly these codes — so every arm points at a real string.
//
// The three enrolment codes are documented on `EnrollSubscriptionResponse`:
// `404 SUBSCRIPTION_PLAN_NOT_FOUND`, `409 SUBSCRIPTION_PLAN_INACTIVE` and
// `409 ALREADY_SUBSCRIBED`. The last one is the interesting one — it is what a
// member gets for trying to *switch* a live plan, because there is no member
// route that switches; see `plan-sheet.tsx`.

import { ApiError } from '../../lib/http/api-error';
import type { MessageKey } from '../../lib/i18n/keys';

/** The shape these mappers read. A widening alias, so a screen need not cast. */
export type ApiErrorLike = unknown;

/** The catalogue key for a failed `POST /subscriptions`. */
export function planErrorKey(error: ApiErrorLike): MessageKey {
  if (!ApiError.is(error)) return 'member.membership.plan.error';

  switch (error.code) {
    case 'ALREADY_SUBSCRIBED':
      return 'member.membership.plan.errAlreadySubscribed';
    case 'SUBSCRIPTION_PLAN_INACTIVE':
    case 'SUBSCRIPTION_PLAN_NOT_FOUND':
    case 'NOT_FOUND':
      return 'member.membership.plan.errUnavailable';
    default:
      return 'member.membership.plan.error';
  }
}

/**
 * The catalogue key for a failed `POST /credit-packs/purchase`.
 *
 * Reads `billing.credits.*`, which is the namespace D10 puts the Billing screen
 * on and the only one carrying a "you are not a member of this gym" sentence
 * (`errNoMembership`) — a real outcome, since the route is member-scoped and a
 * token whose `gymId` claim has gone stale is exactly how it is reached.
 */
export function creditPackErrorKey(error: ApiErrorLike): MessageKey {
  if (!ApiError.is(error)) return 'billing.credits.errGeneric';

  switch (error.code) {
    case 'NOT_FOUND':
    case 'PACKAGE_PLAN_INACTIVE':
    case 'PACKAGE_PLAN_NOT_FOUND':
      return 'billing.credits.errUnavailable';
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return 'billing.credits.errNoMembership';
    default:
      return 'billing.credits.errGeneric';
  }
}
