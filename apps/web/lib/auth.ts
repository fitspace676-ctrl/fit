// @fit/web — client-side auth helpers.
//
// Thin wrapper over the @fit/api auth endpoints. A successful sign-in returns a
// {@link TokenPair} (access JWT + rotating refresh token); rather than keep it in
// JS-reachable storage (localStorage / a JS-written cookie, both readable by
// XSS), we hand it to the same-origin `POST /api/session` route, which sets it as
// **httpOnly** cookies the Next.js middleware / `getServerSession()` read. The
// token therefore never lives anywhere client JS can read it.

import {
  GYM_SELECTION_REQUIRED_CODE,
  MEMBERSHIP_NOT_ACTIVE_CODE,
  NOT_A_MEMBER_CODE,
  gymSelectionOptions,
  type GymSelectionOption,
  type ResetPasswordResponse,
} from '@fit/types';
import { extractGymSlug } from '@fit/utils';
import { browserTenantHeaders } from './tenant-host';

/**
 * The headers every account request carries. `Accept-Language` is the interface
 * language the visitor is reading (the `<html lang>` the locale layout sets), so
 * the API sends the verification / reset email in the same language as the
 * screen that triggered it.
 */
function accountHeaders(): Record<string, string> {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';
  return {
    'Content-Type': 'application/json',
    ...browserTenantHeaders(),
    ...(lang ? { 'Accept-Language': lang } : {}),
  };
}

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
  return (
    extractGymSlug(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN) ??
    // Dev-only fallback for hosts that carry no tenant label (see
    // `NEXT_PUBLIC_DEV_GYM_SLUG` in lib/env.ts). Unset in production.
    process.env.NEXT_PUBLIC_DEV_GYM_SLUG?.trim() ??
    null
  );
}

/** Same-origin route that owns the httpOnly session cookies. */
const SESSION_ENDPOINT = '/api/session';

/** A signed session: short-lived access JWT + opaque rotating refresh token. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * A refused sign-in. `code` is the API's machine-readable reason
 * (`NOT_A_MEMBER`, `MEMBERSHIP_NOT_ACTIVE`, `GYM_SUSPENDED`, …) so the screen can
 * say it in the visitor's language; `message` stays the API's own text.
 */
export class SignInError extends Error {
  readonly code: string | undefined;
  /**
   * The gyms a `409 GYM_SELECTION_REQUIRED` offers (T1.25): the password opened
   * the address at more than one gym and the sign-in named none (the apex host).
   * The form asks which and signs in again with that `gymSlug`. Empty otherwise.
   */
  readonly gyms: GymSelectionOption[];

  constructor(message: string, code?: string, gyms: GymSelectionOption[] = []) {
    super(message);
    this.name = 'SignInError';
    this.code = code;
    this.gyms = gyms;
  }
}

/** The {@link SignInError} a non-2xx sign-in response describes. */
async function signInError(response: Response, fallback: string): Promise<SignInError> {
  const detail = (await response.json().catch(() => null)) as {
    message?: string;
    code?: string;
  } | null;
  return new SignInError(
    detail?.message ?? `${fallback} (${response.status})`,
    detail?.code,
    gymSelectionOptions(detail) ?? [],
  );
}

/** Whether a refused sign-in is the API asking which gym to continue on. */
export function isGymSelectionRequired(error: unknown): error is SignInError {
  return (
    error instanceof SignInError &&
    error.code === GYM_SELECTION_REQUIRED_CODE &&
    error.gyms.length > 0
  );
}

/** The `auth` message keys a sign-in refusal has its own copy for. */
export type SignInErrorKey =
  | 'login.errors.notAMember'
  | 'login.errors.membershipNotActive'
  | 'login.errors.gymSuspended';

/**
 * The localized message key for a refused sign-in, or `null` when the refusal
 * has no copy of its own (the caller shows the API's message instead).
 */
export function signInErrorKey(error: unknown): SignInErrorKey | null {
  if (!(error instanceof SignInError)) return null;
  switch (error.code) {
    case NOT_A_MEMBER_CODE:
      return 'login.errors.notAMember';
    case MEMBERSHIP_NOT_ACTIVE_CODE:
      return 'login.errors.membershipNotActive';
    case 'GYM_SUSPENDED':
      return 'login.errors.gymSuspended';
    default:
      return null;
  }
}

/**
 * Exchange a Google ID token (from Google Identity Services) for a Fit session.
 * POSTs to `POST /auth/google` with this page's gym, as the credentials sign-in
 * does, so the session binds to the gym whose site this is; the API verifies the
 * Google token and issues its own {@link TokenPair}, which we persist before
 * returning. Throws a {@link SignInError} on a non-2xx response.
 */
export async function loginWithGoogle(idToken: string): Promise<TokenPair> {
  const gymSlug = currentGymSlug();
  const response = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { ...browserTenantHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, ...(gymSlug ? { gymSlug } : {}) }),
  });

  if (!response.ok) {
    throw await signInError(response, 'Google sign-in failed');
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
 * sign-ins), and the API uses it solely when creating a new account. This page's
 * gym goes with it, as on Google. Throws a {@link SignInError} on a non-2xx
 * response.
 */
export async function loginWithApple(idToken: string, name?: string): Promise<TokenPair> {
  const gymSlug = currentGymSlug();
  const response = await fetch(`${API_URL}/auth/apple`, {
    method: 'POST',
    headers: { ...browserTenantHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, ...(name ? { name } : {}), ...(gymSlug ? { gymSlug } : {}) }),
  });

  if (!response.ok) {
    throw await signInError(response, 'Apple sign-in failed');
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
    headers: accountHeaders(),
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
 *
 * The gym whose password is checked is this page's (`<slug>.<root>`), or, off a
 * tenant host, `gymSlug` — the one the visitor picked after a
 * `409 GYM_SELECTION_REQUIRED` ({@link isGymSelectionRequired}).
 */
export async function loginWithCredentials(
  email: string,
  password: string,
  inviteToken?: string,
  chosenGymSlug?: string,
): Promise<TokenPair> {
  const gymSlug = currentGymSlug() || chosenGymSlug || null;
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { ...browserTenantHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      ...(gymSlug ? { gymSlug } : {}),
      ...(inviteToken ? { inviteToken } : {}),
    }),
  });

  if (!response.ok) {
    throw await signInError(response, 'Sign-in failed');
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
    headers: accountHeaders(),
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
 * to `POST /auth/reset-password`, naming this page's host in `x-tenant-host`; the
 * API sets the new password and revokes all existing sessions. On a gym host it
 * issues a session bound to that gym only when the account is an active member
 * there — `sessionIssued: false` otherwise, and the caller sends the user to sign
 * in. An issued {@link TokenPair} is persisted before returning. Throws with the
 * API's error message on a non-2xx response.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<ResetPasswordResponse> {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { ...browserTenantHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Password reset failed (${response.status})`);
  }

  const result = (await response.json()) as ResetPasswordResponse;
  if (result.sessionIssued) {
    await storeTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
  }
  return result;
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
 * next request fails the middleware gate and is redirected to `/member/login`. The
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
 * their localized member home (`/<locale>/member/home`). The session is read from the verified `GET /api/session`
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
  return `/${locale}/member/home`;
}
