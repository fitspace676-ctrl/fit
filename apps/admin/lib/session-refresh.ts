// @fit/admin — middleware-side session refresh (edge runtime).
//
// The access token is short-lived (15 min); without a refresh step an expired
// token bounces staff back to the web app's sign-in even though they hold a valid
// 30-day refresh token — the "logged out after a few minutes" symptom. This lets
// the admin middleware silently mint a new session from the refresh cookie.
//
// The API rotates the refresh token on every use and revokes the whole family on
// reuse detection, so the middleware refreshes AT MOST ONCE per user action:
// `isNavigationRequest` gates it to real navigations, never link prefetches or
// the parallel sub-requests that would race rotation into a family revocation.

import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

/** Cookie holding the rotating refresh token (httpOnly; shared with the web app). */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/** Base URL of the @fit/api backend. */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Parent cookie domain (shared across tenant subdomains + apps); host-only in dev. */
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN ?? process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

/** Refresh-cookie lifetime (seconds) — matches the API's 30-day refresh TTL. */
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

/** Access-cookie lifetime when the token carries no `exp` (seconds). */
const DEFAULT_ACCESS_MAX_AGE = 60 * 60;

/** A freshly-rotated token pair from `POST /auth/refresh`. */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/** A `Set-Cookie`-ready descriptor for a refreshed session cookie. */
export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
    domain?: string;
  };
}

/**
 * Whether this request is a genuine navigation we should spend a refresh on, so
 * rotation stays single-flight per user action.
 *
 * **Only a document load qualifies.** This used to also accept an RSC navigation
 * (`rsc: 1`) and to exclude prefetches by their headers, but none of those
 * headers survive to middleware: behind the tenant proxy the request arrives
 * carrying `sec-fetch-*` and `x-forwarded-*` and nothing else — no `rsc`, no
 * `next-router-prefetch`, no `purpose`. Those branches were therefore dead code
 * that read as though RSC navigations were covered when they never were, which is
 * how an expired token survived long enough to answer a `router.refresh()` with a
 * redirect to the sign-in page and empty the console's whole sidebar.
 *
 * The prefetch guards are kept for the case where the headers do reach us (a
 * direct, unproxied deployment): they cost nothing and still express the intent.
 */
export function isNavigationRequest(req: NextRequest): boolean {
  if (req.headers.get('next-router-prefetch')) return false;
  const purpose = req.headers.get('purpose') ?? req.headers.get('x-purpose');
  if (purpose === 'prefetch') return false;
  return req.headers.get('sec-fetch-dest') === 'document';
}

/** Exchange a refresh token for a fresh pair via `POST /auth/refresh`, or `null`. */
export async function refreshTokens(refreshToken: string): Promise<RefreshedTokens | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { accessToken?: unknown; refreshToken?: unknown };
    if (typeof data.accessToken === 'string' && typeof data.refreshToken === 'string') {
      return { accessToken: data.accessToken, refreshToken: data.refreshToken };
    }
    return null;
  } catch {
    return null;
  }
}

/** Seconds until the access token's `exp`, or the fallback lifetime (edge-safe). */
function accessTokenMaxAge(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) return DEFAULT_ACCESS_MAX_AGE;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(b64)) as { exp?: unknown };
    if (typeof claims.exp === 'number') {
      return Math.max(0, claims.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    /* fall through to the default */
  }
  return DEFAULT_ACCESS_MAX_AGE;
}

/** The two httpOnly cookie descriptors that carry a refreshed session forward. */
export function sessionCookies(pair: RefreshedTokens): SessionCookie[] {
  const base = {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
  return [
    {
      name: ACCESS_TOKEN_COOKIE,
      value: pair.accessToken,
      options: { ...base, maxAge: accessTokenMaxAge(pair.accessToken) },
    },
    {
      name: REFRESH_TOKEN_COOKIE,
      value: pair.refreshToken,
      options: { ...base, maxAge: REFRESH_MAX_AGE },
    },
  ];
}
