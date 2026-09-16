import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_PREFERENCE_STORAGE_KEY,
  bootThemePreference,
  clearStoredThemePreference,
  defaultThemePreference,
  getThemePreferenceStorage,
  hydratedThemePreference,
  isThemePreference,
  loadStoredThemePreference,
  persistThemePreference,
  resetThemePreferenceBoot,
  resolveThemePreference,
  setThemePreferenceStorage,
  type ThemePreference,
  type ThemeStorageAdapter,
} from './theme-preference';

/** An in-memory stand-in for AsyncStorage, matching the locale spec's shape. */
function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  const adapter: ThemeStorageAdapter & { map: Map<string, string> } = {
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
  setThemePreferenceStorage(null);
  resetThemePreferenceBoot();
});

describe('isThemePreference', () => {
  it('admits the two modes the app ships and nothing else', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    // `'system'` is a valid `ThemeScheme` for the kit and NOT a valid
    // preference — the switch is deliberately two-way. See the module header.
    expect(isThemePreference('system')).toBe(false);
    expect(isThemePreference('')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});

describe('loadStoredThemePreference', () => {
  it('returns null with no store installed', async () => {
    await expect(loadStoredThemePreference()).resolves.toBeNull();
  });

  it('reads the persisted mode', async () => {
    setThemePreferenceStorage(fakeStorage({ [THEME_PREFERENCE_STORAGE_KEY]: 'light' }));
    await expect(loadStoredThemePreference()).resolves.toBe('light');
  });

  it('treats a junk value as unset rather than trusting it', async () => {
    setThemePreferenceStorage(fakeStorage({ [THEME_PREFERENCE_STORAGE_KEY]: 'sepia' }));
    await expect(loadStoredThemePreference()).resolves.toBeNull();
  });

  it('survives a store that throws', async () => {
    setThemePreferenceStorage({
      getItem: () => Promise.reject(new Error('keychain locked')),
      setItem: () => Promise.resolve(),
      deleteItem: () => Promise.resolve(),
    });
    await expect(loadStoredThemePreference()).resolves.toBeNull();
  });
});

describe('persistThemePreference', () => {
  it('writes the choice under the shared key', async () => {
    const store = fakeStorage();
    setThemePreferenceStorage(store);
    await persistThemePreference('light');
    expect(store.map.get(THEME_PREFERENCE_STORAGE_KEY)).toBe('light');
  });

  it('is a no-op with no store, and never throws', async () => {
    expect(getThemePreferenceStorage()).toBeNull();
    await expect(persistThemePreference('light')).resolves.toBeUndefined();
  });

  it('swallows a write failure — the choice still applies to this session', async () => {
    setThemePreferenceStorage({
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.reject(new Error('disk full')),
      deleteItem: () => Promise.resolve(),
    });
    await expect(persistThemePreference('light')).resolves.toBeUndefined();
  });

  it('refuses to write a value that is not a mode', async () => {
    const store = fakeStorage();
    setThemePreferenceStorage(store);
    await persistThemePreference('system' as unknown as ThemePreference);
    expect(store.map.has(THEME_PREFERENCE_STORAGE_KEY)).toBe(false);
  });
});

describe('clearStoredThemePreference', () => {
  it('forgets the choice, so the next launch is dark', async () => {
    const store = fakeStorage({ [THEME_PREFERENCE_STORAGE_KEY]: 'light' });
    setThemePreferenceStorage(store);
    await clearStoredThemePreference();
    expect(store.map.has(THEME_PREFERENCE_STORAGE_KEY)).toBe(false);
    await expect(loadStoredThemePreference()).resolves.toBeNull();
  });

  it('is a no-op with no store, and never throws', async () => {
    await expect(clearStoredThemePreference()).resolves.toBeUndefined();
  });
});

describe('resolveThemePreference', () => {
  it('prefers the persisted choice', () => {
    expect(resolveThemePreference('light')).toBe('light');
    expect(resolveThemePreference('dark')).toBe('dark');
  });

  it('falls back to dark — the product default', () => {
    expect(defaultThemePreference).toBe('dark');
    expect(resolveThemePreference(null)).toBe('dark');
  });

  it('takes an explicit fallback, which is what the hydrate guard passes', () => {
    expect(resolveThemePreference(null, 'light')).toBe('light');
  });
});

describe('hydratedThemePreference', () => {
  it('applies the persisted mode over the dark first frame', () => {
    expect(hydratedThemePreference({ stored: 'light', current: 'dark', userChose: false })).toBe(
      'light',
    );
  });

  it('returns null when the answer is already on screen', () => {
    expect(
      hydratedThemePreference({ stored: 'dark', current: 'dark', userChose: false }),
    ).toBeNull();
    expect(hydratedThemePreference({ stored: null, current: 'dark', userChose: false })).toBeNull();
  });

  it('leaves an unset preference alone rather than forcing dark on the current mode', () => {
    // Nothing on disk and the tree already light (a spec, a deep link, a future
    // seed): the read has no opinion, so it must not overwrite one.
    expect(
      hydratedThemePreference({ stored: null, current: 'light', userChose: false }),
    ).toBeNull();
  });

  it('never clobbers a choice the user made while the read was in flight', async () => {
    // The race, played out: the read starts dark, the member taps Light, and
    // only then does the store answer with the old value.
    let release: (value: ThemePreference | null) => void = () => undefined;
    const inFlight = new Promise<ThemePreference | null>((resolve) => {
      release = resolve;
    });

    let current: ThemePreference = 'dark';
    let userChose = false;

    current = 'light';
    userChose = true;

    release('dark');
    const stored = await inFlight;

    expect(hydratedThemePreference({ stored, current, userChose })).toBeNull();
    expect(current).toBe('light');
  });
});

describe('bootThemePreference', () => {
  it('reads the store once, however many callers ask', async () => {
    // Both the provider and `useAppBootstrap` call this; the memo is what keeps
    // that one AsyncStorage round trip rather than two.
    const store = fakeStorage({ [THEME_PREFERENCE_STORAGE_KEY]: 'light' });
    // Wrapped in an arrow rather than passed as `store.getItem`: handing a
    // method to `vi.fn` separates it from its object, which is the `this` trap
    // `@typescript-eslint/unbound-method` exists to catch.
    const getItem = vi.fn((key: string) => store.getItem(key));
    setThemePreferenceStorage({ ...store, getItem });

    const [a, b] = await Promise.all([bootThemePreference(), bootThemePreference()]);

    expect(a).toBe('light');
    expect(b).toBe('light');
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('resolves rather than rejecting when AsyncStorage cannot be installed', async () => {
    // Which is exactly this suite: the dynamic import has no native module to
    // find. A rejected boot gate would hold the splash forever.
    setThemePreferenceStorage(fakeStorage({ [THEME_PREFERENCE_STORAGE_KEY]: 'light' }));
    await expect(bootThemePreference()).resolves.toBe('light');
  });

  it('answers null when there is nothing readable at all', async () => {
    await expect(bootThemePreference()).resolves.toBeNull();
  });
});

describe('the native installer stays out of the fast suite', () => {
  it('does not import AsyncStorage at module load', async () => {
    // If the import were static, this spec file would not have parsed at all.
    const module = await import('./theme-preference');
    expect(typeof module.installAsyncStorageThemePreference).toBe('function');
    expect(vi.isMockFunction(module.installAsyncStorageThemePreference)).toBe(false);
  });
});
