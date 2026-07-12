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
  // Overlay entrance motion — shared so the Drawer/Modal primitives in
  // @fit/ui-web animate consistently across every surface. The drawer slides in
  // from its anchored edge; the backdrop fades. Easing is the iOS-sheet curve
  // (fast out, gentle settle). Consumers guard with `motion-reduce:animate-none`.
  keyframes: {
    'drawer-in-right': {
      from: { transform: 'translateX(100%)' },
      to: { transform: 'translateX(0)' },
    },
    'drawer-in-left': {
      from: { transform: 'translateX(-100%)' },
      to: { transform: 'translateX(0)' },
    },
    'drawer-out-right': {
      from: { transform: 'translateX(0)' },
      to: { transform: 'translateX(100%)' },
    },
    'drawer-out-left': {
      from: { transform: 'translateX(0)' },
      to: { transform: 'translateX(-100%)' },
    },
    'overlay-fade-in': {
      from: { opacity: '0' },
      to: { opacity: '1' },
    },
  },
  animation: {
    'drawer-in-right': 'drawer-in-right 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    'drawer-in-left': 'drawer-in-left 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
    'drawer-out-right': 'drawer-out-right 0.26s cubic-bezier(0.4, 0, 1, 1) forwards',
    'drawer-out-left': 'drawer-out-left 0.26s cubic-bezier(0.4, 0, 1, 1) forwards',
    'overlay-fade-in': 'overlay-fade-in 0.2s ease-out',
  },
};

/** A ready-to-spread Tailwind config fragment. */
export default {
  theme: { extend: fitTheme },
};
