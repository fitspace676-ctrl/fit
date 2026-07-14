// @fit/admin — AI Agent chat sessions: list (server-persisted).
//
// The chat UI stores sessions on the server now (not localStorage). These route
// handlers are a thin same-origin proxy: the client can't read the httpOnly
// access-token cookie, so it calls here, and we forward the token to the fit API
// (`/agent/sessions`), which scopes every session to the gym + the current user.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Base URL of the @fit/api backend (same default as the console client). */
function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

/** The operator's access token, or null when unauthenticated. */
async function accessToken(): Promise<string | null> {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

/** `GET /api/agent/sessions` — the current user's saved sessions (metadata). */
export async function GET(): Promise<Response> {
  const token = await accessToken();
  if (!token) {
    return new Response(JSON.stringify({ error: 'unauthenticated' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const res = await fetch(`${apiBaseUrl()}/agent/sessions`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
