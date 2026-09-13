// @fit/web — session cookie endpoint.
//
// Owns the httpOnly `accessToken` (+ `refreshToken`) cookies so the JWT never
// touches client JS: no localStorage, no JS-readable cookie — closing the XSS
// token-exfiltration vector. A sign-in POSTs its TokenPair here to have the
// cookies set server-side; sign-out DELETEs them; and `GET` returns the verified
// session for the `useSession()` hook, which can no longer read the httpOnly
// cookie itself.

//
// The cookies are HOST-ONLY: a session signed in on one gym's subdomain is not
// sent to any other gym's. See `lib/session-cookies.ts` for why, and for the
// legacy parent-domain copy every write and clear here also expires.

import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';
import {
  REFRESH_TOKEN_COOKIE,
  appendLegacySessionClear,
  clearSessionCookies,
  sessionCookieOptions,
} from '@/lib/session-cookies';

/** Refresh-cookie lifetime (seconds) — matches the API's 30-day refresh TTL. */
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

/** Access-cookie lifetime when the token carries no `exp` (seconds). */
const DEFAULT_ACCESS_MAX_AGE = 60 * 60;

/** Seconds until the access token's `exp`, or the fallback lifetime. */
function accessTokenMaxAge(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) return DEFAULT_ACCESS_MAX_AGE;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as { exp?: unknown };
    if (typeof claims.exp === 'number') {
      return Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_ACCESS_MAX_AGE;
}

/** `GET /api/session` — the verified session, for the client `useSession()` hook. */
export async function GET(): Promise<NextResponse> {
  const user = await getServerSession();
  return NextResponse.json({ user });
}

/** `POST /api/session` — persist a sign-in's tokens as httpOnly cookies. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  } | null;
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : null;
  const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : null;
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(
    ACCESS_TOKEN_COOKIE,
    accessToken,
    sessionCookieOptions(accessTokenMaxAge(accessToken)),
  );
  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, sessionCookieOptions(REFRESH_MAX_AGE));
  // A parent-domain session from before the switch would otherwise sit beside
  // the new one under the same names, and the browser sends both.
  appendLegacySessionClear(res);
  return res;
}

/** `DELETE /api/session` — clear the session cookies (sign-out). */
export function DELETE(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  clearSessionCookies(res);
  return res;
}
