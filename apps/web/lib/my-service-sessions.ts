// @fit/web — the signed-in member's service sessions (server-only).
//
// Forwards the `accessToken` cookie as a bearer token to `GET /me/service-sessions`.
// Reads `next/headers`, so only Server Components / actions may import it — the
// public slot read lives in `service-sessions.ts` for client components.

import { cookies } from 'next/headers';
import { listMemberServiceSessionsResultSchema, type MemberServiceSession } from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * The signed-in member's service sessions (booked, done, cancelled), with the
 * invoice each raised. Empty without a session token or on a 401/403 — "nothing
 * to show this caller" rather than an error screen.
 */
export async function fetchMyServiceSessions(): Promise<MemberServiceSession[]> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return [];
  const response = await fetch(`${API_URL}/me/service-sessions`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403) return [];
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load sessions (${response.status})`);
  }
  return listMemberServiceSessionsResultSchema.parse(await response.json()).sessions;
}
