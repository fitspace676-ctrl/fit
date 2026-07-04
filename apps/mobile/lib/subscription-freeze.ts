// @fit/mobile — member self-service membership freeze / resume (`/subscriptions`).
//
// The Profile hub's membership card (T7.9) lets the signed-in member pause their
// own membership while they're away and resume it early — the mobile counterpart
// of the web portal's freeze card (T5.7). Both act on the *caller's own*
// `Subscription` via `POST /subscriptions/:id/freeze` and `.../unfreeze`; tenant
// scope and member identity come from the session token, so only the subscription
// id and freeze duration cross the wire.
//
// The API enforces the plan's per-period allowance server-side: a request that
// would overrun it is a `422 EXCEEDS_FREEZE_ALLOWANCE` carrying the `remainingDays`
// still available, and re-freezing an already-frozen membership is a
// `409 ALREADY_FROZEN`. Rather than throw, both calls resolve to a small tagged
// result so the card can turn the outcome — success or a specific error — into the
// right toast.

import { apiFetch } from './api-client';

/** Outcome of a freeze request — the new auto-resume instant, or a tagged error. */
export type FreezeResult =
  | { ok: true; frozenUntil: string }
  | { ok: false; code?: string; remainingDays?: number };

/** Outcome of an unfreeze request — the pushed-out renewal instant, or an error. */
export type UnfreezeResult = { ok: true; newPeriodEnd: string } | { ok: false; code?: string };

/** Read the API's stable `code` / `remainingDays` off an error payload, if present. */
function errorOf(body: unknown): { code?: string; remainingDays?: number } {
  if (body && typeof body === 'object') {
    const b = body as { code?: unknown; remainingDays?: unknown };
    return {
      code: typeof b.code === 'string' ? b.code : undefined,
      remainingDays: typeof b.remainingDays === 'number' ? b.remainingDays : undefined,
    };
  }
  return {};
}

/**
 * Pause the caller's membership from `startDate` for `durationDays` via
 * `POST /subscriptions/:id/freeze`. On success the membership is `FROZEN` and
 * `frozenUntil` is when it auto-resumes; on a `422` the result carries the
 * `remainingDays` the member has left this period so the card can say exactly how
 * much allowance remains.
 */
export async function freezeSubscription(
  id: string,
  input: { startDate: string; durationDays: number },
  opts: { signal?: AbortSignal } = {},
): Promise<FreezeResult> {
  const response = await apiFetch(`/subscriptions/${encodeURIComponent(id)}/freeze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const body = (await response.json().catch(() => null)) as { frozenUntil?: unknown } | null;
  if (response.ok && typeof body?.frozenUntil === 'string') {
    return { ok: true, frozenUntil: body.frozenUntil };
  }
  return { ok: false, ...errorOf(body) };
}

/**
 * Resume the caller's frozen membership early via `POST /subscriptions/:id/unfreeze`.
 * On success `newPeriodEnd` is the next-renewal instant after pushing it out by the
 * days actually spent frozen.
 */
export async function unfreezeSubscription(
  id: string,
  opts: { signal?: AbortSignal } = {},
): Promise<UnfreezeResult> {
  const response = await apiFetch(`/subscriptions/${encodeURIComponent(id)}/unfreeze`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });
  const body = (await response.json().catch(() => null)) as { newPeriodEnd?: unknown } | null;
  if (response.ok && typeof body?.newPeriodEnd === 'string') {
    return { ok: true, newPeriodEnd: body.newPeriodEnd };
  }
  return { ok: false, ...errorOf(body) };
}
