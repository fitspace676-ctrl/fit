// @fit/mobile — authenticated API client with silent token refresh.
//
// The contract is "axios-interceptor" shaped — a request step that attaches the
// access token and a response step that, on a 401, silently refreshes once and
// retries — but the whole monorepo (web + mobile) talks to @fit/api over `fetch`
// and ships no axios dependency, so this reproduces those interceptor semantics
// on `fetch` rather than pulling in a second HTTP stack.
//
// Flow for every `apiFetch` call:
//   request  → attach `Authorization: Bearer <accessToken>` from SecureStore
//   response → 200…  : return as-is
//              401    : POST /auth/refresh ONCE (rotating the refresh token,
//                       de-duplicated so concurrent 401s share one refresh),
//                       persist the new pair, retry the original request once
//              401 #2 : clear the keychain and hand off to the unauthorized
//                       handler (navigate to /login) — the session is dead

import { router } from 'expo-router';
import { clearTokens, getTokens, saveTokens, type TokenPair } from './auth-storage';

/** Base URL of the @fit/api backend (inlined at build via EXPO_PUBLIC_*). */
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

// In-flight refresh shared across callers: if three requests 401 at once they
// trigger ONE /auth/refresh, not three (which would burn the rotating token and
// fail the family-reuse check).
let refreshInFlight: Promise<TokenPair | null> | null = null;

// Called when the session is unrecoverable (refresh failed / second 401). The
// app shell can override this; the default sends the user to the login screen.
let onUnauthorized: () => void = () => {
  router.replace('/login');
};

/**
 * Override the handler invoked when a session can no longer be refreshed
 * (e.g. to clear in-memory app state before navigating). Defaults to
 * redirecting to `/login`.
 */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

/**
 * Exchange the stored refresh token for a fresh {@link TokenPair} via
 * `POST /auth/refresh`, persist it, and return it — or null when there is no
 * refresh token or the server rejects it. De-duplicated: concurrent callers
 * await the same request. Uses a raw `fetch` (never `apiFetch`) so a failed
 * refresh can't recurse into itself.
 */
async function refreshSession(): Promise<TokenPair | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const current = await getTokens();
    if (!current) return null;

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    }).catch(() => null);

    if (!response || !response.ok) return null;

    const tokens = (await response.json().catch(() => null)) as TokenPair | null;
    if (!tokens?.accessToken || !tokens?.refreshToken) return null;

    await saveTokens(tokens);
    return tokens;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/** Merge an `Authorization: Bearer` header onto the caller's init (if a token exists). */
function withAuth(init: RequestInit, accessToken: string | undefined): RequestInit {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return { ...init, headers };
}

/**
 * Make an authenticated request to @fit/api. `path` is an API-relative path
 * (e.g. `/me`); the access token is attached automatically. On a 401 the access
 * token is silently refreshed once and the request retried; if it still 401s the
 * session is cleared and the unauthorized handler runs. Returns the `Response`
 * for the caller to parse (it is NOT thrown on non-2xx, mirroring `fetch`).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await getTokens();

  const first = await fetch(`${API_URL}${path}`, withAuth(init, session?.accessToken));
  if (first.status !== 401) return first;

  // Access token expired / rejected — attempt a single silent refresh + retry.
  const refreshed = await refreshSession();
  if (!refreshed) {
    await endSession();
    return first;
  }

  const retried = await fetch(`${API_URL}${path}`, withAuth(init, refreshed.accessToken));
  if (retried.status === 401) {
    // Refresh succeeded but the retry is still unauthorized — the session is
    // genuinely dead (e.g. the account was disabled). Give up.
    await endSession();
  }
  return retried;
}

/** Tear down a dead session: clear the keychain and notify the app. */
async function endSession(): Promise<void> {
  await clearTokens();
  onUnauthorized();
}

export { API_URL };
