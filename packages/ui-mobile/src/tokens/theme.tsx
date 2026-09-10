// The theme context — one object every component reads its tokens from.
//
// ===========================================================================
// DARK IS THE DEFAULT. IT IS NO LONGER THE ONLY OPTION.
//
// All six mobile artboards are dark and there is no light comp, so `dark` stays
// the default here and the product's answer for a member who has never touched
// the switch. That much is unchanged from decision Q5.
//
// What changed on 2026-09-09: the app now ships the switch. The light map in
// `semantic.ts` was always complete, so this needed one prop rather than a
// rewrite — `apps/mobile/providers/ThemePreferenceProvider.tsx` owns the
// member's choice and passes `scheme="light" | "dark"` down. Nothing in the kit
// moved for it.
//
// `scheme="system"` still works and the app deliberately does NOT use it: the
// member's choice is the answer, not the phone's. It stays for a host that
// wants OS-following behaviour (the kit route, a future embed).
//
// This provider still does NOT consult the OS unless asked to. A component that
// needs to know which map is live reads `isDark` — to pick an ASSET or a
// shadow, never a colour, which always comes from `colors`.
// ===========================================================================

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { radii, clampRadius, type SurfaceRadius } from './radii';
import { shadowsFor, type Shadows } from './shadows';
import { layout, spacing } from './spacing';
import { themeColors, type ThemeColors } from './semantic';
import { type as typeRoles } from './typography';

/** Everything a component needs to draw itself. */
export interface Theme {
  /** True when the dark map is active. Read it to pick an asset, not a colour. */
  isDark: boolean;
  /** The complete semantic colour map for the active mode. */
  colors: ThemeColors;
  /** The named radius ladder. */
  radii: typeof radii;
  /** Resolve a `SurfaceRadius` (name or number) to points. */
  clampRadius: (radius: SurfaceRadius | null | undefined) => number;
  /** The 4pt grid. */
  spacing: typeof spacing;
  /** Layout decisions that are not grid steps. */
  layout: typeof layout;
  /** The type roles, as ready-to-spread text styles. */
  type: typeof typeRoles;
  /** The four elevation steps for the active mode. */
  shadows: Shadows;
}

/** How the provider chooses a mode. */
export type ThemeScheme = 'light' | 'dark' | 'system';

function buildTheme(isDark: boolean): Theme {
  return {
    isDark,
    colors: themeColors(isDark),
    radii,
    clampRadius,
    spacing,
    layout,
    type: typeRoles,
    shadows: shadowsFor(isDark),
  };
}

/**
 * Both themes, built once at module load.
 *
 * `themeColors` and `shadowsFor` already return stable references, so these two
 * objects are stable for the process. That is what lets `useTheme()` be safe to
 * destructure in a render body and lets `React.memo` on a themed component
 * actually memoise.
 */
const DARK_THEME = buildTheme(true);
const LIGHT_THEME = buildTheme(false);

/**
 * Defaults to the DARK theme rather than throwing when there is no provider.
 *
 * A missing provider should not blank a screen — a component rendered in a
 * Jest test, a Storybook-style kit route or a detached modal still needs
 * colours. Dark is the correct default because dark is the product.
 */
const ThemeContext = createContext<Theme>(DARK_THEME);

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * `'dark'` (the default, and v1's only shipped value), `'light'`, or
   * `'system'` to follow the OS via `useColorScheme()`.
   */
  scheme?: ThemeScheme;
}

/** Wrap the app once, at the root layout, above the navigator. */
export function ThemeProvider({ children, scheme = 'dark' }: ThemeProviderProps) {
  // Called unconditionally — hooks cannot be skipped — but its result is only
  // consulted for `scheme="system"`. On iOS this re-renders when the user flips
  // Appearance; with `userInterfaceStyle: "dark"` in app.json it never fires.
  const osScheme = useColorScheme();

  const theme = useMemo(() => {
    if (scheme === 'system') return osScheme === 'light' ? LIGHT_THEME : DARK_THEME;
    return scheme === 'light' ? LIGHT_THEME : DARK_THEME;
  }, [scheme, osScheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active theme. Stable between mode changes, so safe to destructure. */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Shorthand for the common case — `const c = useThemeColors()`. */
export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}
