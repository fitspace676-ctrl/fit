// @fit/superadmin — middleware-side session refresh (edge runtime).
//
// The access token lives 15 minutes; without a refresh step an operator who left
// the console open over lunch is bounced to the sign-in page even though their
// 30-day refresh token is perfectly good. This lets the middleware silently mint
// a new session from the refresh cookie.
//
// The API rotates the refresh token on every use and revokes the whole family on
// reuse detection, so the middleware refreshes AT MOST ONCE per user action:
// `isNavigationRequest` gates it to real navigations, never link prefetches or
// the parallel sub-requests that would race rotation into a family revocation.

import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@/lib/auth-session';

/** Base URL of the @fit/api backend. */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Refresh-cookie lifetime (seconds) — matches the API's 30-day refresh TTL. */
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

/** Access-cookie lifetime when the token carries no `exp` (seconds). */
const DEFAULT_ACCESS_MAX_AGE = 60 * 60;

/** A freshly-rotated token pair from `POST /auth/refresh`. */
export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/** A `Set-Cookie`-ready descriptor for an operator session cookie. */
export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: string;
    maxAge: number;
  };
}

/**
 * Whether this request is a genuine navigation worth spending a refresh on, so
 * rotation stays single-flight per user action. Only a document load qualifies:
 * an RSC fetch or a prefetch carries no user intent, and refreshing on those
 * races the API's single-use rotation into a family revocation — which the user
 * experiences as being logged out at random.
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
export function accessTokenMaxAge(token: string): number {
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

/**
 * Shared cookie options for the operator session.
 *
 * **No `domain`.** Every other surface sets its session on the parent domain so
 * a tenant sign-in spans `<slug>.formacore.io` and its `/admin`; this one is
 * deliberately host-only, pinned to `superadmin.formacore.io`. An operator
 * session has no business travelling to a tenant host — and once impersonation
 * lands, a token that did travel would be the one thing able to clobber the
 * session that issued it.
 */
function cookieOptions(maxAge: number): SessionCookie['options'] {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** The two httpOnly cookie descriptors that carry an operator session forward. */
export function sessionCookies(pair: RefreshedTokens): SessionCookie[] {
  return [
    {
      name: ACCESS_TOKEN_COOKIE,
      value: pair.accessToken,
      options: cookieOptions(accessTokenMaxAge(pair.accessToken)),
    },
    {
      name: REFRESH_TOKEN_COOKIE,
      value: pair.refreshToken,
      options: cookieOptions(REFRESH_MAX_AGE),
    },
  ];
}

/** The same descriptors with an empty value and a zero lifetime — sign-out. */
export function clearedSessionCookies(): SessionCookie[] {
  return [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE].map((name) => ({
    name,
    value: '',
    options: cookieOptions(0),
  }));
}
