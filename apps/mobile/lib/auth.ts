// @fit/mobile — client-side auth helpers (mirror of apps/web/lib/auth.ts).
//
// Exchanges a provider ID token (or a password-reset token) for a Fit session
// via the @fit/api auth endpoints and persists the resulting {@link TokenPair}
// to the keychain through `auth-storage`, so the session survives an app
// relaunch and is observable via `useAuth`.

import { clearTokens, getSessionSnapshot, saveTokens, type TokenPair } from './auth-storage';

// Re-exported so existing consumers (the sign-in hooks) keep importing the
// session shape from here; it is defined in `auth-storage`, which owns persistence.
export type { TokenPair };

/** Base URL of the @fit/api backend (inlined at build via EXPO_PUBLIC_*). */
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Exchange an email + password for a Fit session. POSTs to `POST /auth/login`;
 * the API verifies the credentials and issues a {@link TokenPair}, persisted to
 * the keychain before returning (the caller walks away signed in). Throws with
 * the API's error message on a non-2xx response (e.g. wrong password, or an
 * unverified email).
 */
export async function loginWithPassword(email: string, password: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Sign-in failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  await saveTokens(tokens);
  return tokens;
}

/**
 * Create a new account. POSTs to `POST /auth/register`; the API creates the user
 * and emails a verification link, returning a generic acknowledgement. No
 * session is issued here — the account is dormant until the emailed link is
 * opened (which routes back into the app at {@link verifyEmail}) — so this does
 * NOT persist tokens. Throws with the API's error message on a non-2xx response.
 */
export async function register(
  email: string,
  password: string,
  name: string,
): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Registration failed (${response.status})`);
  }

  return (await response.json()) as { message: string };
}

/**
 * Verify an email address from the emailed link's single-use token. Calls
 * `GET /auth/verify?token=…`; the API marks the address verified and issues the
 * account's first {@link TokenPair}, persisted to the keychain before returning
 * (the caller walks away signed in). Throws with the API's error message on a
 * non-2xx response (e.g. an expired or already-used token).
 */
export async function verifyEmail(token: string): Promise<TokenPair> {
  const response = await fetch(`${API_URL}/auth/verify?token=${encodeURIComponent(token)}`);

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Email verification failed (${response.status})`);
  }

  const tokens = (await response.json()) as TokenPair;
  await saveTokens(tokens);
  return tokens;
}

/**
 * Exchange a Google ID token (from Google Sign-In) for a Fit session. POSTs to
 * `POST /auth/google`; the API verifies the Google token and issues its own
 * {@link TokenPair}, which is persisted to the keychain before returning. Throws
 * with the API's error message on a non-2xx response.
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
  await saveTokens(tokens);
  return tokens;
}

/**
 * Exchange an Apple ID token (from `expo-apple-authentication`) for a Fit
 * session. POSTs to `POST /auth/apple`; the API verifies the Apple token and
 * issues its own {@link TokenPair}, persisted to the keychain before returning.
 * `name` is available only on the first authorization (Apple omits it afterwards) and the
 * API uses it solely when creating a new account. Throws with the API's error
 * message on a non-2xx response.
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
  await saveTokens(tokens);
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
 * existing sessions, and issues a fresh {@link TokenPair}, persisted to the
 * keychain before returning (the caller walks away signed in). Throws with the
 * API's error message on a non-2xx response.
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
  await saveTokens(tokens);
  return tokens;
}

/**
 * The last-known session without an async keychain read, or null when signed
 * out / before hydration. Reactive consumers should use the `useAuth` hook
 * instead; this stays for callers that need a one-off synchronous peek.
 */
export function getSession(): TokenPair | null {
  return getSessionSnapshot();
}

/** Drop the persisted session (client-side sign-out). Prefer `useAuth().logout()`. */
export function clearSession(): void {
  void clearTokens();
}
