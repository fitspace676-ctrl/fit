// Types for `palette.mjs`.
//
// `palette.mjs` is plain ESM because Tailwind's config loader cannot import a
// `.ts` module (see the header of that file). This declaration file is what
// lets the typed side — `palette.ts`, and through it every token module — see
// the ramps as literal-typed constants without a second copy of the hexes.
//
// TypeScript pairs `palette.mjs` with `palette.d.mts` automatically under
// `moduleResolution: "Bundler"` (what `@fit/config/tsconfig.base.json` sets),
// so `import { palette } from './palette.mjs'` type-checks here and resolves to
// the real `.mjs` in Metro at runtime.
//
// If you add a stop, add it in `palette.mjs` FIRST — this file only describes
// what is there. `tokens.spec.ts` asserts the two agree stop-for-stop.

/** An 11-stop colour ramp, keyed by Tailwind's numeric scale. */
export interface Ramp {
  readonly 50: string;
  readonly 100: string;
  readonly 200: string;
  readonly 300: string;
  readonly 400: string;
  readonly 500: string;
  readonly 600: string;
  readonly 700: string;
  readonly 800: string;
  readonly 900: string;
  readonly 950: string;
}

/** The warm charcoal neutral — the whole palette apart from lime and red. */
export declare const ink: Ramp;

/** The lime. `300` is the block colour. */
export declare const brand: Ramp;

/** Red — the single functional exception the direction keeps. */
export declare const danger: Ramp;

/** `#FFFFFF`. */
export declare const white: string;

/** The literal string `'transparent'`. */
export declare const transparent: string;

/** The whole shipped palette: three ramps plus white and transparent. */
export declare const palette: {
  readonly ink: Ramp;
  readonly brand: Ramp;
  readonly danger: Ramp;
  readonly white: string;
  readonly transparent: string;
};

/** Ramp names the direction retired, mapped to the ramp that replaces each. */
export declare const RETIRED_RAMPS: Readonly<Record<string, string>>;

export default palette;
