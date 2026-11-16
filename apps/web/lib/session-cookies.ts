// @fit/web — the session cookies' attributes, in one place (edge-safe).
//
// Host-only, surface-specific cookies: admin and member sessions coexist on
// the same tenant host. Old shared accessToken/refreshToken cookies are never
// read or cleared here: neither surface may overwrite the other's session.
// Domain cleanup is restricted to this surface's names as well.

import type { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

/** Cookie holding the rotating refresh token (httpOnly; never exposed to JS). */
export const REFRESH_TOKEN_COOKIE = 'memberRefreshToken';

/** Both session cookies, for the paths that write or clear them together. */
export const SESSION_COOKIES = [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE] as const;

/** Options for a session cookie: httpOnly, host-only (no `domain`), `secure` outside dev. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** The parent domain the session cookies USED to be written on, or `null`. */
export function legacyCookieDomain(): string | null {
  const domain = (process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_COOKIE_DOMAIN)?.trim();
  return domain ? domain : null;
}

/** `Set-Cookie` values that expire the legacy parent-domain session cookies. */
export function legacySessionClearHeaders(): string[] {
  const domain = legacyCookieDomain();
  if (!domain) {
    return [];
  }
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return SESSION_COOKIES.map(
    (name) =>
      `${name}=; Domain=${domain}; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure}`,
  );
}

/**
 * Append the legacy parent-domain clears to `res`.
 *
 * Raw `Set-Cookie` headers rather than `res.cookies.set`, because that API keys
 * cookies by NAME: a host-only `accessToken` and a `Domain=` one cannot both be
 * written through it. And for the same reason this must run AFTER the last
 * `res.cookies.set` on the response — every `set` rebuilds the `set-cookie`
 * headers from its own map and would silently drop what was appended here.
 */
export function appendLegacySessionClear(res: NextResponse): void {
  for (const cookie of legacySessionClearHeaders()) {
    res.headers.append('set-cookie', cookie);
  }
}

/** Expire the session on `res` — host-only, and the legacy parent-domain copy. Call last. */
export function clearSessionCookies(res: NextResponse): void {
  for (const name of SESSION_COOKIES) {
    res.cookies.set(name, '', sessionCookieOptions(0));
  }
  appendLegacySessionClear(res);
}
