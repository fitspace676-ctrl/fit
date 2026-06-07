import { defaultLocale, isLocale, locales, messages, type Locale } from '@fit/i18n';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { detectDeviceLocale, loadStoredLocale, persistLocale } from '../lib/locale';

// Mobile i18n. Consumes the SAME message catalogues as web (`@fit/i18n`), so the
// translation keys never drift between surfaces. This is a deliberately small
// runtime — next-intl is web-only — exposing a dot-path `t()` lookup with
// fallback to the default locale.
//
// Locale resolution (T6.8): the first paint uses `initialLocale` (the platform
// default) so there is no async gate on launch; immediately after mount we
// hydrate the *effective* locale from, in order, the user's persisted choice
// then the device language. A `setLocale` from the Settings language switcher
// persists the choice so it wins on every later launch.

type MessageTree = { [key: string]: string | MessageTree };

/** Resolve a dot-path (e.g. `"nav.classes"`) against a locale's message tree. */
function resolve(tree: MessageTree, path: string): string | undefined {
  const value = path
    .split('.')
    .reduce<
      string | MessageTree | undefined
    >((node, segment) => (typeof node === 'object' && node ? node[segment] : undefined), tree);
  return typeof value === 'string' ? value : undefined;
}

export interface I18nContextValue {
  /** The active locale. */
  locale: Locale;
  /** Every locale the platform ships, for a language switcher. */
  locales: readonly Locale[];
  /** Switch the active locale (ignored if not a supported locale). */
  setLocale: (locale: Locale) => void;
  /**
   * Translate a dot-path key, interpolating `{name}` placeholders from `vars`.
   * Falls back to the default locale, then to the raw key if still missing.
   */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Provides the active locale and a `t()` translator to the tree. */
export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Hydrate the effective locale once on mount: a persisted choice wins, else the
  // device language seeds the first run. Guarded so a late-resolving read can't
  // clobber a choice the user makes in the meantime.
  useEffect(() => {
    let active = true;
    void loadStoredLocale().then((stored) => {
      if (!active) return;
      const resolved = stored ?? detectDeviceLocale();
      if (resolved !== initialLocale) setLocaleState(resolved);
    });
    return () => {
      active = false;
    };
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    void persistLocale(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const tree = messages[locale] as unknown as MessageTree;
      const fallback = messages[defaultLocale] as unknown as MessageTree;
      let out = resolve(tree, key) ?? resolve(fallback, key) ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          out = out.replaceAll(`{${name}}`, String(value));
        }
      }
      return out;
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, locales, setLocale, t }),
    [locale, setLocale, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Read the full i18n context. Throws outside a provider. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an <I18nProvider>.');
  return ctx;
}

/** Convenience hook for just the `t()` translator. */
export function useTranslation(): I18nContextValue['t'] {
  return useI18n().t;
}
