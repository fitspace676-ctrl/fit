// @fit/web — client-side auth helpers.
//
// Thin wrapper over the @fit/api auth endpoints. The session a successful sign-in
// returns is the same {@link TokenPair} every other auth route issues (access
// JWT + rotating refresh token); we persist it to localStorage so the rest of the
// app can attach the access token to API calls, AND mirror the access token into
// a cookie so the Next.js middleware / `getServerSession()` (which can't read
// localStorage) can authenticate requests. The two stores are kept in lock-step
// by {@link storeTokens} / {@link clearTokens}.

import { ACCESS_TOKEN_COOKIE, readUnverifiedSession } from './auth-session';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const ACCESS_TOKEN_KEY = 'fit.accessToken';
const REFRESH_TOKEN_KEY = 'fit.refreshToken';

/**
 * Optional parent domain for the auth cookie (e.g. `.fit.ge`) so the session is
 * shared across tenant subdomains and cleared everywhere on logout. Unset in
 * local dev (the cookie stays host-only on `localhost`).
 */
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

/** Fallback cookie lifetime when the token carries no `exp` (seconds). */
const DEFAULT_COOKIE_MAX_AGE = 3600;

/** A signed session: short-lived access JWT + opaque rotating refresh token. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Exchange a Google ID token (from Google Identity Services) for a Fit session.
 * POSTs to `POST /auth/google`; the API verifies the Google token and issues its
 * own {@link TokenPair}, which we persist before returning. Throws with the API's
 * error message on a non-2xx response.
 */
export async function loginWithGoogle(idToken: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Google sign-in failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  storeTokens(tokens);
  return tokens;
}

/**
 * Exchange an Apple ID token (from Sign in with Apple JS) for a Fit session.
 * POSTs to `POST /auth/apple`; the API verifies the Apple token and issues its
 * own {@link TokenPair}, which we persist before returning. `name` is forwarded
 * only on the first authorization (Apple omits it from the token and on returning
 * sign-ins), and the API uses it solely when creating a new account. Throws with
 * the API's error message on a non-2xx response.
 */
export async function loginWithApple(idToken: string, name?: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(name ? { idToken, name } : { idToken }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Apple sign-in failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  storeTokens(tokens);
  return tokens;
}

/**
 * Begin a password reset. POSTs the email to `POST /auth/forgot-password`; the
 * API mints a single-use reset token and emails the reset link. The response is
 * deliberately generic — it never reveals whether the address is registered — so
 * callers should surface the returned `message` as-is. Throws with the API's
 * error message on a non-2xx response.
 */
export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Password-reset request failed (${response.status})`);
  }

  return (await response.json()) as { message: string };
}

/**
 * Complete a password reset. POSTs the emailed `token` plus the new `password`
 * to `POST /auth/reset-password`; the API sets the new password, revokes all
 * existing sessions, and issues a fresh {@link TokenPair}, which we persist
 * before returning (the caller walks away signed in). Throws with the API's
 * error message on a non-2xx response.
 */
export async function resetPassword(token: string, password: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Password reset failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  storeTokens(tokens);
  return tokens;
}

/** Persist a session to localStorage + the auth cookie (no-op during SSR). */
export function storeTokens(tokens: TokenPair): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  writeAccessCookie(tokens.accessToken);
}

/** Read the stored access token, or null when signed out / during SSR. */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Clear the persisted session — localStorage and the auth cookie (sign-out). */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  clearAccessCookie();
}

/**
 * Client-side sign-out. Drops every persisted credential so the next request
 * fails the middleware gate and is redirected to `/login`. Setting
 * {@link COOKIE_DOMAIN} clears the cookie across all subdomains. The refresh
 * token's server-side revocation is handled separately by the auth API.
 */
export function logout(): void {
  clearTokens();
}

/** Mirror the access token into the `accessToken` cookie the middleware reads. */
function writeAccessCookie(accessToken: string): void {
  const session = readUnverifiedSession(accessToken);
  const exp = session ? extractExp(accessToken) : null;
  const maxAge = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : DEFAULT_COOKIE_MAX_AGE;

  const parts = [
    `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(accessToken)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'SameSite=Lax',
  ];
  if (window.location.protocol === 'https:') parts.push('Secure');
  if (COOKIE_DOMAIN) parts.push(`Domain=${COOKIE_DOMAIN}`);
  document.cookie = parts.join('; ');
}

/** Expire the auth cookie on the current host and (if set) the parent domain. */
function clearAccessCookie(): void {
  const base = [`${ACCESS_TOKEN_COOKIE}=`, 'Path=/', 'Max-Age=0', 'SameSite=Lax'];
  document.cookie = base.join('; ');
  if (COOKIE_DOMAIN) {
    document.cookie = [...base, `Domain=${COOKIE_DOMAIN}`].join('; ');
  }
}

/** Read the `exp` (unix seconds) from a JWT payload, or null. */
function extractExp(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(
      decodeURIComponent(
        atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
          .split('')
          .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join(''),
      ),
    ) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}
