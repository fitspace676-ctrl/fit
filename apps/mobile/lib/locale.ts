// @fit/mobile — which language the app is in.
//
// Three inputs, in priority order: the user's persisted choice, the device
// language, then the platform default (`ka` — the product launches in Georgian).
// The two interesting functions here are pure and take their inputs as
// arguments, so the ordering and the hydration race are unit-testable without a
// renderer; `providers/I18nProvider.tsx` is the thin shell that calls them.
//
// Platform access follows the same rule as `lib/auth/token-store.ts`: nothing in
// this module statically imports a native module, because that would drag the
// whole file — and its spec — out of the fast Vitest suite (§5). Storage is an
// injected adapter, and the device language comes from an injected provider that
// the app installs at boot through an indirected dynamic import.
//
// One deliberate difference from `token-store`: missing storage here is *not*
// fatal. A session with no keychain is a broken app and should fail loudly; a
// language preference with no store just falls back to the device language,
// which is the correct behaviour and not worth a crash at launch.

import { defaultLocale, isLocale, type Locale } from '@fit/i18n';

/**
 * The two operations a locale preference needs. Same three-method shape as
 * `SecureStorageAdapter` so the app can hand either backend over, but the
 * preference is not a secret and belongs in AsyncStorage, not the Keychain.
 */
export interface LocaleStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/** AsyncStorage key. Kept from the deleted app so an upgrade keeps the choice. */
export const LOCALE_STORAGE_KEY = 'app_locale';

let storage: LocaleStorageAdapter | null = null;
let deviceLocaleProvider: (() => readonly string[]) | null = null;

/** Install (or clear, with `null`) the preference store. Called at boot and by specs. */
export function setLocaleStorage(adapter: LocaleStorageAdapter | null): void {
  storage = adapter;
}

/** The installed store, or `null` — callers degrade rather than throw. */
export function getLocaleStorage(): LocaleStorageAdapter | null {
  return storage;
}

/**
 * Install (or clear) the device-language source: a function returning BCP-47
 * tags most-preferred first, e.g. `['ka-GE', 'en-US']`.
 */
export function setDeviceLocaleProvider(provider: (() => readonly string[]) | null): void {
  deviceLocaleProvider = provider;
}

/**
 * First supported locale among `tags`, or `null`.
 *
 * Matches on the primary subtag only — `ka-GE`, `ka_GE` and `KA` all mean `ka` —
 * because the platform ships one variant per language and an exact-tag match
 * would answer `null` for every real device.
 */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const primary = tag.split(/[-_]/)[0]?.toLowerCase() ?? '';
    if (isLocale(primary)) return primary;
  }
  return null;
}

/**
 * The device's language if the platform supports it, else `null`. Never throws:
 * a provider that blows up on a device whose settings we cannot read must not
 * take the launch with it.
 */
export function detectDeviceLocale(): Locale | null {
  if (deviceLocaleProvider === null) return null;
  try {
    return matchLocale(deviceLocaleProvider());
  } catch {
    return null;
  }
}

/** Read the persisted choice. `null` when unset, unreadable, or not a locale. */
export async function loadStoredLocale(): Promise<Locale | null> {
  if (storage === null) return null;
  try {
    const value = await storage.getItem(LOCALE_STORAGE_KEY);
    return value !== null && isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persist a choice. Swallows write failures: a full disk must not turn the
 * language switcher into an unhandled rejection — the choice still applies to
 * this session, it just will not survive a relaunch.
 */
export async function persistLocale(locale: Locale): Promise<void> {
  if (storage === null || !isLocale(locale)) return;
  try {
    await storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Preference only — see above.
  }
}

/** Forget the persisted choice, so the device language takes over again. */
export async function clearStoredLocale(): Promise<void> {
  if (storage === null) return;
  try {
    await storage.deleteItem(LOCALE_STORAGE_KEY);
  } catch {
    // Preference only — see above.
  }
}

/**
 * The effective locale: persisted choice → device language → default.
 *
 * Pure, so the priority order is a test rather than a comment.
 */
export function resolveLocale(
  stored: Locale | null,
  device: Locale | null,
  fallback: Locale = defaultLocale,
): Locale {
  return stored ?? device ?? fallback;
}

/**
 * What a completed hydration should apply — or `null` for "leave it alone".
 *
 * This is the guard the salvaged provider was missing. Its `useEffect` only
 * cancelled on *unmount*, so a `loadStoredLocale()` still in flight when the
 * user taps English in the language switcher resolved a moment later and put
 * them back in Georgian. Reading the persisted value can take a while on a cold
 * start behind a Keychain unlock, and the switcher is one tap from launch on the
 * onboarding screen, so the window is real.
 *
 * Two reasons to skip: the user has already chosen (their tap outranks anything
 * on disk, and it was itself persisted), or the answer is what is already on
 * screen (returning `null` there keeps React from a pointless re-render of the
 * whole tree on every launch).
 */
export function hydratedLocale(options: {
  readonly stored: Locale | null;
  readonly device: Locale | null;
  readonly current: Locale;
  readonly userChose: boolean;
}): Locale | null {
  if (options.userChose) return null;
  const next = resolveLocale(options.stored, options.device, options.current);
  return next === options.current ? null : next;
}

/**
 * Install `@react-native-async-storage/async-storage` as the preference store.
 *
 * The module name is indirected through a variable so Vitest never resolves a
 * native module; only the root layout calls this.
 */
export async function installAsyncStorageLocale(): Promise<void> {
  const moduleName = '@react-native-async-storage/async-storage';
  const imported = (await import(/* @vite-ignore */ moduleName)) as {
    default: {
      getItem(key: string): Promise<string | null>;
      setItem(key: string, value: string): Promise<void>;
      removeItem(key: string): Promise<void>;
    };
  };
  const asyncStorage = imported.default;
  setLocaleStorage({
    getItem: (key) => asyncStorage.getItem(key),
    setItem: (key, value) => asyncStorage.setItem(key, value),
    deleteItem: (key) => asyncStorage.removeItem(key),
  });
}

/**
 * Install React Native's own idea of the device language.
 *
 * Not `expo-localization` (not a dependency) and emphatically not
 * `Intl.DateTimeFormat().resolvedOptions().locale`, which is both banned by the
 * lint rule and wrong: Hermes' `Intl` carries no Georgian data and would answer
 * `en-US` on a Georgian phone. The native modules below report the OS setting
 * directly. If neither is readable the app falls back to `ka`, which is the
 * product default — the failure mode is "the right language for most users"
 * rather than "English".
 */
export async function installReactNativeDeviceLocale(): Promise<void> {
  const moduleName = 'react-native';
  const { NativeModules, Platform } = (await import(/* @vite-ignore */ moduleName)) as {
    NativeModules: Record<string, Record<string, unknown> | undefined>;
    Platform: { OS: string };
  };

  setDeviceLocaleProvider(() => {
    if (Platform.OS === 'ios') {
      const settings = NativeModules['SettingsManager']?.['settings'] as
        | { AppleLocale?: string; AppleLanguages?: string[] }
        | undefined;
      const languages = settings?.AppleLanguages ?? [];
      return settings?.AppleLocale !== undefined ? [settings.AppleLocale, ...languages] : languages;
    }
    const identifier = NativeModules['I18nManager']?.['localeIdentifier'];
    return typeof identifier === 'string' ? [identifier] : [];
  });
}
