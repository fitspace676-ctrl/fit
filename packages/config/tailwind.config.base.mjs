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
 * `brand` is the formacore "Lime Block" scale — the single source of truth for
 * the brand color. The formacore apps (web, admin, platform) also declare the
 * full palette (ink/status ramps) on top of this preset and redeclare `brand`
 * with these exact values; surfaces without a formacore artboard (superadmin)
 * inherit the brand straight from here.
 *
 * This scale drifted twice: to a pre-formacore blue before the T10.6 audit, and
 * then to the electric indigo this file held until the August "Lime Block"
 * repaint (`bea6e41`) was never propagated here. A prose instruction to keep it
 * in sync is what failed both times, so `scripts/check-design-tokens.ts` now
 * diffs these stops against the design tokens in CI. Change them there first.
 */
export const fitTheme = {
  colors: {
    brand: {
      50: '#FBFEE9',
      100: '#F6FCC9',
      200: '#EFF9A2',
      300: '#E4F26A',
      400: '#D6E844',
      500: '#C2D625',
      600: '#A3B71C',
      700: '#7D8C1B',
      800: '#63701D',
      900: '#525C1E',
      950: '#2C330A',
    },
  },
  fontFamily: {
    // Noto Sans Georgian leads: Manrope/Archivo were dropped from the direction
    // because they carry no Georgian coverage and fell back mid-paragraph.
    sans: ['Noto Sans Georgian', 'Inter', 'system-ui', 'sans-serif'],
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
