import { useColorScheme } from 'react-native';

import { getTheme, type Theme, type ThemeColors } from './tokens';

// Appearance-driven theme access for the base components. React Native's
// `useColorScheme()` is reactive, so a system light/dark switch re-renders every
// consumer within one render cycle — no provider, no context, no app restart.
// The app's own `ThemeProvider` resolves colors the exact same way, so a screen
// built from this kit and one using the provider always agree.

/** Read the active theme: `{ colors, isDark }`, tracking the OS appearance. */
export function useAppTheme(): Theme {
  const isDark = useColorScheme() === 'dark';
  return getTheme(isDark);
}

/** Convenience: just the active {@link ThemeColors} palette. */
export function useThemeColors(): ThemeColors {
  return useAppTheme().colors;
}
