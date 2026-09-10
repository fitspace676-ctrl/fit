// @fit/mobile — membership lifecycle (`/subscriptions`).
//
// ## Why freeze/unfreeze reach further than the membership card
//
// A `FROZEN` subscription cannot book. `BookingsService` rejects it, so every
// class card's primary affordance changes from "Book" to something else the
// moment a freeze lands, and back again on unfreeze. The old app invalidated
// only the membership query, so the schedule kept offering a button that 409'd.
//
// That is why the matrix has freeze **and** unfreeze invalidating `classes` and
// `bookings` alongside `membership`. It is not defensive over-invalidation: it
// is the set of screens whose *meaning* changed.

import type {
  EnrollSubscriptionResponse,
  FreezeSubscriptionInput,
  UnfreezeSubscriptionResponse,
  FreezeSubscriptionResponse,
} from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `POST /subscriptions` — enrol the caller on a plan.
 *
 * Only `planId` crosses the wire; the member comes from the session and the
 * price / currency / interval are snapshotted server-side from the plan, so the
 * client cannot dictate the terms it pays. `409 ALREADY_SUBSCRIBED` when a live
 * subscription already exists.
 */
export async function enrollSubscription(
  input: { planId: string },
  options: FetchOptions = {},
): Promise<EnrollSubscriptionResponse> {
  return apiJson<EnrollSubscriptionResponse>(endpointPath(ENDPOINTS.enrollSubscription), {
    method: ENDPOINTS.enrollSubscription.method,
    json: { planId: input.planId },
    signal: options.signal,
  });
}

/**
 * `POST /subscriptions/:id/freeze` — pause from `startDate` for `durationDays`.
 *
 * The plan's `freezeDaysPerPeriod` allowance is the real limit and is enforced
 * server-side against this period's prior usage — `GET /me/subscription` already
 * carries `freezeDaysRemaining`, so a sheet can disable the control rather than
 * discovering the limit as a `400`.
 *
 * The response's `frozenUntil` is when it auto-resumes; the member may unfreeze
 * earlier.
 */
export async function freezeSubscription(
  input: { subscriptionId: string } & FreezeSubscriptionInput,
  options: FetchOptions = {},
): Promise<FreezeSubscriptionResponse> {
  return apiJson<FreezeSubscriptionResponse>(
    endpointPath(ENDPOINTS.freezeSubscription, { id: input.subscriptionId }),
    {
      method: ENDPOINTS.freezeSubscription.method,
      json: { startDate: input.startDate, durationDays: input.durationDays },
      signal: options.signal,
    },
  );
}

/**
 * `POST /subscriptions/:id/unfreeze` — resume now.
 *
 * `newPeriodEnd` is the renewal instant after pushing it out by the days
 * actually spent frozen, so the membership card must re-read rather than
 * arithmetic its way to a date.
 */
export async function unfreezeSubscription(
  input: { subscriptionId: string },
  options: FetchOptions = {},
): Promise<UnfreezeSubscriptionResponse> {
  return apiJson<UnfreezeSubscriptionResponse>(
    endpointPath(ENDPOINTS.unfreezeSubscription, { id: input.subscriptionId }),
    {
      method: ENDPOINTS.unfreezeSubscription.method,
      signal: options.signal,
    },
  );
}
