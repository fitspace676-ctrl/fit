// @fit/mobile — the i18n provider.
//
// Architecture carried over from the deleted app, which got this part right:
//
//   * It consumes the **same catalogues as web** (`@fit/i18n`), so a key cannot
//     mean one thing on the phone and another in the browser, and a copy fix
//     lands on both surfaces at once. next-intl is web-only, so this is a small
//     hand-rolled runtime rather than a second catalogue.
//   * **First paint is synchronous.** The tree renders on `initialLocale`
//     immediately; the persisted choice and the device language are read *after*
//     mount. There is no async gate between the splash screen and the first
//     frame, which is what an `await AsyncStorage.getItem` at the root would be.
//   * **The hydrate cannot clobber a concurrent choice** — see
//     `hydratedLocale`, where that rule lives as a tested pure function.
//
// Three things it did not do, all of them defects this version fixes: plurals
// (`plural()`), typed keys (`MessageKey`), and formatting that never touches
// `Intl` — for money and dates, use `createNumberFormat` / `createDateTimeFormat`
// from `@fit/i18n`, which is enforced by a lint rule, not a convention.
//
// This file holds no logic worth testing: everything below the React seam is a
// pure module under `lib/i18n/` and `lib/locale.ts` with its own Vitest spec.
// That is deliberate — the fast suite cannot import `react-native` (§5), so the
// interesting parts are kept on the other side of the boundary.

import { defaultLocale, isLocale, locales, localeNames, type Locale } from '@fit/i18n';
import { memberMessages } from '@fit/i18n/member';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MessageKey, PluralKey } from '../lib/i18n/keys';
import {
  setMissingMessageHandler,
  translate,
  translatePlural,
  type Catalogues,
  type MessageParams,
} from '../lib/i18n/resolve';
import { detectDeviceLocale, hydratedLocale, loadStoredLocale, persistLocale } from '../lib/locale';

const catalogues = memberMessages as unknown as Catalogues;

export interface I18nContextValue {
  /** The active locale. */
  locale: Locale;
  /** Every locale the platform ships, for the language switcher. */
  locales: readonly Locale[];
  /** Display name for each locale, in its own language. */
  localeNames: Readonly<Record<Locale, string>>;
  /** Switch the active locale and persist the choice. Ignores unsupported values. */
  setLocale: (next: Locale) => void;
  /**
   * Translate a key, interpolating `{name}` placeholders. Falls back to the
   * default locale, then to the raw key. ICU plural blocks in the message are
   * rendered when the matching argument is passed.
   */
  t: (key: MessageKey, params?: MessageParams) => string;
  /**
   * Translate the plural form for `count` — the `…One` / `…Other` sibling of
   * `baseKey`, or an ICU block at `baseKey` itself. `count` is available to the
   * message as `{count}` without passing it twice.
   */
  plural: (baseKey: PluralKey, count: number, params?: MessageParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: ReactNode;
  /**
   * The locale of the first frame, before the persisted choice is read.
   * Optional — the contract other packages code against is `{ children }`. It
   * exists so a future server-known or deep-link locale can seed the tree, and
   * so render tests can pin a locale without touching storage.
   */
  initialLocale?: Locale;
}

/** Provides the active locale, `t()` and `plural()` to the tree. */
export function I18nProvider({ children, initialLocale = defaultLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Set the instant the user picks a language, and never unset. A ref, not
  // state: the hydration callback below has to read the value at the moment it
  // resolves, and a state read there would be the stale one captured at mount —
  // which is precisely the race.
  const userChose = useRef(false);

  useEffect(() => {
    let active = true;
    void loadStoredLocale().then((stored) => {
      if (!active) return;
      const device = detectDeviceLocale();
      // A functional update, so the comparison runs against the locale as of
      // *this moment* rather than the one captured when the effect was created.
      // Combined with the `userChose` ref that is what makes the guard airtight:
      // both halves of `hydratedLocale`'s decision read live values.
      setLocaleState(
        (current) =>
          hydratedLocale({ stored, device, current, userChose: userChose.current }) ?? current,
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!__DEV__) return;
    setMissingMessageHandler((key, missingIn) => {
      console.warn(`[i18n] no message for "${key}" in ${missingIn} or ${defaultLocale}`);
    });
    return () => {
      setMissingMessageHandler(null);
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    userChose.current = true;
    setLocaleState(next);
    void persistLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, params?: MessageParams) => translate(catalogues, locale, key, params),
    [locale],
  );

  const plural = useCallback(
    (baseKey: PluralKey, count: number, params?: MessageParams) =>
      translatePlural(catalogues, locale, baseKey, count, params),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, locales, localeNames, setLocale, t, plural }),
    [locale, setLocale, t, plural],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Read the i18n context. Throws outside a provider rather than rendering keys. */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context === null) {
    throw new Error('useI18n must be used within an <I18nProvider>.');
  }
  return context;
}

/** Convenience for the common case of needing only the translator. */
export function useTranslation(): I18nContextValue['t'] {
  return useI18n().t;
}
