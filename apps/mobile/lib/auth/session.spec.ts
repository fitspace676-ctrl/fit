import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginInput } from '@fit/types';
import type { AuthApi } from '../api/auth';
import { env } from '../env';
import { ApiError } from '../http/api-error';
import { resetApiClientForTests } from '../http/api-client';
import { queryClient } from '../query-client';
import { resetDeviceIdCache } from './device-id';
import { resetOnboarding } from './onboarding-store';
import {
  endSession,
  getSessionSnapshot,
  saveTokens,
  setSecureStorage,
  type SecureStorageAdapter,
  type TokenPair,
} from './token-store';
import {
  SIGN_OUT_TIMEOUT_MS,
  configureSession,
  ensureFreshSession,
  getActiveGymSnapshot,
  getLastGymSlug,
  getSessionState,
  hydrateAuth,
  msUntilProactiveRefresh,
  registerAccount,
  requestPasswordReset,
  resetSessionForTests,
  resolveGymSlug,
  signIn,
  signInWithApple,
  signInWithGoogle,
  signOut,
  subscribeSessionState,
  type SessionReporter,
} from './session';

// ── Fixtures ────────────────────────────────────────────────────────────────

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

/** A JWT whose payload is exactly the claims we want to test against. */
function tokenFor(claims: Record<string, unknown>): string {
  return `h.${base64url(JSON.stringify(claims))}.s`;
}

const NOW = 1_700_000_000_000;
/** Expires an hour out — comfortably outside the 60s proactive window. */
const FRESH_EXP = Math.floor(NOW / 1000) + 3600;
/** Expires in 30s — inside the 60s window, so "expired" for refresh purposes. */
const NEAR_EXP = Math.floor(NOW / 1000) + 30;

function pair(exp: number, gymId: string | null = 'gym_a', suffix = '1'): TokenPair {
  return {
    accessToken: tokenFor({
      sub: 'user_1',
      ...(gymId === null ? {} : { gymId }),
      role: 'MEMBER',
      exp,
      iat: Math.floor(NOW / 1000),
    }),
    refreshToken: `refresh_${suffix}`,
  };
}

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const adapter: SecureStorageAdapter & { map: Map<string, string> } = {
    map,
    getItem: (key) => Promise.resolve(map.get(key) ?? null),
    setItem: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
  return adapter;
}

/** A recording stub for every `AuthApi` method. */
function fakeAuthApi(overrides: Partial<AuthApi> = {}): AuthApi & { log: string[] } {
  const log: string[] = [];
  const reject = (name: string) => () => {
    log.push(name);
    return Promise.reject(new ApiError({ status: 500, message: `${name} not scripted` }));
  };
  return {
    log,
    login: reject('login'),
    register: reject('register'),
    signup: reject('signup'),
    verifyEmail: reject('verifyEmail'),
    forgotPassword: reject('forgotPassword'),
    resetPassword: reject('resetPassword'),
    google: reject('google'),
    apple: reject('apple'),
    logout: reject('logout'),
    gymIdBySlug: () => Promise.resolve(null),
    ...overrides,
  };
}

function fakeReporter(): SessionReporter & {
  messages: { message: string; context: Record<string, unknown> }[];
  exceptions: unknown[];
} {
  const messages: { message: string; context: Record<string, unknown> }[] = [];
  const exceptions: unknown[] = [];
  return {
    messages,
    exceptions,
    captureMessage: (message, context) => {
      messages.push({ message, context });
    },
    captureException: (error) => {
      exceptions.push(error);
    },
  };
}

let storage: ReturnType<typeof fakeStorage>;
let reporter: ReturnType<typeof fakeReporter>;
const realFetch = globalThis.fetch;
const envGymSlug = env.gymSlug;
const envApiUrl = env.apiUrl;
const API_URL = 'https://api.example.test';

/** `env` is frozen only by TypeScript; the app reads it, so the spec pins it. */
type MutableEnv = { gymSlug: string | undefined; apiUrl: string };

beforeEach(() => {
  storage = fakeStorage();
  setSecureStorage(storage);
  reporter = fakeReporter();
  // `api-client` builds its URLs from `env.apiUrl`, not from this module's deps,
  // so the push-unregister call in signOut is only assertable once it is pinned.
  (env as MutableEnv).apiUrl = API_URL;
  resetSessionForTests();
  resetDeviceIdCache();
  resetApiClientForTests();
  queryClient.clear();
  configureSession({ reporter, now: () => NOW, apiUrl: API_URL });
});

afterEach(async () => {
  setSecureStorage(storage);
  await endSession();
  await resetOnboarding();
  resetSessionForTests();
  resetDeviceIdCache();
  resetApiClientForTests();
  globalThis.fetch = realFetch;
  (env as MutableEnv).gymSlug = envGymSlug;
  (env as MutableEnv).apiUrl = envApiUrl;
});

// ── Hydration + the observable snapshot ─────────────────────────────────────

describe('hydrateAuth', () => {
  it('reports hydrating until the keychain read lands, then signed-out', async () => {
    // Telling "hydrating" from "signed out" is the whole reason the route guard
    // can return null on a cold launch instead of flashing /login.
    expect(getSessionState().status).toBe('hydrating');
    await hydrateAuth();
    expect(getSessionState().status).toBe('signed-out');
  });

  it('resumes a persisted session, decoding its claims', async () => {
    const session = pair(FRESH_EXP);
    storage.map.set('access_token', session.accessToken);
    storage.map.set('refresh_token', session.refreshToken);

    const state = await hydrateAuth();
    expect(state).toMatchObject({
      status: 'signed-in',
      userId: 'user_1',
      gymId: 'gym_a',
      role: 'MEMBER',
      expiresAt: FRESH_EXP * 1000,
    });
  });

  it('still finishes hydrating when the keychain throws', async () => {
    setSecureStorage({
      getItem: () => Promise.reject(new Error('keychain unavailable')),
      setItem: () => Promise.resolve(),
      deleteItem: () => Promise.resolve(),
    });

    await expect(hydrateAuth()).resolves.toMatchObject({ status: 'signed-out' });
    expect(reporter.exceptions).toHaveLength(1);
    setSecureStorage(storage);
  });

  it('publishes hydration to subscribers', async () => {
    const notify = vi.fn();
    const unsubscribe = subscribeSessionState(notify);
    await hydrateAuth();
    expect(notify).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('getSessionState / getActiveGymSnapshot', () => {
  it('returns a stable reference until the session actually changes', async () => {
    // useSyncExternalStore re-renders on every new reference and React throws
    // outright if the snapshot is not cached.
    await hydrateAuth();
    expect(getSessionState()).toBe(getSessionState());
    expect(getActiveGymSnapshot()).toBe(getActiveGymSnapshot());

    await saveTokens(pair(FRESH_EXP));
    const signedIn = getSessionState();
    expect(signedIn.status).toBe('signed-in');
    expect(getSessionState()).toBe(signedIn);
    expect(getActiveGymSnapshot()).toEqual({ gymId: 'gym_a', role: 'MEMBER', userId: 'user_1' });
  });

  it('reports a signed-in session with no membership as gymId null, not signed out', async () => {
    // resolveSessionScope returns `{ gymId: null }` for a user with no active
    // membership, and decodeSessionClaims refuses such a token — but the user is
    // signed in and must be able to browse and join.
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP, null));
    expect(getSessionState()).toMatchObject({ status: 'signed-in', gymId: null, userId: null });
    expect(getActiveGymSnapshot()).toBeNull();
  });
});

// ── gymSlug resolution (D4) ─────────────────────────────────────────────────

describe('resolveGymSlug', () => {
  it('prefers the deep link, then the build config, then the last successful login', async () => {
    await hydrateAuth();
    (env as MutableEnv).gymSlug = undefined;
    expect(resolveGymSlug()).toBeUndefined();

    // 3. remembered slug — learned from a previous verified login.
    storage.map.set('last_gym_slug', 'remembered');
    resetSessionForTests();
    configureSession({ reporter, now: () => NOW });
    await hydrateAuth();
    expect(resolveGymSlug()).toBe('remembered');

    // 2. build config outranks it.
    (env as MutableEnv).gymSlug = 'from-build';
    expect(resolveGymSlug()).toBe('from-build');

    // 1. the deep link outranks everything — the user followed *this* gym's link.
    expect(resolveGymSlug({ deepLinkSlug: 'from-link' })).toBe('from-link');
  });

  it('normalises like loginSchema does — trimmed and lower-cased', async () => {
    await hydrateAuth();
    expect(resolveGymSlug({ deepLinkSlug: '  DownTown \n' })).toBe('downtown');
    // A blank deep-link value falls through rather than sending an empty slug.
    (env as MutableEnv).gymSlug = 'fallback';
    expect(resolveGymSlug({ deepLinkSlug: '   ' })).toBe('fallback');
  });
});

// ── Sign-in ─────────────────────────────────────────────────────────────────

describe('signIn', () => {
  it('forwards gymSlug to POST /auth/login', async () => {
    const login = vi.fn(() => Promise.resolve(pair(FRESH_EXP)));
    configureSession({
      authApi: fakeAuthApi({ login, gymIdBySlug: () => Promise.resolve('gym_a') }),
    });
    await hydrateAuth();

    const result = await signIn({ email: 'a@b.test', password: 'pw', gymSlug: 'downtown' });
    await result.gymScope;

    expect(login).toHaveBeenCalledWith(
      { email: 'a@b.test', password: 'pw', gymSlug: 'downtown' },
      undefined,
    );
    expect(getSessionState().status).toBe('signed-in');
  });

  it('omits gymSlug entirely rather than sending undefined', async () => {
    const login = vi.fn((_input: LoginInput) => Promise.resolve(pair(FRESH_EXP)));
    configureSession({ authApi: fakeAuthApi({ login }) });
    await hydrateAuth();

    await signIn({ email: 'a@b.test', password: 'pw', gymSlug: undefined });
    expect(login.mock.calls[0]?.[0]).toEqual({ email: 'a@b.test', password: 'pw' });
  });

  it('persists the pair before returning, so the client can use it immediately', async () => {
    configureSession({ authApi: fakeAuthApi({ login: () => Promise.resolve(pair(FRESH_EXP)) }) });
    await hydrateAuth();

    await signIn({ email: 'a@b.test', password: 'pw', gymSlug: undefined });
    expect(storage.map.get('refresh_token')).toBe('refresh_1');
    expect(getSessionSnapshot()?.accessToken).toBe(pair(FRESH_EXP).accessToken);
  });

  it('lets an ApiError from the API reach the caller with retryAfterSec intact', async () => {
    const rateLimited = new ApiError({ status: 429, code: 'RATE_LIMITED', retryAfterSec: 840 });
    configureSession({ authApi: fakeAuthApi({ login: () => Promise.reject(rateLimited) }) });
    await hydrateAuth();

    await expect(
      signIn({ email: 'a@b.test', password: 'pw', gymSlug: undefined }),
    ).rejects.toMatchObject({ status: 429, retryAfterSec: 840 });
    expect(getSessionState().status).toBe('signed-out');
  });
});

describe('the gym-scope mismatch only the client can see', () => {
  it('detects "asked for X, got Y", reports it, and does NOT block the login', async () => {
    // resolveSessionScope ignores an unknown / non-member slug and falls back to
    // the earliest-joined membership, returning 200 either way. Nothing in the
    // response says which gym was asked for, so this check is the only place the
    // discrepancy exists at all.
    configureSession({
      authApi: fakeAuthApi({
        login: () => Promise.resolve(pair(FRESH_EXP, 'gym_b')),
        gymIdBySlug: () => Promise.resolve('gym_a'),
      }),
    });
    await hydrateAuth();

    const result = await signIn({ email: 'a@b.test', password: 'pw', gymSlug: 'downtown' });

    // Not blocked: the session is live before the check even resolves.
    expect(getSessionState()).toMatchObject({ status: 'signed-in', gymId: 'gym_b' });

    await expect(result.gymScope).resolves.toEqual({
      kind: 'mismatch',
      slug: 'downtown',
      requestedGymId: 'gym_a',
      issuedGymId: 'gym_b',
    });
    expect(reporter.messages).toHaveLength(1);
    expect(reporter.messages[0]?.context).toMatchObject({
      slug: 'downtown',
      requestedGymId: 'gym_a',
      issuedGymId: 'gym_b',
    });
    // A slug we did not actually land on must not become the remembered default.
    expect(getLastGymSlug()).toBeUndefined();
    expect(storage.map.has('last_gym_slug')).toBe(false);
  });

  it('remembers the slug when the session landed where it was asked to', async () => {
    configureSession({
      authApi: fakeAuthApi({
        login: () => Promise.resolve(pair(FRESH_EXP, 'gym_a')),
        gymIdBySlug: () => Promise.resolve('gym_a'),
      }),
    });
    await hydrateAuth();

    const result = await signIn({ email: 'a@b.test', password: 'pw', gymSlug: 'downtown' });
    await expect(result.gymScope).resolves.toEqual({
      kind: 'match',
      slug: 'downtown',
      gymId: 'gym_a',
    });
    expect(reporter.messages).toHaveLength(0);
    expect(getLastGymSlug()).toBe('downtown');
    expect(storage.map.get('last_gym_slug')).toBe('downtown');
  });

  it('reports a slug that resolves to no gym at all', async () => {
    configureSession({
      authApi: fakeAuthApi({
        login: () => Promise.resolve(pair(FRESH_EXP, 'gym_a')),
        gymIdBySlug: () => Promise.resolve(null),
      }),
    });
    await hydrateAuth();

    const result = await signIn({ email: 'a@b.test', password: 'pw', gymSlug: 'typo' });
    await expect(result.gymScope).resolves.toEqual({
      kind: 'unverified',
      slug: 'typo',
      reason: 'SLUG_NOT_FOUND',
    });
    expect(reporter.messages).toHaveLength(1);
  });

  it('never rejects, and never blocks, when the lookup itself fails', async () => {
    configureSession({
      authApi: fakeAuthApi({
        login: () => Promise.resolve(pair(FRESH_EXP, 'gym_a')),
        gymIdBySlug: () => Promise.reject(new Error('offline')),
      }),
    });
    await hydrateAuth();

    const result = await signIn({ email: 'a@b.test', password: 'pw', gymSlug: 'downtown' });
    expect(getSessionState().status).toBe('signed-in');
    await expect(result.gymScope).resolves.toMatchObject({ kind: 'unverified', slug: 'downtown' });
  });
});

describe('social sign-in', () => {
  it('signs in with a Google ID token and asks for no gym', async () => {
    const google = vi.fn(() => Promise.resolve(pair(FRESH_EXP)));
    const gymIdBySlug = vi.fn(() => Promise.resolve('gym_a'));
    configureSession({ authApi: fakeAuthApi({ google, gymIdBySlug }) });
    await hydrateAuth();

    const result = await signInWithGoogle({ idToken: 'google-id-token' });
    expect(google).toHaveBeenCalledWith({ idToken: 'google-id-token' }, undefined);
    expect(getSessionState().status).toBe('signed-in');
    // No slug was requested, so there is nothing to compare and no lookup to make.
    await expect(result.gymScope).resolves.toEqual({
      kind: 'unverified',
      slug: undefined,
      reason: 'NO_SLUG_REQUESTED',
    });
    expect(gymIdBySlug).not.toHaveBeenCalled();
  });

  it('forwards Apple’s one-time display name verbatim', async () => {
    // Apple hands the name over exactly once, on the first authorization. Drop
    // it and the account is nameless until the user revokes the app in Settings.
    const apple = vi.fn(() => Promise.resolve(pair(FRESH_EXP)));
    configureSession({ authApi: fakeAuthApi({ apple }) });
    await hydrateAuth();

    await signInWithApple({ idToken: 'apple-id-token', name: 'ნინო' });
    expect(apple).toHaveBeenCalledWith({ idToken: 'apple-id-token', name: 'ნინო' }, undefined);
  });
});

describe('the passwordless entry points', () => {
  it('registration and forgot-password pass straight through, session untouched', async () => {
    const register = vi.fn(() => Promise.resolve({ message: 'check your email' }));
    const forgotPassword = vi.fn(() => Promise.resolve({ message: 'if an account exists' }));
    configureSession({ authApi: fakeAuthApi({ register, forgotPassword }) });
    await hydrateAuth();

    await expect(
      registerAccount({ email: 'a@b.test', password: 'pw12345678', name: 'A' }),
    ).resolves.toEqual({ message: 'check your email' });
    await expect(requestPasswordReset('a@b.test')).resolves.toEqual({
      message: 'if an account exists',
    });
    expect(getSessionState().status).toBe('signed-out');
  });
});

// ── Proactive refresh ───────────────────────────────────────────────────────

describe('ensureFreshSession', () => {
  function refreshHarness(respond: () => Response | Promise<Response>) {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => respond());
    configureSession({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiUrl: 'https://api.example.test',
      timeoutMs: 50,
      now: () => NOW,
      authApi: fakeAuthApi(),
      reporter,
    });
    return fetchImpl;
  }

  it('makes NO request while the token has more than 60s left', async () => {
    // The point of the whole mechanism: cheap enough to call on every foreground
    // and before every fan-out, because the usual answer costs nothing.
    const fetchImpl = refreshHarness(() => new Response(null, { status: 200 }));
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));

    await expect(ensureFreshSession()).resolves.toEqual({ kind: 'fresh' });
    await expect(ensureFreshSession()).resolves.toEqual({ kind: 'fresh' });
    await expect(ensureFreshSession()).resolves.toEqual({ kind: 'fresh' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refreshes BEFORE expiry — 30s of life left is already inside the window', async () => {
    const rotated = pair(FRESH_EXP, 'gym_a', '2');
    const fetchImpl = refreshHarness(
      () =>
        new Response(JSON.stringify(rotated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await hydrateAuth();
    await saveTokens(pair(NEAR_EXP));

    await expect(ensureFreshSession()).resolves.toEqual({ kind: 'refreshed' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.example.test/auth/refresh');
    expect(getSessionSnapshot()?.refreshToken).toBe('refresh_2');

    // …and having refreshed, the next call is free again.
    await expect(ensureFreshSession()).resolves.toEqual({ kind: 'fresh' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst of callers into one refresh', async () => {
    const rotated = pair(FRESH_EXP, 'gym_a', '2');
    const fetchImpl = refreshHarness(
      () =>
        new Response(JSON.stringify(rotated), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await hydrateAuth();
    await saveTokens(pair(NEAR_EXP));

    // A second concurrent spend of a rotating refresh token is treated as reuse
    // and revokes the whole family — see refresh-gate.ts.
    await Promise.all([ensureFreshSession(), ensureFreshSession(), ensureFreshSession()]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does nothing when signed out', async () => {
    const fetchImpl = refreshHarness(() => new Response(null, { status: 200 }));
    await hydrateAuth();
    await expect(ensureFreshSession()).resolves.toEqual({ kind: 'signed-out' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ends the session on a definitive 4xx', async () => {
    const fetchImpl = refreshHarness(
      () =>
        new Response(JSON.stringify({ code: 'REFRESH_TOKEN_INVALID', message: 'dead' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await hydrateAuth();
    await saveTokens(pair(NEAR_EXP));

    const outcome = await ensureFreshSession();
    expect(outcome.kind).toBe('rejected');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getSessionState().status).toBe('signed-out');
    expect(storage.map.has('refresh_token')).toBe(false);
  });

  it('does NOT end the session on a 5xx or a dead radio', async () => {
    // Signing the user base out because a deploy was mid-rollout, or because
    // someone walked into a lift, is worse than any stale token.
    let mode: 'server' | 'transport' = 'server';
    const fetchImpl = vi.fn((): Promise<Response> => {
      if (mode === 'transport') {
        return Promise.reject(new TypeError('Network request failed'));
      }
      return Promise.resolve(
        new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }),
      );
    });
    configureSession({
      fetchImpl,
      apiUrl: 'https://api.example.test',
      timeoutMs: 50,
      now: () => NOW,
    });
    await hydrateAuth();
    await saveTokens(pair(NEAR_EXP));

    await expect(ensureFreshSession()).resolves.toMatchObject({ kind: 'unavailable' });
    expect(getSessionState().status).toBe('signed-in');

    mode = 'transport';
    await expect(ensureFreshSession()).resolves.toMatchObject({ kind: 'unavailable' });
    expect(getSessionState().status).toBe('signed-in');
  });
});

describe('msUntilProactiveRefresh', () => {
  it('lands 60s before expiry, and clamps at zero once past it', async () => {
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));
    expect(msUntilProactiveRefresh()).toBe(FRESH_EXP * 1000 - 60_000 - NOW);

    await saveTokens(pair(NEAR_EXP));
    expect(msUntilProactiveRefresh()).toBe(0);
  });

  it('is null when there is nothing to schedule', async () => {
    await hydrateAuth();
    expect(msUntilProactiveRefresh()).toBeNull();
  });
});

// ── Sign-out ────────────────────────────────────────────────────────────────

describe('signOut — the leak the old app left open', () => {
  /** Stub the global `fetch` the API client uses for the push-unregister call. */
  function stubPushFetch(order: string[], respond: () => Response | Promise<Response>) {
    const pushFetch = vi.fn(async (url: string) => {
      order.push(`push:${url}`);
      return respond();
    });
    globalThis.fetch = pushFetch as unknown as typeof fetch;
    return pushFetch;
  }

  it('unregisters push, THEN revokes the family, THEN clears', async () => {
    const order: string[] = [];
    stubPushFetch(order, () => new Response(null, { status: 204 }));
    configureSession({
      authApi: fakeAuthApi({
        logout: (input) => {
          order.push(`logout:${input.refreshToken}`);
          return Promise.resolve();
        },
      }),
    });
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));
    const deviceId = storage.map.get('device_id') as string;

    await expect(signOut()).resolves.toEqual({ pushUnregistered: true, revoked: true });

    // Order is load-bearing: the DELETE needs a live Bearer, so doing it after
    // the revoke would 401 and leave the phone receiving this member's pushes.
    expect(order).toEqual([
      `push:https://api.example.test/notifications/push-token/${deviceId}`,
      'logout:refresh_1',
    ]);
    expect(getSessionState().status).toBe('signed-out');
    expect(storage.map.has('access_token')).toBe(false);
    expect(storage.map.has('refresh_token')).toBe(false);
  });

  it('caps both calls at 5s and sends the DELETE as a DELETE', async () => {
    const seen: RequestInit[] = [];
    globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
      seen.push(init);
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as unknown as typeof fetch;
    // Recorded rather than asserted inline: an expect() inside the stub would be
    // swallowed by signOut's own best-effort catch and pass vacuously.
    const timeouts: (number | undefined)[] = [];
    configureSession({
      authApi: fakeAuthApi({
        logout: (_input, options) => {
          timeouts.push(options?.timeoutMs);
          return Promise.resolve();
        },
      }),
    });
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));

    await signOut();
    expect(seen[0]?.method).toBe('DELETE');
    expect(timeouts).toEqual([SIGN_OUT_TIMEOUT_MS]);
  });

  it('still clears the session when BOTH network calls fail', async () => {
    // A user on a plane must still be able to sign out. Best-effort means the
    // failures are swallowed, not that the calls are skipped.
    const order: string[] = [];
    stubPushFetch(order, () => {
      throw new TypeError('Network request failed');
    });
    configureSession({
      authApi: fakeAuthApi({
        logout: () => {
          order.push('logout');
          return Promise.reject(new ApiError({ status: 0, code: 'NETWORK_ERROR' }));
        },
      }),
    });
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));

    await expect(signOut()).resolves.toEqual({ pushUnregistered: false, revoked: false });
    // Both were attempted…
    expect(order).toHaveLength(2);
    expect(order[1]).toBe('logout');
    // …and the session is gone regardless.
    expect(getSessionState().status).toBe('signed-out');
    expect(reporter.exceptions).toHaveLength(2);
  });

  it('revokes even when the push unregister throws', async () => {
    const order: string[] = [];
    stubPushFetch(order, () => new Response('{}', { status: 500 }));
    configureSession({
      authApi: fakeAuthApi({
        logout: () => {
          order.push('logout');
          return Promise.resolve();
        },
      }),
    });
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));

    await expect(signOut()).resolves.toEqual({ pushUnregistered: false, revoked: true });
    expect(order[1]).toBe('logout');
  });

  it('revokes the CURRENT refresh token, not the one held before the DELETE', async () => {
    // `apiFetch` answers a 401 by refreshing, which rotates the pair. Revoking
    // the pre-rotation token would leave the live one alive — the exact leak
    // this function exists to close.
    let call = 0;
    globalThis.fetch = vi.fn((url: string) => {
      call += 1;
      if (String(url).includes('/auth/refresh')) {
        return Promise.resolve(
          new Response(JSON.stringify(pair(FRESH_EXP, 'gym_a', 'rotated')), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      // First DELETE 401s, forcing a refresh; the replay succeeds.
      return Promise.resolve(
        call === 1 ? new Response('{}', { status: 401 }) : new Response(null, { status: 204 }),
      );
    }) as unknown as typeof fetch;

    const revoked: string[] = [];
    configureSession({
      authApi: fakeAuthApi({
        logout: (input) => {
          revoked.push(input.refreshToken);
          return Promise.resolve();
        },
      }),
    });
    await hydrateAuth();
    await saveTokens(pair(FRESH_EXP));

    await signOut();
    expect(revoked).toEqual(['refresh_rotated']);
  });

  it('clears the session even with no device id and no session to revoke', async () => {
    configureSession({ authApi: fakeAuthApi() });
    await hydrateAuth();
    // Signed out already: nothing to unregister, nothing to revoke, and neither
    // call may be attempted with no credential.
    await expect(signOut()).resolves.toEqual({ pushUnregistered: false, revoked: false });
    expect(getSessionState().status).toBe('signed-out');
  });
});

// ── Boundaries ──────────────────────────────────────────────────────────────

describe('the §5 test boundary', () => {
  it('imports no react-native, and mints no second exit from a session', () => {
    const source = readFileSync(fileURLToPath(new URL('./session.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/from\s+'react-native/);
    expect(source).not.toMatch(/from\s+'expo-/);
    expect(source).not.toMatch(/from\s+'@sentry/);
  });
});
