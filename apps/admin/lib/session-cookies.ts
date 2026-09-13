// @fit/admin — the session cookies' attributes, in one place (edge-safe).
//
// Written by `app/api/session` (sign-in / sign-out) and by the middleware
// (silent refresh, wrong-gym purge). Mirrors `apps/web/lib/session-cookies.ts`:
// both apps serve the same host (the console sits under `/admin` behind the web
// app's rewrite), so they must write the session identically.
//
// HOST-ONLY. These cookies used to be set on the parent domain
// (`COOKIE_DOMAIN=.formacore.io`) so one sign-in covered every gym's subdomain —
// which is exactly how a session from one gym walked into another gym's console.
// Nothing needs the sharing: the console is on the gym's own host, and the
// operator console keeps its own `ops*` cookies. So each host holds its own.
//
// `COOKIE_DOMAIN` / `NEXT_PUBLIC_COOKIE_DOMAIN` survive only to CLEAR: while set,
// every clear (and every fresh write) also expires the old parent-domain cookie,
// so sessions browsers still hold from before this change are removed.

import type { NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from './auth-session';
import { IMPERSONATION_COOKIES, impersonationCookieOptions } from './impersonation';

/** Cookie holding the rotating refresh token (httpOnly; never exposed to JS). */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/** Both session cookies, for the paths that write or clear them together. */
export const SESSION_COOKIES = [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE] as const;

/** Options for a session cookie: httpOnly, host-only (no `domain`), `secure` outside dev. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
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

/** Expire the impersonation cookies on `res` (host-only, their own options). */
export function clearImpersonationCookies(res: NextResponse): void {
  for (const name of IMPERSONATION_COOKIES) {
    res.cookies.set(name, '', impersonationCookieOptions(0));
  }
}

/**
 * Expire the session on `res` — host-only, and the legacy parent-domain copy.
 * Call it after any other `res.cookies.set` (see {@link appendLegacySessionClear}).
 */
export function clearSessionCookies(res: NextResponse): void {
  for (const name of SESSION_COOKIES) {
    res.cookies.set(name, '', sessionCookieOptions(0));
  }
  appendLegacySessionClear(res);
}
