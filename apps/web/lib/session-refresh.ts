// @fit/web — middleware-side session refresh (edge runtime).
//
// The access token is short-lived (15 min); on its own, an expired token would
// bounce the user to the login page even though they hold a valid 30-day refresh
// token. This helper lets the middleware silently mint a new session from the
// refresh cookie so a signed-in user stays signed in for the refresh window.
//
// The API rotates the refresh token on every use and revokes the whole family if
// a spent token is presented again (reuse detection). So the middleware must
// refresh AT MOST ONCE per user action — `isNavigationRequest` gates it to real
// navigations, never link prefetches or the parallel sub-requests that would race
// each other into a family revocation (and log the user out).

import type { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

/** Cookie holding the rotating refresh token (httpOnly; never exposed to JS). */
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/** Base URL of the @fit/api backend. */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Parent cookie domain (shared across tenant subdomains); host-only in dev. */
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

/**
 * Whether this request is a genuine navigation we should spend a refresh on — a
 * document load or an App-Router RSC navigation, but never a link *prefetch* or a
 * background sub-request. Refreshing only here keeps rotation single-flight per
 * user action, so concurrent requests can't race the API's reuse detection into
 * revoking the session.
 */
export function isNavigationRequest(req: NextRequest): boolean {
  // Link prefetches must never spend the (single-use) refresh token.
  if (req.headers.get('next-router-prefetch')) return false;
  const purpose = req.headers.get('purpose') ?? req.headers.get('x-purpose');
  if (purpose === 'prefetch') return false;

  const dest = req.headers.get('sec-fetch-dest');
  // A top-level document load, or a client-side RSC navigation (Next sets `RSC`).
  return dest === 'document' || req.headers.get('rsc') === '1';
}

/**
 * Exchange a refresh token for a fresh pair via `POST /auth/refresh`. Returns the
 * new pair, or `null` on any failure (unknown/expired/rotated token, network) so
 * the caller falls back to the login redirect.
 */
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

/**
 * Persist a refreshed pair onto the outgoing response as the same httpOnly
 * cookies the sign-in route sets, so the browser carries the new session forward.
 */
export function setSessionCookies(res: NextResponse, pair: RefreshedTokens): void {
  const base = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
  res.cookies.set(ACCESS_TOKEN_COOKIE, pair.accessToken, {
    ...base,
    maxAge: accessTokenMaxAge(pair.accessToken),
  });
  res.cookies.set(REFRESH_TOKEN_COOKIE, pair.refreshToken, { ...base, maxAge: REFRESH_MAX_AGE });
}
