// @fit/ui-mobile — the NativeWind preset.
//
// `apps/mobile/tailwind.config.mjs` presets this, and its `content` must
// include `packages/ui-mobile/src/**` — a missed glob is the classic "the
// shared package renders unstyled" bug.
//
// ===========================================================================
// THE COLOURS COME FROM `src/palette.mjs`, NOT FROM A COPY.
//
// This file imports the literals. It does not restate them. The previous
// package restated them, behind a comment asking humans to keep the two copies
// in sync, and they drifted for six weeks — see the header of `palette.mjs`.
// Tailwind's config loader cannot import a `.ts` module, which is the only
// reason the literal source is `.mjs` rather than TypeScript.
//
// `theme.colors`, NOT `theme.extend.colors`. This is the load-bearing line in
// the file. Setting `colors` REPLACES the colour object — Tailwind's own
// defaults (`red-500`, `blue-500`, `slate-*`) and the `brand` that
// `packages/config/tailwind.config.base.mjs` contributes all disappear, and
// only the three shipped ramps survive. That is what makes `bg-iris-500` a
// build error on mobile: the class generates nothing, NativeWind applies
// nothing, and the missing style is visible immediately.
//
// Web deliberately does the opposite — `apps/web/tailwind.config.mjs` aliases
// `accent`/`iris`/`warning`/`info`/`flame` to `ink` and `success` to `brand`,
// because the portal shell still has call sites and a hard failure there breaks
// a shipped screen. Mobile has zero call sites, so mobile takes the strict
// option. Do not "harmonise" the two by adding the aliases here.
//
// This preset layers ON TOP of `@fit/config/tailwind`, so it must fully
// redeclare everything it needs rather than assuming an inherited value: the
// base contributes only `brand`, a `sans`/`mono` stack meant for a browser, one
// `borderRadius.card` at 12px (not this ladder's 26), a `spacing.gutter`, and a
// set of CSS keyframes that mean nothing in RN.
// ===========================================================================

import { palette } from './src/palette.mjs';

/**
 * The named radius ladder, mirroring `src/tokens/radii.ts`.
 *
 * Restated here because Tailwind cannot import the `.ts` and these are numbers
 * rather than hexes — the single-source rule that binds absolutely is about
 * colour, which is where the drift actually happened. `tokens.spec.ts` asserts
 * this object and `radii.ts` agree rung for rung, so the duplication is
 * mechanically checked rather than trusted.
 *
 * The web mirror (`apps/web/tailwind.config.mjs`) uses the artboards' own class
 * names — `field` / `btn` / `chip` / `card` / `block` / `pill` — so those are
 * aliased alongside the canonical names. A screen ported from an artboard keeps
 * reading the way the artboard was written.
 */
const borderRadius = {
  none: '0px',
  inner: '10px',
  chip: '10px',
  element: '14px',
  field: '14px',
  btn: '14px',
  container: '26px',
  card: '26px',
  page: '32px',
  block: '32px',
  full: '9999px',
  pill: '9999px',
};

/** The 4pt grid, mirroring `src/tokens/spacing.ts`. */
const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  32: '128px',
  gutter: '20px',
};

/**
 * The type roles as `text-*` utilities, mirroring `src/tokens/typography.ts`.
 *
 * Every entry carries an explicit `lineHeight` and `letterSpacing` in PX. RN
 * has no `em` and Android clips Georgian descenders when `lineHeight` is left
 * to the font's metrics — see the header of `typography.ts` for both.
 */
const fontSize = {
  display: ['34px', { lineHeight: '38px', letterSpacing: '-0.85px' }],
  title: ['28px', { lineHeight: '32px', letterSpacing: '-0.7px' }],
  heading: ['24px', { lineHeight: '28px', letterSpacing: '-0.6px' }],
  subheading: ['22px', { lineHeight: '26px', letterSpacing: '-0.55px' }],
  section: ['20px', { lineHeight: '24px', letterSpacing: '-0.5px' }],
  subtitle: ['17px', { lineHeight: '22px', letterSpacing: '0px' }],
  'body-lg': ['16px', { lineHeight: '22px', letterSpacing: '0px' }],
  body: ['15px', { lineHeight: '21px', letterSpacing: '0px' }],
  'body-sm': ['13px', { lineHeight: '21px', letterSpacing: '0px' }],
  caption: ['12px', { lineHeight: '16px', letterSpacing: '0px' }],
  label: ['11px', { lineHeight: '14px', letterSpacing: '1.32px' }],
  eyebrow: ['12px', { lineHeight: '16px', letterSpacing: '1.68px' }],
  micro: ['10px', { lineHeight: '13px', letterSpacing: '1px' }],
  'mono-display': ['30px', { lineHeight: '30px', letterSpacing: '0px' }],
  'mono-lg': ['17px', { lineHeight: '18px', letterSpacing: '0px' }],
  'mono-body': ['15px', { lineHeight: '16px', letterSpacing: '0px' }],
  'mono-sm': ['13px', { lineHeight: '14px', letterSpacing: '0px' }],
  'mono-caption': ['12px', { lineHeight: '14px', letterSpacing: '0px' }],
  'mono-micro': ['10px', { lineHeight: '12px', letterSpacing: '0px' }],
};

/**
 * The bundled families, by their REGISTERED names (see `src/tokens/fonts.ts`).
 *
 * Each weight is its own family because RN does not synthesise weights for a
 * custom family on Android — `font-mono-bold`, not `font-mono font-bold`. The
 * `sans` key is intentionally the SYSTEM stack: decision D5 puts body copy on
 * San Francisco / Roboto, and only the two heading weights are bundled.
 */
const fontFamily = {
  sans: ['System'],
  'sans-bold': ['NotoSansGeorgian-Bold'],
  'sans-extrabold': ['NotoSansGeorgian-ExtraBold'],
  mono: ['JetBrainsMono-Regular'],
  'mono-medium': ['JetBrainsMono-Medium'],
  'mono-semibold': ['JetBrainsMono-SemiBold'],
  'mono-bold': ['JetBrainsMono-Bold'],
};

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    // REPLACE, not extend — see the header.
    colors: {
      transparent: palette.transparent,
      white: palette.white,
      ink: palette.ink,
      brand: palette.brand,
      danger: palette.danger,
    },
    borderRadius,
    spacing,
    fontSize,
    fontFamily,
    extend: {
      /**
       * The `--fc-*` surfaces that are translucent, as background utilities.
       *
       * They are in `extend` rather than replacing anything because they are
       * additions to the colour vocabulary, not a ramp. They live here as well
       * as in `semantic.ts` because a class-authored screen needs
       * `bg-glass` — and unlike the ramps these are pre-multiplied rgba, which
       * only the dark arm of the map ever uses in v1.
       */
      backgroundColor: {
        glass: 'rgba(30, 30, 28, 0.72)',
        header: 'rgba(19, 19, 18, 0.95)',
        scrim: 'rgba(19, 19, 18, 0.85)',
      },
      borderColor: {
        glass: 'rgba(255, 255, 255, 0.12)',
      },
    },
  },
};
