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

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { IMPERSONATION_COOKIES, impersonationCookieOptions } from '@/lib/impersonation';
import { getServerSession } from '@/lib/session';
import { refreshTokens, sessionCookies } from '@/lib/session-refresh';
import { renewSession } from '@/lib/session-renewal';
import { verifyAccessToken } from '@/lib/auth-session';

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

/**
 * `GET /api/session` — the verified session, for the client `useSession()` hook.
 *
 * When the access cookie is not valid, the answer also says whether the session is
 * **recoverable**: whether a refresh token is sitting beside it.
 *
 * That flag is the difference between two states this route used to conflate. The
 * access token lives 15 minutes and the refresh token 30 days, so an operator who
 * left the tab open over lunch comes back with the first expired and the second
 * perfectly good. `middleware.ts` renews it silently — but only on genuine
 * navigations, and this route is reached by `fetch()`, which carries neither
 * `sec-fetch-dest: document` nor the RSC header. So the honest answer was "no
 * valid access token", and the client read it as "signed out" and emptied the
 * whole sidebar.
 *
 * This route deliberately does **not** refresh the token itself. The API rotates
 * the refresh token on every use and revokes the family when one is reused, so
 * rotation has exactly one owner — the middleware — and adding a second one here
 * raced it: the rotated token landed in the cookie jar, the next RSC refresh sent
 * the stale one, and the reuse detector logged the operator out for real. Instead
 * the flag lets the client keep its nav and ask for a navigation, which the
 * middleware then refreshes through the single path built for it.
 */
/**
 * `GET /api/session` - the session as the browser sees it, renewed in place when
 * the access token has expired. See {@link renewSession} for why it renews here
 * rather than leaving that to a navigation.
 */
export async function GET(): Promise<NextResponse> {
  const [current, cookieStore] = await Promise.all([getServerSession(), cookies()]);
  const secret = process.env.JWT_SECRET;
  const { user, recoverable, refreshed } = await renewSession({
    current,
    refreshToken: cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null,
    refresh: refreshTokens,
    verify: (token) => (secret ? verifyAccessToken(token, secret) : Promise.resolve(null)),
  });

  const res = NextResponse.json({ user, recoverable });
  if (refreshed) {
    for (const cookie of sessionCookies(refreshed)) {
      res.cookies.set(cookie.name, cookie.value, cookie.options);
    }
  }
  return res;
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

/**
 * `DELETE /api/session` — clear the session cookies (sign-out).
 *
 * The impersonation cookies go too. They are written host-only with their own
 * options, so the parent-domain clears above do not reach them — and a "sign
 * out" that left an operator still acting as the gym's owner would be a sign-out
 * in name only. Signing out is the blunter sibling of `/impersonation/exit`,
 * which drops only the impersonation and puts back the session underneath.
 */
export function DELETE(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', clearOptions());
  res.cookies.set(REFRESH_TOKEN_COOKIE, '', clearOptions());
  for (const name of IMPERSONATION_COOKIES) {
    res.cookies.set(name, '', impersonationCookieOptions(0));
  }
  return res;
}
