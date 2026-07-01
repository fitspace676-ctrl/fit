// @fit/web — client-side auth helpers.
//
// Thin wrapper over the @fit/api auth endpoints. A successful sign-in returns a
// {@link TokenPair} (access JWT + rotating refresh token); rather than keep it in
// JS-reachable storage (localStorage / a JS-written cookie, both readable by
// XSS), we hand it to the same-origin `POST /api/session` route, which sets it as
// **httpOnly** cookies the Next.js middleware / `getServerSession()` read. The
// token therefore never lives anywhere client JS can read it.

import { extractGymSlug } from '@fit/utils';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * The gym slug the current page is served under (`<slug>.<root>`), or `null` on
 * the apex / a preview URL. Read from the live browser Host so a credentials
 * sign-in on a tenant subdomain binds the session to that gym; a no-op during
 * SSR (no `window`).
 */
function currentGymSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return extractGymSlug(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
}

/** Same-origin route that owns the httpOnly session cookies. */
const SESSION_ENDPOINT = '/api/session';

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
  await storeTokens(tokens);
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
  await storeTokens(tokens);
  return tokens;
}

/**
 * Register a new account with email + password. POSTs to `POST /auth/register`;
 * the API creates the (unverified) account and emails a verification link, then
 * returns a generic acknowledgement. No session is issued yet — the user must
 * verify their email before they can sign in — so, unlike the OAuth helpers,
 * this returns the `message` rather than a {@link TokenPair}. Throws with the
 * API's error message on a non-2xx response.
 */
export async function registerWithCredentials(input: {
  name: string;
  email: string;
  password: string;
  /** Staff-invite token (T4.7), forwarded when the sign-up came from an invite link. */
  inviteToken?: string;
}): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Registration failed (${response.status})`);
  }

  return (await response.json()) as { message: string };
}

/**
 * Sign in with an email + password pair. POSTs to `POST /auth/login`; the API
 * verifies the credentials and issues a {@link TokenPair}, which we persist
 * before returning (the caller walks away signed in). Throws with the API's
 * error message on a non-2xx response.
 */
export async function loginWithCredentials(
  email: string,
  password: string,
  inviteToken?: string,
): Promise<TokenPair> {
  const gymSlug = currentGymSlug();
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(gymSlug ? { gymSlug } : {}),
      ...(inviteToken ? { inviteToken } : {}),
    }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Sign-in failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  await storeTokens(tokens);
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
  await storeTokens(tokens);
  return tokens;
}

/**
 * Persist a session by handing the tokens to the same-origin `POST /api/session`
 * route, which sets them as httpOnly cookies. The tokens are never written to
 * localStorage or a JS-readable cookie, so client JS (and any XSS) can't read
 * them back. No-op during SSR.
 */
export async function storeTokens(tokens: TokenPair): Promise<void> {
  if (typeof window === 'undefined') return;
  await fetch(SESSION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tokens),
    credentials: 'same-origin',
  });
}

/**
 * Client-side sign-out. Asks `DELETE /api/session` to expire the httpOnly
 * session cookies (across subdomains when a cookie domain is configured) so the
 * next request fails the middleware gate and is redirected to `/login`. The
 * refresh token's server-side revocation is handled separately by the auth API.
 */
export async function logout(): Promise<void> {
  if (typeof window === 'undefined') return;
  await fetch(SESSION_ENDPOINT, { method: 'DELETE', credentials: 'same-origin' });
}

/**
 * Where to send a user right after they sign in.
 *
 * An explicit, already-validated `from` (the path the middleware stashed when it
 * bounced them to login) always wins. Otherwise we look at the freshly-set
 * session: **staff** (any role other than `MEMBER`) land in the admin console at
 * `/admin` — the tenant proxy serves it at the same origin — while members go to
 * their localized home. The session is read from the verified `GET /api/session`
 * (the sign-in has already persisted the cookie); any failure falls back to the
 * member home, so a hiccup never traps someone on the login page.
 */
export async function postLoginPath(from: string | null, locale: string): Promise<string> {
  if (from) return from;
  try {
    const res = await fetch(SESSION_ENDPOINT, { credentials: 'same-origin' });
    if (res.ok) {
      const { user } = (await res.json()) as { user: { role?: string } | null };
      if (user?.role && user.role !== 'MEMBER') return '/admin';
    }
  } catch {
    /* fall through to the member home */
  }
  return `/${locale}`;
}
