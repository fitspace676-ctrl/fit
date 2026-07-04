'use server';

// @fit/web — membership freeze / pause server actions (T5.7).
//
// Freeze (pause) or resume the signed-in member's own membership from the
// Membership screen without exposing the httpOnly session: the action runs on the
// server, reads the `accessToken` cookie, and forwards it as a bearer token to the
// @fit/api member endpoints (`POST /subscriptions/:id/freeze` / `.../unfreeze`).
// Tenant scope and member identity come from the token, so only the subscription
// id and freeze duration cross the wire. Returns a small tagged result the caller
// turns into a toast; the `422 EXCEEDS_FREEZE_ALLOWANCE` is surfaced with its
// `remainingDays` so the member sees exactly how much of the allowance is left.

import { cookies } from 'next/headers';
import {
  freezeSubscriptionSchema,
  type FreezeSubscriptionInput,
  type FreezeSubscriptionResponse,
  type UnfreezeSubscriptionResponse,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * A freeze/unfreeze action's outcome — `ok` with the API payload, or an error with
 * the API's stable `code` and, for the allowance overrun, the `remainingDays` left.
 */
export type SubscriptionActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; remainingDays?: number };

/** Shared request plumbing: forward the session token, return the raw status + body. */
async function callFreezeApi(
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return { status: 401, body: { code: 'UNAUTHENTICATED' } };
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const parsed = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body: parsed };
}

/** Extract `{ code, message, remainingDays }` from an error payload, if present. */
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

/** Freeze (pause) the calling member's subscription from `startDate` for `durationDays`. */
export async function freezeSubscriptionAction(
  id: string,
  input: FreezeSubscriptionInput,
): Promise<SubscriptionActionResult<FreezeSubscriptionResponse>> {
  const parsed = freezeSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'INVALID_REQUEST' };
  }
  const { status, body } = await callFreezeApi(
    `/subscriptions/${encodeURIComponent(id)}/freeze`,
    parsed.data,
  );
  if (status === 200 && body && typeof body === 'object') {
    return { ok: true, data: body as FreezeSubscriptionResponse };
  }
  const { code, message, remainingDays } = errorOf(body);
  return { ok: false, error: message ?? `Failed to freeze (${status})`, code, remainingDays };
}

/** Resume the calling member's frozen subscription (early or at its scheduled end). */
export async function unfreezeSubscriptionAction(
  id: string,
): Promise<SubscriptionActionResult<UnfreezeSubscriptionResponse>> {
  const { status, body } = await callFreezeApi(`/subscriptions/${encodeURIComponent(id)}/unfreeze`);
  if (status === 200 && body && typeof body === 'object') {
    return { ok: true, data: body as UnfreezeSubscriptionResponse };
  }
  const { code, message } = errorOf(body);
  return { ok: false, error: message ?? `Failed to resume (${status})`, code };
}
