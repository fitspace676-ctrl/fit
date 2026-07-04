// @fit/mobile — the member's self-service membership actions (freeze / resume).
//
// The redesigned Profile tab (T7.9) lets a member pause their own membership
// from the membership card's freeze sheet, and resume a frozen one. Both hit the
// member-facing endpoints the web portal's freeze card also uses:
//
//   • POST /subscriptions/:id/freeze    — pause from `startDate` for N whole days
//   • POST /subscriptions/:id/unfreeze  — resume early (or it auto-resumes)
//
// The member acts on their *own* subscription (its id comes from
// `GET /me/subscription`), so nothing but the freeze body crosses the wire. Both
// go through the authenticated `apiFetch` client. Rather than throw on the
// domain errors the freeze state machine raises, this returns a discriminated
// result carrying the API's stable `code` (and, for an allowance overrun, the
// `remainingDays` left) so the screen can toast an exact message — mirroring the
// web `freezeSubscriptionAction`.

import type {
  FreezeSubscriptionData,
  FreezeSubscriptionResponse,
  UnfreezeSubscriptionResponse,
} from '@fit/types';
import { apiFetch } from './api-client';

/** A freeze/unfreeze outcome: the parsed success body, or a coded failure. */
export type SubscriptionActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code?: string; message?: string; remainingDays?: number };

/** Pull `{ code, message, remainingDays }` off an error payload, if present. */
function errorOf(body: unknown): { code?: string; message?: string; remainingDays?: number } {
  if (body && typeof body === 'object') {
    const b = body as { code?: unknown; message?: unknown; remainingDays?: unknown };
    return {
      code: typeof b.code === 'string' ? b.code : undefined,
      message: typeof b.message === 'string' ? b.message : undefined,
      remainingDays: typeof b.remainingDays === 'number' ? b.remainingDays : undefined,
    };
  }
  return {};
}

/**
 * Freeze subscription `id` from `startDate` for `durationDays` whole days via
 * `POST /subscriptions/:id/freeze`. On success returns the `frozenUntil` instant;
 * a `422 EXCEEDS_FREEZE_ALLOWANCE` comes back as `{ ok: false, code, remainingDays }`
 * and an already-frozen membership as `{ ok: false, code: 'ALREADY_FROZEN' }`.
 */
export async function freezeSubscription(
  id: string,
  body: FreezeSubscriptionData,
): Promise<SubscriptionActionResult<FreezeSubscriptionResponse>> {
  const response = await apiFetch(`/subscriptions/${encodeURIComponent(id)}/freeze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (response.ok && payload && typeof payload === 'object') {
    return { ok: true, data: payload as FreezeSubscriptionResponse };
  }
  return { ok: false, ...errorOf(payload) };
}

/**
 * Resume frozen subscription `id` via `POST /subscriptions/:id/unfreeze`. On
 * success returns the pushed-out `newPeriodEnd`; a failure surfaces the API's
 * `code`.
 */
export async function unfreezeSubscription(
  id: string,
): Promise<SubscriptionActionResult<UnfreezeSubscriptionResponse>> {
  const response = await apiFetch(`/subscriptions/${encodeURIComponent(id)}/unfreeze`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (response.ok && payload && typeof payload === 'object') {
    return { ok: true, data: payload as UnfreezeSubscriptionResponse };
  }
  return { ok: false, ...errorOf(payload) };
}
