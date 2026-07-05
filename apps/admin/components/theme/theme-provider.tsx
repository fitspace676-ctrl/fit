'use client';

// @fit/web — member-portal theme provider.
//
// The "formacore" member portal ships both a light and a dark (Aurora-glass)
// skin, switchable from the header. This provider is the single source of truth
// for that choice: it seeds from the server-rendered `<html>` class (set from the
// `theme` cookie so there is no first-paint flash), exposes `{ theme, toggle }`
// via context, and on every change flips the `dark` class on `<html>` and
// persists the choice to the cookie so the next server render matches.

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server — so the mount-time
 * theme reconciliation runs *before the browser paints* (avoiding a flash) while
 * staying quiet during SSR, where layout effects don't run and React warns.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Cookie the chosen theme is persisted under (read by the server layout). */
export const THEME_COOKIE = 'theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Persist the theme for a year so the SSR'd `<html>` class stays in sync. */
function persist(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Read the persisted theme from the cookie on the client, or `null` when unset.
 * On statically-served routes the server bakes in the *default* theme (the
 * request cookie isn't read at prerender time), so the cookie — reconciled onto
 * `<html>` by the pre-hydration `ThemeScript` — is the real source of truth.
 */
function readThemeCookie(): Theme | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark)`));
  return match ? (match[1] as Theme) : null;
}

/**
 * Wrap the member portal so any descendant can read or flip the theme. `initial`
 * comes from the server (the cookie), so the first client render already matches
 * the painted DOM and there is no flicker.
 */
export function ThemeProvider({ initial, children }: { initial: Theme; children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    persist(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      persist(next);
      return next;
    });
  }, []);

  // Adopt the cookie's theme once on mount. The server-provided `initial` can be
  // stale on statically-served routes (it reflects the build-time default, not
  // the visitor's cookie), so we align React state to the cookie the
  // pre-hydration `ThemeScript` already painted onto `<html>` — converging state,
  // DOM, and cookie without ever flipping the theme back after paint (no FOUC).
  // A layout effect (not passive) so the state update — and the resulting Astryx
  // `<Theme>` re-sync of `data-theme` on `<html>` — is flushed before the paint.
  useIsomorphicLayoutEffect(() => {
    const resolved =
      readThemeCookie() ?? (document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    setThemeState((prev) => (prev === resolved ? prev : resolved));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggle, setTheme }),
    [theme, toggle, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read the current theme and its setters. Throws outside a {@link ThemeProvider}. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
