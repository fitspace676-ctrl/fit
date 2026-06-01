// @fit/web — client-side auth helpers.
//
// Thin wrapper over the @fit/api auth endpoints. The session a successful sign-in
// returns is the same {@link TokenPair} every other auth route issues (access
// JWT + rotating refresh token); we persist it to localStorage so the rest of the
// app can attach the access token to API calls.

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const ACCESS_TOKEN_KEY = 'fit.accessToken';
const REFRESH_TOKEN_KEY = 'fit.refreshToken';

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

/** Persist a session to localStorage (no-op during SSR). */
export function storeTokens(tokens: TokenPair): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/** Read the stored access token, or null when signed out / during SSR. */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Clear the persisted session (client-side sign-out). */
export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
