// @fit/astryx-theme — the Fit brand as an Astryx theme.
//
// Astryx (Meta's React + StyleX design system) ships a structurally-complete
// but visually-neutral base. We KEEP the formacore "Aurora-glass" brand: we
// start from `theme-neutral` for its full, accessibility-tuned token spine
// (backgrounds, text ladders, categorical hues, shadows, dark-mode rubric)
// and override only the slots that carry brand identity — the accent ramp,
// the status colors, the type families, and the corner radii.
//
// The palette values are the same hexes the Tailwind preset already uses
// (apps/web/tailwind.config.mjs): brand = electric indigo (#6257E3), status
// success/#12B76A · warning/#F79009 · danger/#EF4444, info blue #2E90FA.
//
// Token values are `[light, dark]` tuples (compiled to CSS `light-dark()`) or
// a single string when the value is mode-independent.

import { defineTheme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral';

export const fitTheme = defineTheme({
  name: 'fit',

  // Neutral gives us the whole token contract — we only repaint the brand slots.
  extends: neutralTheme,

  // Fonts are loaded by each app via next/font, which exposes them as the
  // `--font-*` CSS variables referenced here (loading is the consumer's job;
  // see apps/*/app/**/layout.tsx). Falling back to the bare family names keeps
  // the theme usable if the variables are ever absent.
  typography: {
    scale: { base: 16, ratio: 1.2 },
    body: {
      family: 'var(--font-manrope)',
      fallbacks: 'Manrope, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    },
    heading: {
      // Display + headings share Archivo (the formacore `font-display`).
      family: 'var(--font-archivo)',
      fallbacks: 'Archivo, var(--font-manrope), system-ui, sans-serif',
      weights: { 3: 'bold', 4: 'bold' },
    },
    code: {
      family: 'var(--font-jetbrains)',
      fallbacks: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
    },
  },

  tokens: {
    // =========================================================================
    // Accent — electric indigo (#6257E3) is Fit's primary action color, so it
    // maps onto Astryx's single semantic `accent`. Dark mode lifts to brand-400
    // (#9184F1) for contrast against the dark canvas; text/icon accents use the
    // deeper brand-600 / lighter brand-300 stops for legibility on tinted chips.
    // =========================================================================
    '--color-accent': ['#6257E3', '#9184F1'],
    '--color-accent-muted': ['#E8E6FD', '#312A74'],
    '--color-on-accent': '#FFFFFF',
    '--color-text-accent': ['#5044D2', '#B5AEF7'],
    '--color-icon-accent': ['#5044D2', '#B5AEF7'],

    // =========================================================================
    // Status / sentiment — success #12B76A · warning #F79009 · danger #EF4444.
    // Light uses the saturated 500 stop; dark lifts to the 400 stop (matching
    // the neutral base's "invert to a lighter pastel in dark mode" rubric).
    // =========================================================================
    '--color-success': ['#12B76A', '#32D583'],
    '--color-warning': ['#F79009', '#FDB022'],
    '--color-error': ['#EF4444', '#F97066'],
    '--color-on-success': '#FFFFFF',
    '--color-on-warning': '#4E1D09',
    '--color-on-error': '#FFFFFF',

    // Info blue (#2E90FA) — recolor the categorical "blue" ramp so info-toned
    // surfaces read as our brand info rather than neutral's from-scratch blue.
    '--color-icon-blue': ['#1570EF', '#84CAFF'],
    '--color-text-blue': ['#175CD3', '#B2DDFF'],
    '--color-border-blue': ['#84CAFF', '#175CD3'],

    // =========================================================================
    // Radii — formacore scale: field .5rem / card 1rem / pill full. (Buttons
    // get their .75rem via the component override below.)
    // =========================================================================
    '--radius-inner': '0.375rem',
    '--radius-element': '0.5rem',
    '--radius-container': '1rem',
    '--radius-full': '9999px',
  },

  components: {
    // Buttons use the formacore `btn` radius (.75rem), a touch rounder than the
    // .5rem field radius.
    button: {
      base: { borderRadius: '0.75rem' },
    },
  },
});

export default fitTheme;
