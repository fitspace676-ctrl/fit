import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

// Semantic theme palette for the mobile app. Values are derived from the shared
// brand scale in `@fit/config/tailwind` (`fitTheme.colors.brand`), which
// NativeWind already exposes to `className` styles. We re-express them here as a
// runtime object so non-className code — the status bar, navigation chrome,
// chart libraries, `<Animated.View>` styles — reads the *same* colors. Keep this
// map in sync with the web's Tailwind tokens.

/** Brand scale mirrored from `@fit/config/tailwind` → `fitTheme.colors.brand`. */
const brand = {
  50: '#eef6ff',
  100: '#d9eaff',
  200: '#bcd9ff',
  300: '#8ec1ff',
  400: '#599fff',
  500: '#2f7bff',
  600: '#175ff5',
  700: '#114ae1',
  800: '#153db6',
  900: '#17388f',
  950: '#122357',
} as const;

/** The semantic colors every screen can read off `useTheme().colors`. */
export interface ThemeColors {
  /** App background. */
  background: string;
  /** Elevated surface — cards, sheets, the tab bar. */
  surface: string;
  /** Primary brand / accent. */
  primary: string;
  /** Foreground on a `primary` fill. */
  onPrimary: string;
  /** Foreground text on `background` / `surface`. */
  text: string;
  /** Muted / secondary text. */
  textMuted: string;
  /** Hairline borders and dividers. */
  border: string;
}

const lightTheme: ThemeColors = {
  background: '#ffffff',
  surface: brand[50],
  primary: brand[500],
  onPrimary: '#ffffff',
  text: brand[950],
  textMuted: brand[700],
  border: brand[100],
};

const darkTheme: ThemeColors = {
  background: brand[950],
  surface: brand[900],
  primary: brand[400],
  onPrimary: brand[950],
  text: '#ffffff',
  textMuted: brand[200],
  border: brand[800],
};

/** The reactive theme value exposed by {@link useTheme}. */
export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

const ThemeContext = createContext<Theme | null>(null);

/**
 * Provides the active theme, tied to the OS light/dark preference. React
 * Native's `useColorScheme()` is reactive, so flipping system dark mode
 * re-renders every consumer within one render cycle — no app restart needed.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const value = useMemo<Theme>(
    () => ({ colors: isDark ? darkTheme : lightTheme, isDark }),
    [isDark],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read the active theme: `{ colors, isDark }`. Throws outside a provider. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>.');
  return ctx;
}
