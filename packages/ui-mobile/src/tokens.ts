// @fit/ui-mobile — design tokens.
//
// The single source of truth for the mobile app's visual language: the brand
// color scale, the semantic light/dark palettes, and the spacing, radius,
// typography and shadow scales the base components are built from. Every value
// is a plain, serialisable primitive so it can be consumed three ways:
//
//   • by NativeWind `className` styles (the brand scale mirrors the shared
//     `@fit/config/tailwind` preset, so `bg-brand-500` etc. already resolve);
//   • by runtime style objects — the status bar, navigation chrome, chart
//     libraries, `<Animated.View>` — via {@link getTheme};
//   • by the base components in this package, which read the active palette
//     with {@link useThemeColors}.
//
// Keep the `brand` scale below in sync with `fitTheme.colors.brand` in
// `@fit/config/tailwind` so web (Tailwind) and mobile (NativeWind) never drift.

/** Brand scale — mirror of `@fit/config/tailwind` → `fitTheme.colors.brand`. */
export const brand = {
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

/** Fixed accent hues used for status, independent of the brand ramp. */
export const accent = {
  success: '#16a34a',
  successDark: '#4ade80',
  danger: '#dc2626',
  dangerDark: '#f87171',
  warning: '#d97706',
  warningDark: '#fbbf24',
} as const;

/**
 * Spacing scale (in px / React Native density-independent units). Matches the
 * rhythm the redesigned screens already use — 12px card padding, 24px screen
 * gutter — so the tokens describe what ships rather than a parallel system.
 */
export const spacing = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  gutter: 24,
} as const;

/** Corner radii. `card` (12) matches the shared `borderRadius.card` token. */
export const radius = {
  sm: 8,
  md: 10,
  card: 12,
  lg: 16,
  pill: 999,
} as const;

/** Type ramp: font size paired with a comfortable line height, in px. */
export const typography = {
  display: { fontSize: 28, lineHeight: 34 },
  title: { fontSize: 20, lineHeight: 26 },
  heading: { fontSize: 16, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
  micro: { fontSize: 12, lineHeight: 16 },
} as const;

/** Font weights as React Native `fontWeight` string literals. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Elevation presets as React Native shadow props. `card` is the resting
 * surface shadow; `fab` matches the raised QR check-in button in the tab bar.
 */
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
} as const;

/**
 * The semantic colors every screen and base component reads. Names are stable
 * across light and dark; only the values swap. This is a superset of the seven
 * roles the app's `ThemeProvider` shipped originally — the extras (`surfaceMuted`,
 * `primarySoft`, `danger`, `success`, `warning`) back the badge/button tones
 * the base components need — so the provider can consolidate onto these tokens
 * without renaming anything.
 */
export interface ThemeColors {
  /** App background. */
  background: string;
  /** Elevated surface — cards, sheets, the tab bar. */
  surface: string;
  /** A recessed fill on top of `surface` — thumbnails, inset wells. */
  surfaceMuted: string;
  /** Primary brand / accent. */
  primary: string;
  /** A low-emphasis tint of `primary` for soft chips and badges. */
  primarySoft: string;
  /** Foreground on a `primary` fill. */
  onPrimary: string;
  /** Foreground text on `background` / `surface`. */
  text: string;
  /** Muted / secondary text. */
  textMuted: string;
  /** Hairline borders and dividers. */
  border: string;
  /** Destructive / error. */
  danger: string;
  /** Positive / success. */
  success: string;
  /** Caution / pending. */
  warning: string;
}

/** Light palette — brand-tinted surfaces on a white background. */
export const lightTheme: ThemeColors = {
  background: '#ffffff',
  surface: brand[50],
  surfaceMuted: brand[100],
  primary: brand[500],
  primarySoft: brand[100],
  onPrimary: '#ffffff',
  text: brand[950],
  textMuted: brand[700],
  border: brand[100],
  danger: accent.danger,
  success: accent.success,
  warning: accent.warning,
};

/** Dark palette — deep brand surfaces with a lifted primary for contrast. */
export const darkTheme: ThemeColors = {
  background: brand[950],
  surface: brand[900],
  surfaceMuted: brand[800],
  primary: brand[400],
  primarySoft: brand[800],
  onPrimary: brand[950],
  text: '#ffffff',
  textMuted: brand[200],
  border: brand[800],
  danger: accent.dangerDark,
  success: accent.successDark,
  warning: accent.warningDark,
};

/** The reactive theme value: the active palette plus its light/dark flag. */
export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

/** Resolve the palette for a light or dark appearance. */
export function getTheme(isDark: boolean): Theme {
  return { colors: isDark ? darkTheme : lightTheme, isDark };
}
