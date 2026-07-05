// @fit/config — shared Tailwind theme tokens.
//
// Web (Tailwind) and mobile (NativeWind) surfaces extend this so brand
// colors, typography, spacing, and radii stay consistent. Apps merge it in
// their own tailwind config:
//
//   import { fitTheme } from '@fit/config/tailwind';
//   export default { presets: [], theme: { extend: fitTheme }, ... };

/**
 * Brand + design tokens shared across all Fit surfaces.
 *
 * `brand` is the formacore "electric indigo" scale — the single source of truth
 * for the brand color. The formacore apps (web, admin, platform, mobile) also
 * declare the full palette (accent/ink/status ramps) on top of this preset and
 * redeclare `brand` with these exact values; surfaces without a formacore
 * artboard (superadmin) inherit the brand straight from here, so keeping this in
 * sync with the design tokens is what stops the console drifting to a stale blue
 * (the value this held before the T10.6 parity audit).
 */
export const fitTheme = {
  colors: {
    brand: {
      50: '#F2F1FE',
      100: '#E8E6FD',
      200: '#D3CFFB',
      300: '#B5AEF7',
      400: '#9184F1',
      500: '#6257E3',
      600: '#5044D2',
      700: '#4536B5',
      800: '#392E92',
      900: '#312A74',
      950: '#1E1A45',
    },
  },
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
  },
  borderRadius: {
    card: '0.75rem',
  },
  spacing: {
    gutter: '1.5rem',
  },
};

/** A ready-to-spread Tailwind config fragment. */
export default {
  theme: { extend: fitTheme },
};
