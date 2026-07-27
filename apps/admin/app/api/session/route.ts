// @fit/admin — session cookie endpoint.
//
// The console signs operators in at `/admin/login`, so this route covers the
// whole session lifecycle: *set* it (`POST`, from that sign-in), *read* it
// (`GET`, for the client `useSession()` hook, which can't read an httpOnly
// cookie) and *clear* it (`DELETE`, sign-out).
//
// An operator who signs in on the member site instead still arrives with the
// cookie already set on the shared parent domain by the web app's identical
// `POST /api/session` — the two write the same cookies with the same options, so
// either entry point produces one session that both apps accept.

import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';

/** Cookie holding the rotating refresh token (httpOnly; never exposed to JS). */
const REFRESH_TOKEN_COOKIE = 'refreshToken';

/**
 * Parent domain for the cookies (e.g. `.fit.ge`) so sign-out clears the session
 * across every tenant subdomain. Unset in local dev.
 */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

/** Refresh-cookie lifetime (seconds) — mirrors the web app's. */
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

/** Access-cookie lifetime when the token carries no `exp` (seconds). */
const DEFAULT_ACCESS_MAX_AGE = 60 * 60;

/** Shared httpOnly cookie options; `secure` only outside local dev. */
function setOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

/** httpOnly cookie-clear options; `secure` only outside local dev. */
function clearOptions() {
  return setOptions(0);
}

/**
 * Seconds until the access token's `exp`, or the fallback lifetime. The token is
 * *not* verified here — the cookie's lifetime is a storage detail, and every
 * consumer re-verifies the signature before trusting a claim.
 */
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

/**
 * `POST /api/session` — persist a freshly-issued token pair as httpOnly cookies.
 *
 * Written for the console's own sign-in at `/admin/login`. Operators who arrive
 * through the member site still land here with the cookie already set by its
 * `POST /api/session`; this route serves the operator who goes straight to the
 * console URL, so the console no longer has to bounce them off to another app to
 * type a password.
 *
 * The tokens are only ever set as httpOnly cookies — never returned to, or
 * readable by, client JS — so an XSS on the console cannot read a session back
 * out. Mirrors the web app's route so a session set by either is identical.
 */
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
  res.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, setOptions(accessTokenMaxAge(accessToken)));
  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, setOptions(REFRESH_MAX_AGE));
  return res;
}

/** `DELETE /api/session` — clear the session cookies (sign-out). */
export function DELETE(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', clearOptions());
  res.cookies.set(REFRESH_TOKEN_COOKIE, '', clearOptions());
  return res;
}
