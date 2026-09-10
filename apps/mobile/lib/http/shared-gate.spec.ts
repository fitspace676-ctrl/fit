// The one invariant that spans `api-client` and `session`: they must refresh
// through the SAME gate.
//
// Each module has its own reason to refresh — the client reacts to a 401 (token
// already expired), `session` fires ~60s before `exp` (token still valid) — so
// for almost every second of a session the two triggers cannot overlap. The
// exception is resume-from-background: the token can expire while the app
// sleeps, so the proactive refresh and a focus-triggered refetch's 401 can start
// in the same tick. With two gates each would spend the refresh token, and the
// server reads a second spend as reuse and revokes the whole family — the user
// is signed out with no error and no reproduction.
//
// This file exists because that bug is invisible to both modules' own suites:
// each passes perfectly while holding a private gate. Only a test that crosses
// the boundary can see it, which is exactly why it was worth writing down.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, resetApiClientForTests } from './api-client';
import { configureSession, ensureFreshSession, resetSessionForTests } from '../auth/session';
import {
  saveTokens,
  setSecureStorage,
  type SecureStorageAdapter,
  type TokenPair,
} from '../auth/token-store';

const NOW = 1_700_000_000_000;
/** Inside the 60s proactive window AND already past — the resume-from-sleep case. */
const STALE_EXP = Math.floor(NOW / 1000) - 5;

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function pair(exp: number, suffix: string): TokenPair {
  return {
    accessToken: `h.${base64url(
      JSON.stringify({ sub: 'user_1', gymId: 'gym_a', role: 'MEMBER', exp, iat: exp - 900 }),
    )}.s`,
    refreshToken: `refresh_${suffix}`,
  };
}

function fakeStorage(): SecureStorageAdapter {
  const map = new Map<string, string>();
  return {
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
}

describe('the refresh gate is shared across api-client and session', () => {
  let refreshCalls = 0;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    refreshCalls = 0;
    resetApiClientForTests();
    resetSessionForTests();
    setSecureStorage(fakeStorage());
    await saveTokens(pair(STALE_EXP, 'old'));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        // `RequestInfo` includes `Request`, which stringifies to `[object
        // Object]` — read its `url` rather than coercing the union.
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('/auth/refresh')) {
          refreshCalls += 1;
          // Deliberately slow, so a second caller starting in the same tick
          // would have to be collapsed rather than merely losing a race.
          await new Promise((resolve) => setTimeout(resolve, 20));
          return new Response(JSON.stringify(pair(Math.floor(NOW / 1000) + 900, 'new')), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        // Every protected call 401s once, forcing the client down its refresh path.
        return new Response(JSON.stringify({ code: 'ACCESS_TOKEN_INVALID', message: 'expired' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetApiClientForTests();
    resetSessionForTests();
  });

  it('collapses a proactive refresh and a 401 refresh into ONE /auth/refresh', async () => {
    configureSession({});

    // Both start in the same tick — the resume-from-background collision.
    const proactive = ensureFreshSession();
    const onUnauthorized = apiFetch('/me/profile').catch(() => undefined);

    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([proactive, onUnauthorized]);

    expect(refreshCalls).toBe(1);
  });

  it('still refreshes exactly once when the proactive path runs alone', async () => {
    configureSession({});

    // Start it, THEN advance — awaiting first would deadlock, because the
    // scripted transport's delay is itself a fake timer.
    const proactive = ensureFreshSession();
    await vi.advanceTimersByTimeAsync(100);
    await proactive;

    expect(refreshCalls).toBe(1);
  });
});
