// The typed face of the palette — the runtime's entry point to the colour
// literals in `palette.mjs`.
//
// This module contains NO hex values, on purpose. It re-exports `palette.mjs`
// and adds the types the rest of the package needs. If you find yourself
// wanting to write `#E4F26A` here, the value belongs in `palette.mjs`.
//
// ---------------------------------------------------------------------------
// A RESOLUTION HAZARD, WRITTEN DOWN SO IT COSTS MINUTES INSTEAD OF AN AFTERNOON.
//
// `src/palette.ts` and `src/palette.mjs` share a basename, so `from '../palette'`
// is ambiguous and different tools break the tie differently:
//
//   TypeScript (moduleResolution: Bundler)   `.ts` first  → this file ✓
//   Metro / Expo (sourceExts)                `.ts` first  → this file ✓
//   Vite / Vitest (resolve.extensions)       `.mjs` FIRST → palette.mjs ✗
//   Jest / jest-expo (moduleFileExtensions)  `.mjs` FIRST → palette.mjs ✗
//
// Under Vite and under Jest the extensionless import silently lands on the
// plain-ESM file, which has the ramps but none of the derived exports below —
// so `RAMP_NAMES` comes back `undefined` rather than failing loudly. Both
// runners are already configured against it; if you add a third, copy one:
//
//   vitest.config.ts   resolve: { extensions: ['.ts', '.tsx', '.mjs', …] }
//   jest.config.js     moduleFileExtensions: ['ts', 'tsx', 'mjs', …]
//                      + a transform entry for `\.mjs$` — Jest's default
//                        transform only registers `\.[jt]sx?$`, and this file
//                        imports `./palette.mjs` explicitly, so extension
//                        ORDER alone does not save you.
//
// (An earlier version of this table claimed jest-expo resolved `.ts` first. It
// does not — WP-5 found that the hard way while wiring the render suite.)
//
// The two filenames are fixed by the design of the single-literal-source rule
// (Tailwind's config loader cannot import `.ts`, so the literals must live in a
// `.mjs`), so the collision is the cost of that rule rather than an oversight.
// ---------------------------------------------------------------------------

import {
  palette as palettePlain,
  ink as inkPlain,
  brand as brandPlain,
  danger as dangerPlain,
  white as whitePlain,
  transparent as transparentPlain,
  RETIRED_RAMPS as RETIRED_RAMPS_PLAIN,
} from './palette.mjs';

/** The stops every shipped ramp carries. */
export const RAMP_STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** One stop on a ramp. */
export type RampStop = (typeof RAMP_STOPS)[number];

/** An 11-stop ramp. */
export type Ramp = Readonly<Record<RampStop, string>>;

/** The ramp names mobile ships. Three, and that is the whole palette. */
export const RAMP_NAMES = ['ink', 'brand', 'danger'] as const;

/** A shipped ramp name. */
export type RampName = (typeof RAMP_NAMES)[number];

/** The warm charcoal neutral. */
export const ink: Ramp = inkPlain;

/** The lime — the product's only chromatic voice. */
export const brand: Ramp = brandPlain;

/** Red — the one functional colour the direction keeps. */
export const danger: Ramp = dangerPlain;

/** `#FFFFFF`. */
export const white: string = whitePlain;

/** The literal `'transparent'`. */
export const transparent: string = transparentPlain;

/** The whole shipped palette. */
export const palette: {
  readonly ink: Ramp;
  readonly brand: Ramp;
  readonly danger: Ramp;
  readonly white: string;
  readonly transparent: string;
} = palettePlain;

/**
 * Ramp names the direction retired, mapped to what replaces each.
 *
 * `success` → lime (an ACTIVE pill is the same lime as the membership block),
 * `warning` → ink (WAITLIST and FROZEN are neutral, not amber), and
 * `accent`/`iris`/`info`/`flame` → ink. None of them is a key in `palette`, so
 * `bg-iris-500` is a build error on mobile rather than a silent neutral.
 */
export const RETIRED_RAMPS: Readonly<Record<string, string>> = RETIRED_RAMPS_PLAIN;

/**
 * Every colour string the shipped palette can produce, as a flat set.
 *
 * The drift guard and `tokens.spec.ts` use this to assert that no semantic slot
 * invents a colour: a value must be a stop on one of the three ramps, `white`,
 * `transparent`, or one of the handful of allowlisted rgba() overlays that RN
 * cannot express any other way (scrim, glass, header, focus ring).
 */
export const PALETTE_VALUES: ReadonlySet<string> = new Set<string>([
  ...RAMP_NAMES.flatMap((name) => RAMP_STOPS.map((stop) => palette[name][stop])),
  white,
  transparent,
]);

/** Is `value` a colour the shipped palette can produce? Case-insensitive. */
export function isPaletteValue(value: string): boolean {
  if (PALETTE_VALUES.has(value)) return true;
  const upper = value.toUpperCase();
  for (const member of PALETTE_VALUES) {
    if (member.toUpperCase() === upper) return true;
  }
  return false;
}
