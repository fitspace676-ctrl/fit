// @fit/i18n — shared locale definitions and message catalogues.
//
// This package is the single source of truth for which locales the platform
// ships, the default locale, and the translated strings consumed by every
// front-end (web today; admin and others next). It is framework-agnostic: the
// next-intl wiring lives in each Next.js app, while the locale list and the
// message JSON live here so web and admin stay in sync.

import en from './locales/en.json';
import ka from './locales/ka.json';

/** Locales the platform ships, ordered for display. `ka` (Georgian) is first. */
export const locales = ['ka', 'en'] as const;

/** A supported locale code. */
export type Locale = (typeof locales)[number];

/** Default locale — the product launches in Georgian first, English is fallback. */
export const defaultLocale: Locale = 'ka';

/** Human-readable label for each locale, shown in the language switcher. */
export const localeNames: Record<Locale, string> = {
  ka: 'ქართული',
  en: 'English',
};

/** Message catalogues keyed by locale, consumed by next-intl's request config. */
export const messages = { ka, en } as const;

/** Shape of a single locale's message catalogue (derived from the EN source). */
export type Messages = typeof en;

/** Narrow an arbitrary string to a supported {@link Locale}. */
export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export { en, ka };
