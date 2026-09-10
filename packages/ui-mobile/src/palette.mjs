// @fit/ui-mobile — THE colour literals. This file is the only place in the
// mobile design system where a hex value is written down.
//
// WHY IT IS `.mjs` AND NOT `.ts`. Tailwind's config loader cannot import a
// TypeScript module, so `tailwind.preset.mjs` needs a plain-ESM source. The old
// package solved that by keeping a second, hand-written copy of the palette in
// the preset with a comment asking humans to keep the two in sync. That
// instruction *was* the bug: the design was repainted to "Lime Block" on
// 2026-08-18 and the runtime copy stayed on the July indigo for six weeks while
// the preset was half-updated. Nobody noticed because nothing could notice.
//
// So there is exactly one literal source now:
//
//   palette.mjs   ← the literals (this file)
//     ├── tailwind.preset.mjs   imports it directly (plain ESM)
//     ├── palette.ts            re-exports it, typed, for the runtime
//     └── scripts/check-design-tokens.ts  diffs it against the design source
//
// `scripts/check-design-tokens.ts` fails CI if these stops stop matching
// `forma-core-app/.workstation/design/_design/tokens.json`, so the drift that
// killed the last package now costs one red line instead of six weeks.
//
// ---------------------------------------------------------------------------
// THE WHOLE PALETTE IS THREE RAMPS.
//
// The direction ("Lime Block", approved 2026-08-18) is monochrome plus exactly
// one lime, with red as the single functional exception. `accent`, `iris`,
// `success`, `warning`, `info` and `flame` are RETIRED and are deliberately not
// shipped here — see the block at the bottom of this file.
// ---------------------------------------------------------------------------

/**
 * The ink ramp — a WARM charcoal neutral (the hue drifts green-grey, not blue).
 * Every surface, border, text stop and "categorical" hue in the product
 * resolves to a step on this ramp.
 *
 * Dark mode, which is the design's home mode, lives at the deep end: an ink-950
 * page with ink-900 cards, one step of separation and no border needed.
 */
export const ink = {
  50: '#F7F7F6',
  100: '#EEEEED',
  200: '#DCDCDA',
  300: '#BABAB7',
  400: '#8F8F8B',
  500: '#6C6C68',
  600: '#53534F',
  700: '#3E3E3B',
  800: '#2B2B29',
  900: '#1E1E1C',
  950: '#131312',
};

/**
 * The lime — the product's only chromatic voice.
 *
 * `300` is the block colour: it carries the membership block, the primary
 * action and a confirmed booking, and nothing else. The deeper stops exist so
 * lime-as-ink stays legible on white (300 on white is ~1.3:1, so links take
 * 800, which measures 5.43:1 — the first stop that clears the 4.5:1 AA floor
 * for the 13–14px text these actually are).
 *
 * Anything sitting ON a lime fill is ink-950. White on lime is ~1.5:1.
 */
export const brand = {
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
};

/**
 * Red — the one functional colour the direction keeps: payment failed,
 * destructive action, hard error. Nothing decorative may use it.
 */
export const danger = {
  50: '#FEF3F2',
  100: '#FEE4E2',
  200: '#FECDCA',
  300: '#FDA29B',
  400: '#F97066',
  500: '#EF4444',
  600: '#D92D20',
  700: '#B42318',
  800: '#912018',
  900: '#7A271A',
  950: '#4E1410',
};

/** Pure white — `--color-on-dark`, the light-mode card, the nav capsule. */
export const white = '#FFFFFF';

/**
 * RN accepts the string `'transparent'` everywhere a colour is accepted, and
 * Tailwind needs the key to exist for `bg-transparent`. Naming it here keeps
 * the semantic maps free of bare literals so the drift guard can assert that
 * every semantic value is a palette member.
 */
export const transparent = 'transparent';

/**
 * The shipped palette, as one object.
 *
 * This is what `tailwind.preset.mjs` sets as `theme.colors` — note: `colors`,
 * not `extend.colors`. Replacing the colour object rather than extending it is
 * what makes a retired ramp a BUILD ERROR on mobile: Tailwind's own defaults
 * (`red-500`, `blue-500`, …) and the base preset's keys are gone, so
 * `bg-iris-500` produces no class and NativeWind renders nothing rather than
 * silently painting a neutral.
 *
 * Web cannot do that — `apps/web/tailwind.config.mjs` still aliases
 * `accent`/`iris`/`warning`/`info`/`flame` to `ink` and `success` to `brand`,
 * because the portal shell has surviving call sites and a hard failure there
 * would break a shipped screen. Mobile has zero call sites (the app was deleted
 * and is being rebuilt), so mobile takes the strict option. That asymmetry is
 * intentional; do not "fix" it by adding the aliases back.
 */
export const palette = {
  ink,
  brand,
  danger,
  white,
  transparent,
};

/**
 * The ramps the direction RETIRED, and what replaces each. Exported so the
 * drift guard can assert none of them reappears in the shipped palette, and so
 * the replacement is written down somewhere a person will find it.
 *
 * `forma-core-app/.workstation/design/_design/tokens.json` STILL SHIPS ALL SIX
 * — it was never pruned after the repaint, and `accent`/`iris` in it are
 * byte-identical copies of the ink ramp. That file is authoritative for the raw
 * brand/ink/danger stops and for nothing else; `_design/MEMORY.md` records the
 * retirement ("accent და iris ტოკენები გაუქმებულია … warning, success, info,
 * flame აღარ გამოიყენება").
 */
export const RETIRED_RAMPS = {
  accent: 'ink',
  iris: 'ink',
  success: 'brand',
  warning: 'ink',
  info: 'ink',
  flame: 'ink',
};

export default palette;
