// @fit/mobile — member self-service (`/me/*`).
//
// Every route here resolves the caller from the session: there is no member id
// on the wire, and no way to ask for someone else's. That is also why none of
// them takes a `gymId` — the tenant comes off the access token's claim, which is
// the same value the query keys are scoped by.
//
// `GET /me/subscription` is the membership screen's *whole* payload: the
// subscription **and** the invoice history. That matters for the invalidation
// matrix — anything that raises an invoice (a service-session booking does)
// invalidates `queryKeys.membership(gymId)`, not some separate invoices key.

import type {
  GetMeProfileResponse,
  GetMeSubscriptionResponse,
  ListMeGoalsResponse,
  PutMeGoalsInput,
  UpdateMeProfileInput,
  UpdateMeProfileResponse,
} from '@fit/types';
import { apiFetch, apiJson, buildUrl } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/** `GET /me/profile` — name, email, phone. Gym-independent (a `User` attribute set). */
export async function getMyProfile(options: FetchOptions = {}): Promise<GetMeProfileResponse> {
  return apiJson<GetMeProfileResponse>(endpointPath(ENDPOINTS.getMyProfile), {
    method: ENDPOINTS.getMyProfile.method,
    signal: options.signal,
  });
}

/**
 * `PATCH /me/profile` — write only the fields present.
 *
 * The schema is `.strict()`, so an unknown key is a `400` rather than a silent
 * no-op. `phone: null` clears the number; omitting `phone` leaves it alone —
 * those are different requests and must not be collapsed by a form that sends
 * `undefined` for an untouched field.
 */
export async function updateMyProfile(
  input: UpdateMeProfileInput,
  options: FetchOptions = {},
): Promise<UpdateMeProfileResponse> {
  return apiJson<UpdateMeProfileResponse>(endpointPath(ENDPOINTS.updateMyProfile), {
    method: ENDPOINTS.updateMyProfile.method,
    json: input,
    signal: options.signal,
  });
}

/** `GET /me/goals` — the caller's training goals with current/target progress. */
export async function getMyGoals(options: FetchOptions = {}): Promise<ListMeGoalsResponse> {
  return apiJson<ListMeGoalsResponse>(endpointPath(ENDPOINTS.getMyGoals), {
    method: ENDPOINTS.getMyGoals.method,
    signal: options.signal,
  });
}

/**
 * `PUT /me/goals` — replace the whole goal set (max 8).
 *
 * A `PUT`, not a `PATCH`: the body **is** the new set, so an editor that drops a
 * goal from the array deletes it. Sending `{ goals: [] }` clears them all.
 */
export async function replaceMyGoals(
  input: PutMeGoalsInput,
  options: FetchOptions = {},
): Promise<ListMeGoalsResponse> {
  return apiJson<ListMeGoalsResponse>(endpointPath(ENDPOINTS.replaceMyGoals), {
    method: ENDPOINTS.replaceMyGoals.method,
    json: input,
    signal: options.signal,
  });
}

/**
 * `GET /me/subscription` — the membership and its invoices.
 *
 * `subscription` is `null` for someone who has never subscribed — a normal
 * state the home screen renders as its "no plan" card. This is the query behind
 * the membership tile the old app **hardcoded** to `ACTIVE` / `22/30` / `73%`.
 *
 * The freeze allowance travels with it (`freezeDaysPerPeriod` / `Used` /
 * `Remaining`), so a freeze sheet needs no second request to know whether the
 * button should be enabled.
 */
export async function getMySubscription(
  options: FetchOptions = {},
): Promise<GetMeSubscriptionResponse> {
  return apiJson<GetMeSubscriptionResponse>(endpointPath(ENDPOINTS.getMySubscription), {
    method: ENDPOINTS.getMySubscription.method,
    signal: options.signal,
  });
}

/**
 * The absolute URL of an invoice PDF (`GET /me/invoices/:invoiceId/pdf`).
 *
 * Exposed as a URL as well as a fetch because the natural way to hand a PDF to
 * the OS on a device is `expo-file-system`'s `downloadAsync` + `expo-sharing`,
 * and neither may be imported from `lib/` (§5). The caller must attach the
 * `Authorization` header itself — this route is `SubscriptionManage`, not public.
 *
 * **Not** `GET /invoices/:id/pdf`: that one is `BillingRead` and 403s for a
 * member.
 */
export function myInvoicePdfUrl(invoiceId: string): string {
  return buildUrl(endpointPath(ENDPOINTS.getMyInvoicePdf, { invoiceId }));
}

/**
 * `GET /me/invoices/:invoiceId/pdf` — the invoice as bytes.
 *
 * Returns a `Blob` rather than parsed JSON: the response is
 * `application/pdf`, and `apiJson` would (correctly) reject it as
 * `MALFORMED_RESPONSE`. A non-2xx still throws `ApiError` — `apiFetch` has
 * already checked the status by the time this resolves.
 */
export async function downloadMyInvoicePdf(
  params: { invoiceId: string },
  options: FetchOptions = {},
): Promise<Blob> {
  const response = await apiFetch(
    endpointPath(ENDPOINTS.getMyInvoicePdf, { invoiceId: params.invoiceId }),
    {
      method: ENDPOINTS.getMyInvoicePdf.method,
      headers: { Accept: 'application/pdf' },
      signal: options.signal,
    },
  );
  return response.blob();
}
