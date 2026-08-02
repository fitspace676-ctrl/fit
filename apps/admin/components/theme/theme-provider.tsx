'use client';

// @fit/web — member-portal theme provider.
//
// The "formacore" member portal ships both a light and a dark (Aurora-glass)
// skin, switchable from the header. This provider is the single source of truth
// for that choice: it seeds from the server-rendered `<html>` class (set from the
// `theme` cookie so there is no first-paint flash), exposes `{ theme, toggle }`
// via context, and on every change flips the `dark` class on `<html>` and
// persists the choice to the cookie so the next server render matches.

import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from '@/lib/theme';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// The cookie contract lives in a server-safe module: a server component that
// imports a value from a `'use client'` file gets a client reference, not the
// value — which is exactly how the theme silently stopped persisting.
export { THEME_COOKIE, type Theme } from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Persist the theme for a year so the SSR'd `<html>` class stays in sync. */
function persist(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
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

  // Reconcile once on mount in case the cookie and the painted class drifted
  // (e.g. the user changed the theme in another tab since this page was sent).
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

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
