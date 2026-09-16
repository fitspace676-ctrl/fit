// The hook is one `useSyncExternalStore` call, so the only things worth testing
// are the two contracts that hook has with React — the snapshot getter must be
// referentially stable, and the subscription must actually fire — plus the fact
// that the hook reads *this* store and no other.
//
// `useSyncExternalStore` is stubbed to `getSnapshot()`, which is exactly what
// React does on a render. That keeps the test in the fast Vitest suite: pulling
// in a renderer would mean `react-test-renderer` (not a dependency) or
// `jest-expo` (the other side of the §5 boundary), for no extra coverage of a
// three-line hook.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useSyncExternalStore: <T>(
    _subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => T,
  ): T => getSnapshot(),
}));

const { queryClient } = await import('../lib/query-client');
const { setSecureStorage, saveTokens, endSession } = await import('../lib/auth/token-store');
const { hydrateAuth, resetSessionForTests, subscribeSessionState, getSessionState } =
  await import('../lib/auth/session');
const { useSession, useIsSignedIn } = await import('./useSession');

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => Promise.resolve(map.get(key) ?? null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key: string) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

const ACCESS_TOKEN = `h.${base64url(
  JSON.stringify({ sub: 'user_1', gymId: 'gym_a', role: 'MEMBER', exp: 4_000_000_000 }),
)}.s`;

beforeEach(() => {
  setSecureStorage(fakeStorage());
  resetSessionForTests();
  queryClient.clear();
});

afterEach(async () => {
  await endSession();
  resetSessionForTests();
});

describe('useSession', () => {
  it('reports hydrating before hydrateAuth, then the real session', async () => {
    expect(useSession().status).toBe('hydrating');
    expect(useIsSignedIn()).toBe(false);

    await hydrateAuth();
    expect(useSession().status).toBe('signed-out');

    await saveTokens({ accessToken: ACCESS_TOKEN, refreshToken: 'r1' });
    expect(useSession()).toMatchObject({
      status: 'signed-in',
      userId: 'user_1',
      gymId: 'gym_a',
      role: 'MEMBER',
    });
    expect(useIsSignedIn()).toBe(true);
  });

  it('returns the same object on repeated reads — React requires a cached snapshot', async () => {
    await hydrateAuth();
    expect(useSession()).toBe(useSession());
    await saveTokens({ accessToken: ACCESS_TOKEN, refreshToken: 'r1' });
    expect(useSession()).toBe(useSession());
  });

  it('notifies subscribers on hydration, sign-in and sign-out', async () => {
    const notify = vi.fn();
    const unsubscribe = subscribeSessionState(notify);

    await hydrateAuth();
    const afterHydrate = notify.mock.calls.length;
    expect(afterHydrate).toBeGreaterThan(0);

    await saveTokens({ accessToken: ACCESS_TOKEN, refreshToken: 'r1' });
    expect(notify.mock.calls.length).toBeGreaterThan(afterHydrate);
    const afterSignIn = notify.mock.calls.length;

    await endSession();
    expect(notify.mock.calls.length).toBeGreaterThan(afterSignIn);

    // …and stops once unsubscribed, or the hook leaks a listener per mount.
    unsubscribe();
    const settled = notify.mock.calls.length;
    await saveTokens({ accessToken: ACCESS_TOKEN, refreshToken: 'r2' });
    expect(notify.mock.calls.length).toBe(settled);
  });

  it('reads the store, not a copy of it', async () => {
    await hydrateAuth();
    expect(useSession()).toBe(getSessionState());
  });
});
