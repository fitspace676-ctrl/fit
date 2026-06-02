// @fit/admin — session cookie endpoint.
//
// The admin console has no sign-in of its own — operators arrive with the
// httpOnly session cookie set on the shared parent domain by the web app's
// `POST /api/session`. So this route only needs to *read* the session
// (`GET`, for the client `useSession()` hook, which can't read an httpOnly
// cookie) and *clear* it (`DELETE`, sign-out).

import { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { getServerSession } from '@/lib/session';

/** Cookie holding the rotating refresh token (httpOnly; never exposed to JS). */
const REFRESH_TOKEN_COOKIE = 'refreshToken';

/**
 * Parent domain for the cookies (e.g. `.fit.ge`) so sign-out clears the session
 * across every tenant subdomain. Unset in local dev.
 */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

/** httpOnly cookie-clear options; `secure` only outside local dev. */
function clearOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

/** `GET /api/session` — the verified session, for the client `useSession()` hook. */
export async function GET(): Promise<NextResponse> {
  const user = await getServerSession();
  return NextResponse.json({ user });
}

/** `DELETE /api/session` — clear the session cookies (sign-out). */
export function DELETE(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(ACCESS_TOKEN_COOKIE, '', clearOptions());
  res.cookies.set(REFRESH_TOKEN_COOKIE, '', clearOptions());
  return res;
}
