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
