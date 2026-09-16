// @fit/mobile — the single source of truth for "the current session".
//
// Architecture kept from the deleted app (it was that app's best module):
// SecureStore for durability + an **in-memory snapshot** + a subscriber set, so
// React reads it through `useSyncExternalStore` and the HTTP client reads it
// synchronously. The keychain is touched exactly twice in a session's life —
// once to hydrate at launch, once per write — never on the request path. The old
// client hit SecureStore twice per API call (`getTokens()` on the way in, again
// on refresh); at ~8 requests on a home-screen fan-out that is 16 keychain round
// trips to learn something already in RAM.
//
// Two deliberate changes from the salvage:
//
//   1. **The storage is injected.** `expo-secure-store` imports native code, so
//      a module that imports it statically cannot run under Vitest. The adapter
//      is a three-method interface; the spec passes a fake and this module stays
//      in the fast suite (§5).
//   2. **`clearTokens` is private; `endSession()` is the export.** Clearing the
//      keychain without clearing the query cache is defect #3 — every gym-scoped
//      entry survives the sign-out and the next member sees the previous
//      member's data. Making the unsafe half unreachable is the fix.

import { queryClient } from '../query-client';
import { decodeSessionClaims, type SessionClaims } from './claims';

/** A signed session: a short-lived access JWT + an opaque rotating refresh token. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * The three operations this app needs from secure storage. Deliberately not
 * `expo-secure-store`'s full surface — a narrow port is what makes the fake in
 * the spec a two-line object rather than a mock of a native module.
 */
export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

// Keychain / Keystore account names. No token value is ever part of a key, and
// no key name carries a secret.
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

let storage: SecureStorageAdapter | null = null;

/**
 * Install the secure-storage backend. Called once at app startup with the
 * `expo-secure-store` adapter, and by every spec with a fake.
 */
export function setSecureStorage(adapter: SecureStorageAdapter | null): void {
  storage = adapter;
}

/**
 * The installed adapter. Shared with the other keychain-backed stores in this
 * directory (`onboarding-store`, `device-id`) so the app installs a backend
 * once rather than three times.
 *
 * Throws rather than degrading to an in-memory map: a silent fallback would
 * "work" in development and then lose the user's session on every cold start in
 * production, which is a far worse failure than a loud one at boot.
 */
export function getSecureStorage(): SecureStorageAdapter {
  if (storage === null) {
    throw new Error(
      'Secure storage is not installed — call installExpoSecureStore() (app) or setSecureStorage() (tests) first.',
    );
  }
  return storage;
}

/**
 * Install `expo-secure-store` as the backend. Called once, by the launch gate in
 * `providers/index.tsx`, **before** {@link hydrateSession} — nothing else in the
 * app may call it, and nothing else did: for a while nothing called it at all,
 * which left `storage` null, every write throwing, and every sign-in failing at
 * `saveTokens` with the API's token pair already in hand.
 *
 * `require`, NOT `await import('expo-secure-store')`, for the same reason
 * `installReactNativeBridges` uses one: the require lives inside the function
 * body, so `lib/` still has no static native import and the Vitest suite (which
 * never calls this) stays renderer-free — but unlike a dynamic `import()` it
 * needs no ESM loader, so it also works under `jest-expo`, where `import()`
 * inside a VM context fails outright with
 * `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`. A boot step that cannot run in
 * the render-test runner is a boot step no render test can prove.
 *
 * Synchronous, which is what makes "installed before the first read" a fact the
 * caller can see rather than a promise it has to sequence: `require` resolves
 * the module in-process, so there is no window in which the app is running with
 * no backend.
 */
export function installExpoSecureStore(): void {
  // THE WEB PREVIEW HAS NO KEYCHAIN. `expo-secure-store`'s web build is a
  // literal `export default {}`, so every `setItemAsync` throws — a login that
  // the API answered with a 200 dies at `saveTokens`, and the screen shows the
  // generic error with a valid token pair in hand. `localStorage` is the
  // browser's nearest equivalent and is enough for what the web bundle IS: a
  // development surface (`expo start --web`, the DevApp phone panel). The
  // shipped app is native and never reaches this branch — `localStorage` is
  // undefined under Hermes/JSC.
  if (typeof localStorage !== 'undefined') {
    setSecureStorage({
      getItem: (key) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key, value) => {
        localStorage.setItem(key, value);
        return Promise.resolve();
      },
      deleteItem: (key) => {
        localStorage.removeItem(key);
        return Promise.resolve();
      },
    });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const secureStore = require('expo-secure-store') as {
    getItemAsync(key: string): Promise<string | null>;
    setItemAsync(key: string, value: string): Promise<void>;
    deleteItemAsync(key: string): Promise<void>;
  };
  setSecureStorage({
    getItem: (key) => secureStore.getItemAsync(key),
    setItem: (key, value) => secureStore.setItemAsync(key, value),
    deleteItem: (key) => secureStore.deleteItemAsync(key),
  });
}

// The in-memory mirror. `snapshot`'s *reference* only changes on save / clear /
// hydrate, which is what keeps `useSyncExternalStore` from re-rendering on every
// commit. `claims` is decoded once per write, not once per read: the decode is
// cheap but it is on the render path of every gym-scoped screen.
let snapshot: TokenPair | null = null;
let claims: SessionClaims | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) {
    notify();
  }
}

function setSnapshot(next: TokenPair | null): void {
  snapshot = next;
  claims = next === null ? null : decodeSessionClaims(next.accessToken);
  emit();
}

/** Subscribe to session changes (save / clear / hydrate). Returns an unsubscribe. */
export function subscribeSession(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * The current session, read synchronously from memory. `null` before hydration
 * and while signed out. This — not the keychain — is what the HTTP client reads
 * on every request.
 */
export function getSessionSnapshot(): TokenPair | null {
  return snapshot;
}

/** The current access token, or `null`. */
export function getAccessToken(): string | null {
  return snapshot?.accessToken ?? null;
}

/**
 * The decoded claims of the current access token, or `null`.
 *
 * The login response is a bare `TokenPair` — no user, no role, no gym — so this
 * is the app's only source for `gymId`, and `gymId` is segment [1] of every
 * gym-scoped query key.
 */
export function getSessionClaims(): SessionClaims | null {
  return claims;
}

/** The gym this session is scoped to, or `null`. The query-key prefix. */
export function getGymId(): string | null {
  return claims?.gymId ?? null;
}

/**
 * Load the persisted session into memory once at startup, so a relaunch resumes
 * a signed-in session without a login prompt. Returns the hydrated session.
 */
export async function hydrateSession(): Promise<TokenPair | null> {
  const store = getSecureStorage();
  const [accessToken, refreshToken] = await Promise.all([
    store.getItem(ACCESS_TOKEN_KEY),
    store.getItem(REFRESH_TOKEN_KEY),
  ]);
  // Half a pair is not a session: a torn write would otherwise leave the app
  // sending a stale access token it can never refresh.
  setSnapshot(accessToken && refreshToken ? { accessToken, refreshToken } : null);
  return snapshot;
}

/**
 * Persist a token pair and publish it. Every session-issuing path funnels here:
 * login, signup, verify, password reset, social sign-in, and the silent refresh
 * — so a rotated pair is stored exactly where the next launch reads it.
 */
export async function saveTokens(tokens: TokenPair): Promise<void> {
  const store = getSecureStorage();
  await Promise.all([
    store.setItem(ACCESS_TOKEN_KEY, tokens.accessToken),
    store.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
  setSnapshot({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
}

/**
 * End the session: wipe the keychain, drop the in-memory snapshot, and **clear
 * the query cache**.
 *
 * The cache clear is the whole point of this function existing. Every gym-scoped
 * key is `[resource, gymId, …]`, and switching gym means re-login (D4) — so a
 * cache entry that outlives its session is, by construction, one member's data
 * sitting in front of the next member. There is no safe "just clear the tokens"
 * variant, which is why `clearTokens` is not exported.
 *
 * Idempotent and best-effort: a keychain failure must not stop the cache clear,
 * because leaving stale data on screen is the worse of the two outcomes.
 */
export async function endSession(): Promise<void> {
  try {
    await clearTokens();
  } finally {
    setSnapshot(null);
    queryClient.clear();
  }
}

/** Wipe the persisted pair. Private — see {@link endSession}. */
async function clearTokens(): Promise<void> {
  const store = getSecureStorage();
  await Promise.all([store.deleteItem(ACCESS_TOKEN_KEY), store.deleteItem(REFRESH_TOKEN_KEY)]);
}
