// @fit/mobile — client-side auth helpers (mirror of apps/web/lib/auth.ts).
//
// Exchanges a Google ID token for a Fit session via the @fit/api auth endpoint.
// The session is held in memory for now; durable secure storage (expo-secure-store)
// is a separate concern that lands when the authenticated app shell is built.

/** Base URL of the @fit/api backend (inlined at build via EXPO_PUBLIC_*). */
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** A signed session: short-lived access JWT + opaque rotating refresh token. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

let session: TokenPair | null = null;

/**
 * Exchange a Google ID token (from Google Sign-In) for a Fit session. POSTs to
 * `POST /auth/google`; the API verifies the Google token and issues its own
 * {@link TokenPair}, which is cached in memory before returning. Throws with the
 * API's error message on a non-2xx response.
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
  session = tokens;
  return tokens;
}

/**
 * Exchange an Apple ID token (from `expo-apple-authentication`) for a Fit
 * session. POSTs to `POST /auth/apple`; the API verifies the Apple token and
 * issues its own {@link TokenPair}, cached in memory before returning. `name` is
 * available only on the first authorization (Apple omits it afterwards) and the
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
  session = tokens;
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
 * existing sessions, and issues a fresh {@link TokenPair}, cached in memory
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
  session = tokens;
  return tokens;
}

/** The current in-memory session, or null when signed out. */
export function getSession(): TokenPair | null {
  return session;
}

/** Drop the in-memory session (client-side sign-out). */
export function clearSession(): void {
  session = null;
}
