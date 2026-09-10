import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALE_STORAGE_KEY,
  clearStoredLocale,
  detectDeviceLocale,
  getLocaleStorage,
  hydratedLocale,
  loadStoredLocale,
  matchLocale,
  persistLocale,
  resolveLocale,
  setDeviceLocaleProvider,
  setLocaleStorage,
  type LocaleStorageAdapter,
} from './locale';

/** An in-memory stand-in for AsyncStorage, matching the token-store spec's shape. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const adapter: LocaleStorageAdapter & { map: Map<string, string> } = {
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

afterEach(() => {
  setLocaleStorage(null);
  setDeviceLocaleProvider(null);
});

describe('matchLocale', () => {
  it('matches on the primary subtag, not the full tag', () => {
    expect(matchLocale(['ka-GE'])).toBe('ka');
    expect(matchLocale(['en-US'])).toBe('en');
    expect(matchLocale(['ka_GE'])).toBe('ka');
    expect(matchLocale(['KA'])).toBe('ka');
  });

  it('takes the first supported tag, in the device order', () => {
    expect(matchLocale(['ru-RU', 'en-GB', 'ka-GE'])).toBe('en');
  });

  it('returns null when nothing is supported', () => {
    expect(matchLocale(['ru-RU', 'de'])).toBeNull();
    expect(matchLocale([])).toBeNull();
  });
});

describe('detectDeviceLocale', () => {
  it('returns null with no provider installed', () => {
    expect(detectDeviceLocale()).toBeNull();
  });

  it('reads the installed provider', () => {
    setDeviceLocaleProvider(() => ['en-US']);
    expect(detectDeviceLocale()).toBe('en');
  });

  it('survives a provider that throws — a launch must not die reading a setting', () => {
    setDeviceLocaleProvider(() => {
      throw new Error('native module missing');
    });
    expect(detectDeviceLocale()).toBeNull();
  });
});

describe('the persisted choice', () => {
  it('is null with no storage installed, and persisting is a no-op', async () => {
    expect(getLocaleStorage()).toBeNull();
    await expect(loadStoredLocale()).resolves.toBeNull();
    await expect(persistLocale('en')).resolves.toBeUndefined();
  });

  it('round-trips through storage under a stable key', async () => {
    const storage = fakeStorage();
    setLocaleStorage(storage);
    await persistLocale('en');
    expect(storage.map.get(LOCALE_STORAGE_KEY)).toBe('en');
    await expect(loadStoredLocale()).resolves.toBe('en');
  });

  it('ignores a stored value that is not a supported locale', async () => {
    setLocaleStorage(fakeStorage({ [LOCALE_STORAGE_KEY]: 'fr' }));
    await expect(loadStoredLocale()).resolves.toBeNull();
  });

  it('refuses to persist an unsupported locale', async () => {
    const storage = fakeStorage();
    setLocaleStorage(storage);
    await persistLocale('fr' as never);
    expect(storage.map.has(LOCALE_STORAGE_KEY)).toBe(false);
  });

  it('degrades to null when the read throws', async () => {
    setLocaleStorage({
      getItem: () => Promise.reject(new Error('locked')),
      setItem: () => Promise.resolve(),
      deleteItem: () => Promise.resolve(),
    });
    await expect(loadStoredLocale()).resolves.toBeNull();
  });

  it('swallows a write failure — the switcher must not throw at the user', async () => {
    setLocaleStorage({
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.reject(new Error('disk full')),
      deleteItem: () => Promise.resolve(),
    });
    await expect(persistLocale('en')).resolves.toBeUndefined();
  });

  it('clears the choice', async () => {
    const storage = fakeStorage({ [LOCALE_STORAGE_KEY]: 'en' });
    setLocaleStorage(storage);
    await clearStoredLocale();
    expect(storage.map.has(LOCALE_STORAGE_KEY)).toBe(false);
  });
});

describe('resolveLocale — persisted → device → default', () => {
  it('prefers the persisted choice over the device language', () => {
    expect(resolveLocale('en', 'ka')).toBe('en');
    expect(resolveLocale('ka', 'en')).toBe('ka');
  });

  it('uses the device language when nothing is persisted', () => {
    expect(resolveLocale(null, 'en')).toBe('en');
  });

  it('falls back to the platform default when neither is known', () => {
    expect(resolveLocale(null, null)).toBe('ka');
  });

  it('takes an explicit fallback', () => {
    expect(resolveLocale(null, null, 'en')).toBe('en');
  });
});

describe('hydratedLocale — the guard against clobbering a live choice', () => {
  it('applies the persisted choice over the first-paint locale', () => {
    expect(hydratedLocale({ stored: 'en', device: null, current: 'ka', userChose: false })).toBe(
      'en',
    );
  });

  it('applies the device language when nothing is persisted', () => {
    expect(hydratedLocale({ stored: null, device: 'en', current: 'ka', userChose: false })).toBe(
      'en',
    );
  });

  it('returns null — no re-render — when the answer is already on screen', () => {
    expect(
      hydratedLocale({ stored: 'ka', device: 'ka', current: 'ka', userChose: false }),
    ).toBeNull();
    expect(
      hydratedLocale({ stored: null, device: null, current: 'en', userChose: false }),
    ).toBeNull();
  });

  it('refuses to overwrite a choice the user made while the read was in flight', () => {
    // The race: launch paints `ka`, the user taps English, and only *then* does
    // the storage read resolve with the previously-persisted `ka`.
    expect(
      hydratedLocale({ stored: 'ka', device: 'ka', current: 'en', userChose: true }),
    ).toBeNull();
  });

  it('refuses even when the device language disagrees with the tap', () => {
    expect(
      hydratedLocale({ stored: null, device: 'ka', current: 'en', userChose: true }),
    ).toBeNull();
  });

  it('models the whole cold-start sequence in order', async () => {
    const storage = fakeStorage({ [LOCALE_STORAGE_KEY]: 'en' });
    setLocaleStorage(storage);
    setDeviceLocaleProvider(() => ['ka-GE']);

    // First paint: the platform default, no await.
    let current: 'ka' | 'en' = 'ka';

    // Hydration resolves; the persisted `en` outranks the device's `ka`.
    const stored = await loadStoredLocale();
    current =
      hydratedLocale({
        stored,
        device: detectDeviceLocale(),
        current,
        userChose: false,
      }) ?? current;
    expect(current).toBe('en');

    // The user switches back; the choice is persisted for the next launch.
    current = 'ka';
    await persistLocale(current);
    expect(storage.map.get(LOCALE_STORAGE_KEY)).toBe('ka');
  });

  it('is not fooled by a slow read resolving after a tap', async () => {
    let release: (value: string | null) => void = () => undefined;
    setLocaleStorage({
      getItem: () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
      setItem: () => Promise.resolve(),
      deleteItem: () => Promise.resolve(),
    });

    let current: 'ka' | 'en' = 'ka';
    let userChose = false;

    const inFlight = loadStoredLocale();

    // The tap lands first.
    current = 'en';
    userChose = true;

    // Now the read comes back with the old value.
    release('ka');
    const stored = await inFlight;
    const next = hydratedLocale({ stored, device: null, current, userChose });

    expect(next).toBeNull();
    expect(current).toBe('en');
  });
});

describe('the native installers stay out of the fast suite', () => {
  it('does not import react-native or AsyncStorage at module load', async () => {
    // If either import were static, this spec file would not have parsed at all
    // (RN ships Flow-typed source Vitest cannot read). Asserting the exports are
    // merely *present* documents the contract the vitest config depends on.
    const locale = await import('./locale');
    expect(typeof locale.installAsyncStorageLocale).toBe('function');
    expect(typeof locale.installReactNativeDeviceLocale).toBe('function');
    expect(vi.isMockFunction(locale.installAsyncStorageLocale)).toBe(false);
  });
});
