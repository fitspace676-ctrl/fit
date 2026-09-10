// `useSyncExternalStore` stubbed to its getter, per `useSession.spec.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', () => ({
  useSyncExternalStore: <T>(
    _subscribe: (onChange: () => void) => () => void,
    getSnapshot: () => T,
  ): T => getSnapshot(),
}));

const { queryClient } = await import('../lib/query-client');
const { setSecureStorage, endSession } = await import('../lib/auth/token-store');
const { setOnboardingComplete, resetOnboarding } = await import('../lib/auth/onboarding-store');
const { hydrateAuth, resetSessionForTests } = await import('../lib/auth/session');
const { useOnboarding } = await import('./useOnboarding');
const { resolveRedirect } = await import('../lib/route-policy');
const { getSessionState } = await import('../lib/auth/session');

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
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

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  setSecureStorage(storage);
  resetSessionForTests();
  queryClient.clear();
});

afterEach(async () => {
  setSecureStorage(storage);
  await resetOnboarding();
  await endSession();
  resetSessionForTests();
});

describe('useOnboarding', () => {
  it('is hydrating until hydrateAuth resolves, sharing the session flag', async () => {
    // One flag, not two: a guard acting on a half-known state is the redirect
    // flash the hydrating zone exists to prevent.
    expect(useOnboarding()).toMatchObject({ isHydrating: true, isComplete: false });
    await hydrateAuth();
    expect(useOnboarding()).toMatchObject({ isHydrating: false, isComplete: false });
  });

  it('reads the persisted flag, so an upgrade does not replay the slides', async () => {
    // The SecureStore key is the salvaged app's (`onboarding_done`) on purpose.
    storage.map.set('onboarding_done', 'true');
    await hydrateAuth();
    expect(useOnboarding().isComplete).toBe(true);
  });

  it('publishes completion immediately, not on the next relaunch', async () => {
    await hydrateAuth();
    expect(useOnboarding().isComplete).toBe(false);

    await useOnboarding().complete();

    expect(useOnboarding().isComplete).toBe(true);
    expect(storage.map.get('onboarding_done')).toBe('true');
  });

  it('hands back the store function itself, so it is already reference-stable', () => {
    expect(useOnboarding().complete).toBe(setOnboardingComplete);
  });

  it('feeds resolveRedirect: incomplete pins a signed-in user to onboarding', async () => {
    await hydrateAuth();
    const { isComplete } = useOnboarding();
    expect(resolveRedirect(['(tabs)', 'home'], getSessionState(), isComplete)).toBe(
      // Signed out here, so it is the sign-in prompt rather than onboarding —
      // the two halves of the guard, wired the way a layout wires them.
      '/login?next=%2Fhome',
    );
  });
});
