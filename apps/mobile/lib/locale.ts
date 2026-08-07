// @fit/mobile — locale persistence + device-locale detection.
//
// The chosen language is a non-sensitive preference, so it lives in AsyncStorage
// (never SecureStore). This module is the single place that knows the storage key
// and how to turn a device locale string into one of the locales the platform
// ships, so `I18nProvider` can stay focused on the React context.
//
// First-launch resolution order (handled by the provider): persisted choice →
// device language → `defaultLocale`. After the user picks a language explicitly
// it always wins, so the device language only seeds the very first run.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultLocale, isLocale } from '@fit/i18n';
import type { Locale } from '@fit/i18n';

/** AsyncStorage key under which the user's chosen locale is persisted. */
const LOCALE_STORAGE_KEY = 'fit.locale';

/**
 * The locale the user explicitly chose on a previous launch, or `null` when they
 * never have (so the caller should fall back to device detection). A stored value
 * that is no longer a supported locale is treated as absent.
 */
export async function loadStoredLocale(): Promise<Locale | null> {
  const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY).catch(() => null);
  return stored && isLocale(stored) ? stored : null;
}

/** Persist the user's chosen locale (best-effort; a write failure is non-fatal). */
export async function persistLocale(locale: Locale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale).catch(() => undefined);
}

/**
 * The device's preferred language mapped to a supported {@link Locale}, falling
 * back to {@link defaultLocale}. Uses the ICU locale Hermes exposes via `Intl`
 * (e.g. `"ka-GE"`, `"en-US"`) rather than pulling in `expo-localization` — the
 * runtime already ships Intl (the app formats prices/dates with it). The region
 * subtag is dropped: only the language decides which catalogue we load.
 */
export function detectDeviceLocale(): Locale {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().locale;
    const language = resolved.split(/[-_]/)[0]?.toLowerCase() ?? '';
    if (isLocale(language)) return language;
  } catch {
    // A runtime without full Intl locale data — fall through to the default.
  }
  return defaultLocale;
}
