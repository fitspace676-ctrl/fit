import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_ACCENT_STORAGE_KEY,
  appAccentFor,
  bootAppAccent,
  getAppAccent,
  parseStoredAppAccent,
  rememberAppAccent,
  resetAppAccent,
  subscribeAppAccent,
} from './app-accent';
import {
  resetThemePreferenceBoot,
  setThemePreferenceStorage,
  type ThemeStorageAdapter,
} from './theme-preference';

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

const YELLOW = { slug: 'downtown', color: '#facc15' };

afterEach(() => {
  setThemePreferenceStorage(null);
  resetThemePreferenceBoot();
  resetAppAccent();
});

describe('parseStoredAppAccent', () => {
  it('reads a slug and a hex, and nothing else', () => {
    expect(parseStoredAppAccent(JSON.stringify(YELLOW))).toEqual(YELLOW);
    expect(parseStoredAppAccent(null)).toBeNull();
    expect(parseStoredAppAccent('{')).toBeNull();
    expect(parseStoredAppAccent(JSON.stringify({ slug: 'downtown', color: 'red' }))).toBeNull();
    expect(parseStoredAppAccent(JSON.stringify({ slug: '', color: '#facc15' }))).toBeNull();
  });
});

describe('appAccentFor', () => {
  it("never paints one gym in another gym's colour", () => {
    expect(appAccentFor(YELLOW, 'downtown')).toBe('#facc15');
    expect(appAccentFor(YELLOW, 'riverside')).toBeNull();
    expect(appAccentFor(YELLOW, undefined)).toBeNull();
    expect(appAccentFor(null, 'downtown')).toBeNull();
  });
});

describe('boot and remember', () => {
  it('reads the remembered colour at boot so the first frame is already painted', async () => {
    setThemePreferenceStorage(fakeStorage({ [APP_ACCENT_STORAGE_KEY]: JSON.stringify(YELLOW) }));
    const listener = vi.fn();
    subscribeAppAccent(listener);
    await expect(bootAppAccent()).resolves.toEqual(YELLOW);
    expect(getAppAccent()).toEqual(YELLOW);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('persists a fresh colour and forgets a cleared one', async () => {
    const storage = fakeStorage();
    setThemePreferenceStorage(storage);
    await rememberAppAccent('downtown', '#1e3a8a');
    expect(getAppAccent()).toEqual({ slug: 'downtown', color: '#1e3a8a' });
    expect(JSON.parse(storage.map.get(APP_ACCENT_STORAGE_KEY) as string)).toEqual({
      slug: 'downtown',
      color: '#1e3a8a',
    });
    await rememberAppAccent('downtown', null);
    expect(getAppAccent()).toBeNull();
    expect(storage.map.has(APP_ACCENT_STORAGE_KEY)).toBe(false);
  });

  it('lets a settings read that lands first outrank the disk', async () => {
    setThemePreferenceStorage(fakeStorage({ [APP_ACCENT_STORAGE_KEY]: JSON.stringify(YELLOW) }));
    await rememberAppAccent('downtown', null);
    await bootAppAccent();
    expect(getAppAccent()).toBeNull();
  });

  it('boots to the built-in theme without a store', async () => {
    await expect(bootAppAccent()).resolves.toBeNull();
    expect(getAppAccent()).toBeNull();
  });
});
