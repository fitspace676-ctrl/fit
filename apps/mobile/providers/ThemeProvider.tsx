import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { themeColors, type ThemeColors } from '@fit/ui-mobile';

// Semantic theme palette for the mobile app. The values come from the shared
// `@fit/ui-mobile` tokens (the formacore palette + light/dark semantic map),
// which the NativeWind preset also exposes to `className` styles — so runtime
// code (status bar, navigation chrome, chart libs, `<Animated.View>` styles,
// `Pressable` callbacks) paints from the SAME source of truth as the utility
// classes. There's nothing to keep in sync by hand anymore; the tokens live in
// one place (`@fit/ui-mobile/src/tokens`).

export type { ThemeColors };

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
  const value = useMemo<Theme>(() => ({ colors: themeColors(isDark), isDark }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Read the active theme: `{ colors, isDark }`. Throws outside a provider. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>.');
  return ctx;
}
