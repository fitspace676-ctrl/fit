// The semantic layer — every colour role the mobile app is allowed to name.
//
// TRANSCRIBED, NOT IMPORTED, from `packages/astryx-theme/src/formacoreTheme.ts`
// (the `tokens` block, lines ~212-325, plus the `--fc-*` vocabulary at ~100-177).
// That module is web-only: it compiles each `[light, dark]` tuple to a CSS
// `light-dark()` custom property via `astryx theme build`, and it imports
// `@astryxdesign/core/theme` and `@astryxdesign/theme-neutral`. None of that
// exists in React Native, so the values are copied here by hand and the drift
// guard (`scripts/check-design-tokens.ts`) is what keeps the copy honest.
//
// Decision D1: the semantic layer comes from `formacoreTheme.ts` and NOT from
// `_design/tokens.json`. tokens.json is the raw ramps and nothing else — it has
// no light mode, no semantic slots, no radius ladder and no WCAG reasoning, and
// it still ships six ramps the direction retired. It is authoritative for the
// brand/ink/danger stop values in `palette.mjs` and for nothing on this page.
//
// ---------------------------------------------------------------------------
// WHY LIGHT MODE IS COMPLETE WHEN v1 IS DARK-ONLY.
//
// Decision Q5 ships v1 with `userInterfaceStyle: "dark"` — all six artboards
// are dark and there is no light comp to build against. But the map below still
// carries both arms of every tuple, because the alternative is a map full of
// single values that would have to be re-derived slot by slot the first time
// somebody wants light mode. A complete light map makes that a swap. An
// incomplete one makes it a rewrite, and a rewrite is where a second, drifting
// palette comes from.
//
// Every value here is either a stop on a shipped ramp, `white`, `transparent`,
// or one of the twelve rgba() overlays in RGBA_ALLOWLIST below. The guard
// asserts exactly that, so a hex typed straight into a slot fails CI.
// ---------------------------------------------------------------------------

import { brand, ink, transparent, white } from '../palette';

/**
 * The rgba() overlays. These are the only values in the map that are not
 * palette members, and each one is a genuine translucency the design depends
 * on — RN has no `color-mix()`, no `backdrop-filter` opacity chaining and no
 * `light-dark()`, so a translucent surface must arrive pre-multiplied.
 *
 * Keep this list SHORT. Every entry is a colour the drift guard can no longer
 * check against the design source, so an addition here is a small hole punched
 * in the guard and needs a reason on the line next to it.
 */
export const RGBA_ALLOWLIST: ReadonlySet<string> = new Set([
  // Sticky header: the canvas at 95%. The artboards' one translucent surface —
  // content scrolling under it stays sensed but never legible.
  'rgba(238, 238, 237, 0.95)', // ink-100 @ 95% — light
  'rgba(19, 19, 18, 0.95)', // ink-950 @ 95% — dark
  // The floating nav capsule. The one glass surface the direction allows, and
  // it earns the exception by being the only element that permanently covers
  // content: opaque, it punched a hole through whatever it floated over.
  'rgba(255, 255, 255, 0.72)', // white @ 72% — light
  'rgba(30, 30, 28, 0.72)', // ink-900 @ 72% — dark
  'rgba(19, 19, 18, 0.10)', // ink-950 @ 10% — capsule edge, light
  'rgba(255, 255, 255, 0.12)', // white @ 12% — capsule edge, dark
  // The focus ring. On web this is a box-shadow built with `color-mix(... 40%)`;
  // RN has neither, so the mixed colour is written out and WP-5 draws it as a
  // 3px border/outline instead of a shadow.
  'rgba(228, 242, 106, 0.40)', // brand-300 @ 40% — both modes
  // The modal/sheet scrim. Mode-independent: a sheet dims the page it covers,
  // and dimming a light page with a light scrim does nothing.
  'rgba(19, 19, 18, 0.85)', // ink-950 @ 85% — both modes
  // Elevation. Warming the light-mode shadow keeps a lifted white card from
  // going blue-grey; dark mode uses pure black because the canvas is already
  // ink-950 and a warm shadow on it is invisible.
  'rgba(19, 19, 18, 0.16)', // light
  'rgba(0, 0, 0, 0.60)', // dark
  // The `onAccentQuiet` button's EDGE. Its 10% ink wash measures 1.23:1 against
  // the lime it sits on — WCAG 1.4.11 asks 3:1 for the boundary of a control,
  // and on the Membership card that button is the card's only action. 55% ink
  // over brand-300 measures 3.89:1, which buys the boundary without repainting
  // the fill the artboards drew. See `forms/button.tsx: ON_ACCENT_QUIET`.
  'rgba(19, 19, 18, 0.55)', // ink-950 @ 55% — both modes, like the fill
  // The CLASS COVER scrim — a photo behind a card's own content, so unlike the
  // sheet scrim it has to leave the picture readable while carrying text. 72%
  // is the measured floor, not a taste: over the worst case a photo can be
  // (pure white) it composites to rgb(85,85,84), where the white title
  // measures 7.45:1 and the ink-200 meta 5.43:1. At 65% the meta is 4.21:1 and
  // at 60% it is 3.54:1 — under the AA floor for 13px text. See
  // `composites/class-card.tsx: COVER`.
  'rgba(19, 19, 18, 0.72)', // ink-950 @ 72% — both modes, like the sheet scrim
]);

/**
 * Every colour role, as a `[light, dark]` tuple.
 *
 * Ordering and comments follow `formacoreTheme.ts` so the two can be diffed by
 * eye. `--color-x-y` becomes `xY`; `--fc-x` becomes `x`.
 */
export const colorTuples = {
  // =========================================================================
  // Canvas & surfaces. Dark is the design's home mode: an ink-950 page with
  // ink-900 cards — one step of separation, no border needed. Light inverts to
  // an ink-100 page with WHITE cards, so the card still reads as the lifted
  // surface. Neither mode uses a gradient or a glass blur.
  // =========================================================================
  backgroundBody: [ink[100], ink[950]],
  backgroundSurface: [white, ink[900]],
  backgroundCard: [white, ink[900]],
  backgroundPopover: [white, ink[900]],
  backgroundMuted: [ink[50], ink[800]],
  neutral: [ink[100], ink[800]],
  skeleton: [ink[200], ink[800]],

  // =========================================================================
  // The lime. Identical in both modes — that is the point of the direction: the
  // membership block is the same colour whichever theme you are in, and
  // everything around it changes instead. Text on lime is always ink-950; white
  // on lime is ~1.5:1, so `onAccent` is the one role that must never flip.
  //
  // `textAccent` / `iconAccent` are NOT the block colour — they are lime used
  // as ink (links, active labels), so light drops DOWN the ramp for contrast on
  // white (800 = 5.43:1; 700 measures 3.72:1 and misses the 4.5:1 AA floor for
  // the 13-14px text these actually are) and dark lifts to 300 (13.7:1 on
  // ink-900).
  // =========================================================================
  accent: [brand[300], brand[300]],
  accentMuted: [brand[100], brand[950]],
  /**
   * Pressed state for anything filled with `accent`. One step UP the ramp, not
   * down: the lime is already the brightest thing on a charcoal canvas, and
   * darkening it reads as "disabled" rather than "live". Web calls this
   * `--fc-accent-hover`; on a touch surface it is the pressed state.
   */
  accentHover: [brand[200], brand[200]],
  onAccent: [ink[950], ink[950]],
  textAccent: [brand[800], brand[300]],
  iconAccent: [brand[800], brand[300]],

  // =========================================================================
  // Text & icon ladders — three stops each, no more. The direction leans on
  // weight and size for hierarchy, not on a dozen greys.
  // =========================================================================
  textPrimary: [ink[950], white],
  textSecondary: [ink[600], ink[400]],
  textDisabled: [ink[400], ink[600]],
  iconPrimary: [ink[950], white],
  iconSecondary: [ink[600], ink[400]],
  iconDisabled: [ink[300], ink[700]],
  onDark: [white, white],
  onLight: [ink[950], ink[950]],

  // =========================================================================
  // Borders. Dark-mode borders are nearly invisible on purpose — separation
  // there comes from the surface step (950 → 900), and a visible border on top
  // of it reads as a second, competing edge.
  // =========================================================================
  border: [ink[200], ink[800]],
  borderEmphasized: [ink[300], ink[700]],

  // =========================================================================
  // Status. The direction reduces sentiment to three signals:
  //
  //   ACTIVE / ATTENDED / confirmed → lime     (mapped onto `success`)
  //   WAITLIST / FROZEN / pending   → ink      (mapped onto `warning`)
  //   payment failed / destructive  → red      (the one surviving colour)
  //
  // `success` is lime rather than green and `warning` is a neutral rather than
  // amber, deliberately: a green ACTIVE pill beside a lime membership block in
  // one viewport is the exact colour-soup the direction removes. The retired
  // `success`/`warning` RAMPS are not shipped — these are semantic ROLES that
  // resolve onto brand and ink, which is a different thing from `bg-success-500`
  // (which is, correctly, a build error here).
  // =========================================================================
  success: [brand[500], brand[300]],
  successMuted: [brand[100], brand[950]],
  onSuccess: [ink[950], ink[950]],

  warning: [ink[500], ink[400]],
  warningMuted: [ink[100], ink[800]],
  onWarning: [white, white],

  error: ['#D92D20', '#F97066'],
  errorMuted: ['#FEE4E2', '#4E1410'],
  onError: [white, white],

  // Red keeps its categorical ramp — it is the functional exception, so where
  // the other nine hues were flattened onto ink, this one stays a real hue.
  backgroundRed: ['#FEF3F2', '#4E1410'],
  borderRed: ['#FECDCA', '#912018'],
  iconRed: ['#D92D20', '#FDA29B'],
  textRed: ['#B42318', '#FECDCA'],

  // =========================================================================
  // The FormaCore surfaces (`--fc-*`) — the recurring materials the artboards
  // use that no generic token contract has a slot for. They live in the token
  // package rather than as literals in each screen so the vocabulary stays one
  // edit wide.
  //
  // The inversion in `tile` is deliberate and is the direction's main depth
  // trick: inside a panel, an inset tile goes DARKER than its parent in dark
  // mode (ink-950 inside ink-900 — the page colour punched back through) and
  // LIGHTER in light mode (ink-50 inside white, with a hairline). Both read as
  // "recessed" without a shadow, which the direction reserves for floating
  // chrome.
  // =========================================================================
  tile: [ink[50], ink[950]],
  tileBorder: [ink[200], transparent],
  /** Web names this `--fc-tile-hover`; a touch surface has no hover, so the
   *  same value carries the pressed state. Renamed, not re-valued. */
  tilePressed: [ink[100], ink[800]],

  // "Quiet" — a filled but voiceless chip: spots-left counts, WAITLIST and
  // FROZEN states, the product monogram. Reads as information, never as an
  // action, and never competes with the lime.
  quiet: [ink[200], ink[800]],
  onQuiet: [ink[700], ink[200]],

  // "Ghost" — a secondary control (cancel, close, dismiss). One step quieter
  // than `quiet` so the two can sit in the same row without ambiguity.
  ghost: [ink[100], ink[800]],
  onGhost: [ink[600], ink[300]],

  // The BOOKED state: a lime the eye reads as "already done" rather than "press
  // me" — tinted fill, deep lime text, lime hairline. Distinct from the solid
  // `accent` CTA that offers the action in the first place.
  booked: [brand[100], brand[950]],
  onBooked: [brand[800], brand[200]],
  bookedBorder: [brand[300], brand[800]],

  // Sticky header: the canvas at 95%. RN has no `backdrop-filter`, so on mobile
  // this is the pre-multiplied colour and WP-6 pairs it with `BlurView` only if
  // a blur is later added to the dep set — the colour alone already reads as
  // the scroll affordance the design wanted.
  header: ['rgba(238, 238, 237, 0.95)', 'rgba(19, 19, 18, 0.95)'],
  // Header icon buttons and fields sit ON that surface, so they take the
  // opposite step: white in light, the panel colour in dark.
  control: [white, ink[900]],
  avatarRing: [ink[200], ink[700]],

  // The floating nav capsule's surface, and its edge.
  glass: ['rgba(255, 255, 255, 0.72)', 'rgba(30, 30, 28, 0.72)'],
  glassBorder: ['rgba(19, 19, 18, 0.10)', 'rgba(255, 255, 255, 0.12)'],

  // One ring for the whole product, so a keyboard/switch-control user meets
  // exactly one focus affordance. 40% stays visible on both the lime fills and
  // the charcoal panels without becoming a second border.
  focusRing: ['rgba(228, 242, 106, 0.40)', 'rgba(228, 242, 106, 0.40)'],

  // =========================================================================
  // Overlays.
  // =========================================================================
  /** Behind a Sheet / Modal. Mode-independent — see RGBA_ALLOWLIST. */
  scrim: ['rgba(19, 19, 18, 0.85)', 'rgba(19, 19, 18, 0.85)'],
  /**
   * Over a class's cover photo. Mode-independent for the same reason `accent`
   * and the duration disc are: a photograph is not a theme surface, so there is
   * no light-mode inversion of it to invert the wash against — a white scrim
   * over a photo would erase the photo, which is the only thing the layer is
   * there to show. 72% is derived, not chosen; the arithmetic is on the
   * allowlist entry.
   */
  coverScrim: ['rgba(19, 19, 18, 0.72)', 'rgba(19, 19, 18, 0.72)'],
  /**
   * The secondary text ladder ON that scrim — the category eyebrow and the
   * meta line, which are `textSecondary` everywhere else.
   *
   * `textSecondary` cannot survive here: ink-400 over the scrim on a white
   * photo is 2.30:1 and ink-300 is 3.83:1, both under AA for 11-13px text.
   * ink-200 is the first stop that clears it, at 5.43:1. So the muted stop is
   * PROMOTED over a cover rather than the scrim being darkened until grey works
   * — the point of the layer is that the photograph is still visible.
   *
   * Fixed in both modes, like `onDark` / `onLight`, because what it sits on is
   * the photo and not the card.
   */
  onCoverMuted: [ink[200], ink[200]],
  /** The colour `shadows.ts` casts. Elevation belongs to floating things only. */
  shadow: ['rgba(19, 19, 18, 0.16)', 'rgba(0, 0, 0, 0.60)'],
} as const satisfies Record<string, readonly [string, string]>;

/** Every colour role the design system names. */
export type ColorRole = keyof typeof colorTuples;

/** The resolved colour map for one mode. */
export type ThemeColors = Readonly<Record<ColorRole, string>>;

/** Every role name, for the guard, the spec and the kit gallery. */
export const COLOR_ROLES = Object.keys(colorTuples) as readonly ColorRole[];

function resolve(index: 0 | 1): ThemeColors {
  const out: Record<string, string> = {};
  for (const [role, tuple] of Object.entries(colorTuples)) out[role] = tuple[index];
  return out as ThemeColors;
}

/**
 * Both modes, resolved once at module load.
 *
 * Resolving eagerly matters: `themeColors()` is read on every render of every
 * themed component, and rebuilding a 50-key object each time would make the
 * theme context a new identity on every pass and re-render the whole tree.
 * These two objects are stable for the lifetime of the process, so
 * `useTheme()` can hand the same reference back and `React.memo` works.
 */
export const lightColors: ThemeColors = resolve(0);
export const darkColors: ThemeColors = resolve(1);

/**
 * The complete semantic colour map for a mode.
 *
 * `themeColors(true)` and `themeColors(false)` are referentially stable, so it
 * is safe to call in a render body.
 */
export function themeColors(isDark: boolean): ThemeColors {
  return isDark ? darkColors : lightColors;
}
