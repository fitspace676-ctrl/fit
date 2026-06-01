// @fit/config — shared Tailwind theme tokens.
//
// Web (Tailwind) and mobile (NativeWind) surfaces extend this so brand
// colors, typography, spacing, and radii stay consistent. Apps merge it in
// their own tailwind config:
//
//   import { fitTheme } from '@fit/config/tailwind';
//   export default { presets: [], theme: { extend: fitTheme }, ... };

/** Brand + design tokens shared across all Fit surfaces. */
export const fitTheme = {
  colors: {
    brand: {
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
