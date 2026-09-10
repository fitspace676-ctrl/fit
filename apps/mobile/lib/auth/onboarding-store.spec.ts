import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOnboardingSnapshot,
  hydrateOnboarding,
  resetOnboarding,
  setOnboardingComplete,
  subscribeOnboarding,
} from './onboarding-store';
import { setSecureStorage, type SecureStorageAdapter } from './token-store';

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

describe('onboarding-store', () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(async () => {
    storage = fakeStorage();
    setSecureStorage(storage);
    await resetOnboarding();
  });

  afterEach(() => {
    setSecureStorage(null);
  });

  it('is false before hydration, so the splash must be held until it resolves', () => {
    expect(getOnboardingSnapshot()).toBe(false);
  });

  it('hydrates the persisted flag under the salvaged key', async () => {
    // The key is kept from the deleted app so an upgrade over an existing
    // install does not replay the slides at someone who has seen them.
    setSecureStorage(fakeStorage({ onboarding_done: 'true' }));
    await expect(hydrateOnboarding()).resolves.toBe(true);
    expect(getOnboardingSnapshot()).toBe(true);
  });

  it('treats any value other than "true" as not done', async () => {
    setSecureStorage(fakeStorage({ onboarding_done: 'yes' }));
    await expect(hydrateOnboarding()).resolves.toBe(false);
  });

  it('publishes completion synchronously so the guard moves without a relaunch', async () => {
    const notify = vi.fn();
    const unsubscribe = subscribeOnboarding(notify);

    await setOnboardingComplete();

    expect(getOnboardingSnapshot()).toBe(true);
    expect(storage.map.get('onboarding_done')).toBe('true');
    expect(notify).toHaveBeenCalledTimes(1);

    unsubscribe();
    await resetOnboarding();
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
