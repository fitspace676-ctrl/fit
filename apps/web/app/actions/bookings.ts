'use server';

// @fit/web — class booking server actions.
//
// Book / cancel a class occurrence from any client island without exposing the
// httpOnly session: the action runs on the server, reads the `accessToken`
// cookie, and forwards it as a bearer token to the @fit/api booking endpoints
// (`POST` / `DELETE /class-instances/:id/bookings`). Tenant scope comes from the
// token's `gymId` claim, so no gym id crosses the wire. Returns a small tagged
// result the caller turns into a toast; the caller refreshes the route to pull
// the updated seat counts and booking lists.

import { cookies } from 'next/headers';
import {
  bookClassInstanceResultSchema,
  cancelBookingResultSchema,
  type BookClassInstanceResult,
  type CancelBookingResult,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** A booking action's outcome — `ok` with data, or an error with the API code. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Shared request plumbing: forward the session token, map non-OK to an error. */
async function callBookingApi(
  classId: string,
  method: 'POST' | 'DELETE',
): Promise<{ status: number; body: unknown }> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return { status: 401, body: { code: 'UNAUTHENTICATED' } };
  }

  const response = await fetch(
    `${API_URL}/class-instances/${encodeURIComponent(classId)}/bookings`,
    {
      method,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  );
  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body };
}

/** Extract `{ code, message }` from an error payload, if present. */
function errorOf(body: unknown): { code?: string; message?: string } {
  if (body && typeof body === 'object') {
    const b = body as { code?: unknown; message?: unknown };
    return {
      code: typeof b.code === 'string' ? b.code : undefined,
      message: typeof b.message === 'string' ? b.message : undefined,
    };
  }
  return {};
}

/** Book (or waitlist) the calling member into a class occurrence. */
export async function bookClassAction(
  classId: string,
): Promise<ActionResult<BookClassInstanceResult>> {
  const { status, body } = await callBookingApi(classId, 'POST');
  if (status === 200) {
    const parsed = bookClassInstanceResultSchema.safeParse(body);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    return { ok: false, error: 'INVALID_RESPONSE' };
  }
  const { code, message } = errorOf(body);
  return { ok: false, error: message ?? `Failed to book (${status})`, code };
}

/** Cancel the calling member's booking for a class occurrence. */
export async function cancelBookingAction(
  classId: string,
): Promise<ActionResult<CancelBookingResult>> {
  const { status, body } = await callBookingApi(classId, 'DELETE');
  if (status === 200) {
    const parsed = cancelBookingResultSchema.safeParse(body);
    if (parsed.success) {
      return { ok: true, data: parsed.data };
    }
    return { ok: false, error: 'INVALID_RESPONSE' };
  }
  const { code, message } = errorOf(body);
  return { ok: false, error: message ?? `Failed to cancel (${status})`, code };
}
