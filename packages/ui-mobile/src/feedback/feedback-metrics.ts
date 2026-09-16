// WP-8b's arithmetic — the pure half, on Vitest.
//
// ===========================================================================
// WHY THIS FILE EXISTS, AND WHY IT IS NOT `src/layout/metrics.ts`.
//
// `layout/metrics.ts` is WP-6's file and holds the FRAME's arithmetic — the
// capsule, the gutters, the tab-bar reserve. Appending to it would put two
// work packages in one file for no gain, so the feedback layer gets its own,
// under the same rule §5 of the rebuild plan draws: nothing in here imports
// `react-native`, so `feedback-metrics.spec.ts` runs on Vitest in milliseconds
// instead of booting a renderer to check a division.
//
// Three of the things below are here specifically because they must not be
// able to disagree with themselves:
//
//   · `occupancyTone` — the >=100 / >85 / else thresholds appear in THREE
//     places in the design (`mobile-class-detail.tsx:178`, the gallery's
//     `Occupancy`, and the class rows on the classes screen). Three
//     transcriptions of one rule is three chances to get the boundary wrong,
//     and the boundary is the whole point of the rule.
//   · `sheetBottomPad` — `pb-8` on the artboards is 32 points of BROWSER
//     padding. On a home-indicator phone it is not the safe area, and a sheet
//     whose CTA sits under the indicator is a sheet whose CTA is unreachable.
//   · `sheetBodyMaxHeight` — the cart sheet grows with its contents, and the
//     thing that leaves the screen first is the footer. It is measured, not
//     eyeballed.
// ===========================================================================

import { sansFamily, type FontWeightValue } from '../tokens/fonts';
import { spacing } from '../tokens/spacing';
import { type as typeRoles, type TypeRole, type TypeStyle } from '../tokens/typography';

// ---------------------------------------------------------------------------
// Progress — the shared clamp.
// ---------------------------------------------------------------------------

/**
 * `value`, forced into `[min, max]`.
 *
 * THE REASON THIS IS NOT INLINE. `accessibilityValue={{ min, max, now }}` is
 * read verbatim by both platforms' screen readers, and a `now` outside its own
 * range is announced as a percentage above 100 (iOS) or dropped entirely
 * (Android's `AccessibilityNodeInfo.RangeInfo` rejects it). Both failures are
 * invisible on screen — the BAR is clamped by its own `width: '100%'` — so the
 * only place the bug shows up is with a screen reader on, which is exactly the
 * place nobody looks. A non-finite value floors to `min` rather than poisoning
 * the layout with a `NaN` width.
 */
export function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max <= min) return min;
  return Math.min(Math.max(value, min), max);
}

/** `value` as a 0..1 fraction of `[min, max]`. Degenerate ranges give 0. */
export function progressFraction(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return (clampToRange(value, min, max) - min) / (max - min);
}

/** `value` as a whole percentage of `[min, max]`. */
export function progressPercent(value: number, min = 0, max = 100): number {
  return Math.round(progressFraction(value, min, max) * 100);
}

// ---------------------------------------------------------------------------
// Occupancy.
// ---------------------------------------------------------------------------

/** At or above this percentage a class is FULL. */
export const OCCUPANCY_FULL = 100;

/** Above this percentage a class is nearly full. Note: strictly above. */
export const OCCUPANCY_TIGHT = 85;

/**
 * The three occupancy tones, named for the COLOUR the design paints them, not
 * for a state.
 *
 * That naming is deliberate. The plan states the rule as ">= 100 -> danger,
 * > 85 -> ink, else accent", and a reader diffing the plan against this file
 * should be reading the same three words. `progress.tsx` owns the one mapping
 * from these to semantic roles; nothing else may make its own.
 */
export type OccupancyTone = 'accent' | 'ink' | 'danger';

/**
 * How full a class is, 0..100.
 *
 * DIVIDE-BY-ZERO, AND WHY THE ANSWER IS NOT SIMPLY 0. `booked / 0` is either
 * `Infinity` or — for `0 / 0` — `NaN`, and `NaN` fails every comparison below,
 * so an unguarded meter would paint a `NaN%`-wide lime bar on a class that has
 * taken bookings against no capacity. Returning 0 unconditionally is no better:
 * it draws an EMPTY, lime, "spaces available" bar on the one case that is
 * unambiguously over-subscribed.
 *
 * So a non-positive or non-finite capacity is read as "there are no seats":
 * full if anyone is booked, empty if nobody is. Both halves are asserted.
 *
 * Rounds and then clamps at 100, exactly as `mobile-class-detail.tsx:150` does,
 * so an overbooked class reads 100 rather than 117.
 */
export function occupancyPercent(booked: number, capacity: number): number {
  const taken = Number.isFinite(booked) && booked > 0 ? booked : 0;
  if (!Number.isFinite(capacity) || capacity <= 0) return taken > 0 ? OCCUPANCY_FULL : 0;
  return Math.min(Math.round((taken / capacity) * 100), OCCUPANCY_FULL);
}

/** The tone for an already-computed percentage. */
export function occupancyToneFor(percent: number): OccupancyTone {
  if (!Number.isFinite(percent)) return 'accent';
  if (percent >= OCCUPANCY_FULL) return 'danger';
  if (percent > OCCUPANCY_TIGHT) return 'ink';
  return 'accent';
}

/**
 * The design's occupancy tone. THE single source for the thresholds.
 *
 * `occupancyTone(14, 14)` is `'danger'`; `occupancyTone(85, 100)` is
 * `'accent'` (85 is not *above* 85); `occupancyTone(86, 100)` is `'ink'`.
 */
export function occupancyTone(booked: number, capacity: number): OccupancyTone {
  return occupancyToneFor(occupancyPercent(booked, capacity));
}

// ---------------------------------------------------------------------------
// The bar, the ring and the pips.
// ---------------------------------------------------------------------------

/**
 * The track's height — `h-2` on both artboard bars (`mobile-class-detail.tsx:177`,
 * `mobile-profile.tsx:203`).
 *
 * THE GALLERY SAYS `h-1`. It predates the August repaint and both shipping
 * artboards agree on 8, so 8 wins; see the conflict note in `progress.tsx`.
 */
export const PROGRESS_BAR_HEIGHT = spacing[2];

/** The ring's SVG viewBox, radius and stroke — transcribed from `mobile-home-v2.tsx:59-92`. */
export const RING_VIEWBOX = 48;
export const RING_RADIUS = 20;
export const RING_STROKE = 5;

/** The ring's rendered edge length — the artboards' `h-14 w-14`. */
export const RING_SIZE = 56;

/** The unfilled arc's opacity. */
export const RING_TRACK_OPACITY = 0.2;

/** The ring's full circumference at `radius`. */
export function ringCircumference(radius: number = RING_RADIUS): number {
  return 2 * Math.PI * radius;
}

/**
 * `strokeDasharray` for an arc covering `fraction` of the circle.
 *
 * Returned as a pair rather than a string so the spec can assert the numbers
 * without parsing them back out.
 */
export function ringDashArray(
  fraction: number,
  radius: number = RING_RADIUS,
): readonly [number, number] {
  const circumference = ringCircumference(radius);
  const clamped = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
  return [circumference * clamped, circumference];
}

/** One pip — `h-1.5 w-4` on `mobile-home-v2.tsx:292`, with `gap-1` between. */
export const PIP_WIDTH = spacing[4];
export const PIP_HEIGHT = spacing[1.5];
export const PIP_GAP = spacing[1];

/** The PT-credit strip's three segments. Only the default; `total` is a prop. */
export const PIP_COUNT = 3;

// ---------------------------------------------------------------------------
// The sheet.
// ---------------------------------------------------------------------------

/**
 * The enter and exit durations, in milliseconds.
 *
 * One number for both directions, because a sheet that leaves faster than it
 * arrives reads as being dismissed rather than closed — and the scrim, which
 * shares this clock, is what the eye actually tracks.
 */
export const SHEET_ENTER_MS = 220;
export const SHEET_EXIT_MS = 220;

/** `rounded-t-[32px]` on all five sheets. Which is `radii.page`, exactly. */
export const SHEET_RADIUS = 32;

/** How much of the window a sheet may occupy before its body starts scrolling. */
export const SHEET_MAX_HEIGHT_RATIO = 0.85;

/** The grabber — `h-1 w-10`. Decorative; see `sheet.tsx` on why it is silent. */
export const SHEET_GRABBER_WIDTH = spacing[10];
export const SHEET_GRABBER_HEIGHT = spacing[1];

/** The header's round close button — `h-10 w-10`, on all five sheets. */
export const SHEET_CLOSE_SIZE = spacing[10];

/** The floor under the safe-area inset, and the gap added on top of it. */
export const SHEET_BOTTOM_PAD_MIN = spacing[4];
export const SHEET_BOTTOM_PAD_GAP = spacing[4];

/**
 * The panel's bottom padding for a given safe-area inset.
 *
 * ===========================================================================
 * `pb-8` IS NOT THE SAFE AREA. It is 32 points of padding on a browser canvas
 * that has no home indicator, and every one of the five sheets uses it. On an
 * iPhone with a 34pt indicator, 32 puts the sheet's CTA — a 52pt button that
 * is the entire reason the sheet is open — underneath the system's own
 * swipe-up gesture area, which the system wins.
 *
 * `max(inset, 16) + 16`:
 *
 *     inset  0 (Android, no gesture bar)  ->  32   the artboards' own pb-8
 *     inset 16 (Android gesture nav)      ->  32   unchanged
 *     inset 34 (iPhone home indicator)    ->  50   clears it, with 16 to spare
 *
 * The floor at 16 is what makes the no-inset case come out at exactly the
 * artboards' 32 rather than at 16 — so the comp is reproduced on the devices
 * it was drawn for, and only the devices it was NOT drawn for pay more.
 * ===========================================================================
 */
export function sheetBottomPad(insetBottom: number): number {
  const inset = Number.isFinite(insetBottom) && insetBottom > 0 ? insetBottom : 0;
  return Math.round(Math.max(inset, SHEET_BOTTOM_PAD_MIN) + SHEET_BOTTOM_PAD_GAP);
}

/** What {@link sheetBodyMaxHeight} needs. */
export interface SheetBodyParams {
  /** `useWindowDimensions().height`. */
  windowHeight: number;
  /**
   * Everything in the panel that is NOT the scrolling body: the grabber, the
   * header, the footer and the panel's own vertical padding. Measured with
   * `onLayout` rather than assumed, because the header is one or two lines and
   * the footer is zero, one or two buttons.
   */
  chromeHeight: number;
  /** Default {@link SHEET_MAX_HEIGHT_RATIO}. */
  maxHeightRatio?: number;
}

/**
 * The tallest the scrolling body may be.
 *
 * ===========================================================================
 * THE BUG THIS PREVENTS, CONCRETELY. The shop's cart sheet
 * (`mobile-shop.tsx:270-386`) is a column of lines with a total and a
 * "place order" button under it. Nothing in the artboard caps its height,
 * because on a 390x844 canvas three lines fit. At eight lines the panel is
 * taller than the window, and what leaves the screen is the BOTTOM of the
 * panel — which is the CTA. The sheet then looks fine, scrolls nowhere, and
 * cannot be completed.
 *
 * So the body is capped and scrolls, and the footer lives OUTSIDE the
 * ScrollView. Returns 0 when the chrome alone already exceeds the cap; the
 * caller reads 0 as "unconstrained" rather than as "zero-height", because a
 * sheet whose chrome is that tall has a layout problem the body cannot fix,
 * and hiding the body would hide the problem too.
 * ===========================================================================
 */
export function sheetBodyMaxHeight({
  windowHeight,
  chromeHeight,
  maxHeightRatio = SHEET_MAX_HEIGHT_RATIO,
}: SheetBodyParams): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 0;
  const ratio = Number.isFinite(maxHeightRatio)
    ? Math.min(Math.max(maxHeightRatio, 0.1), 1)
    : SHEET_MAX_HEIGHT_RATIO;
  const chrome = Number.isFinite(chromeHeight) && chromeHeight > 0 ? chromeHeight : 0;
  return Math.max(0, Math.round(windowHeight * ratio - chrome));
}

// ---------------------------------------------------------------------------
// The toast.
// ---------------------------------------------------------------------------

/** How long a toast stays up. Kept from the salvaged provider. */
export const TOAST_AUTO_HIDE_MS = 3000;

/** The fade, in and out. Kept from the salvaged provider. */
export const TOAST_FADE_MS = 150;

/** The gap between the toast and the space the tab capsule reserves. */
export const TOAST_GAP = spacing[3];

/**
 * How far above the window's bottom edge the toast sits.
 *
 * ===========================================================================
 * THE SALVAGED PROVIDER ANCHORED TO THE TOP, AND IT CANNOT STAY THERE. All six
 * artboards put a 44pt header action in the top-right — the cart button, the
 * filter button, the settings button — and a top-anchored toast lands on it.
 * The user's next tap is then a coin toss between dismissing the toast and
 * opening the cart, and which one they get depends on a 3-second timer.
 *
 * The bottom is free by construction: `tabBarInset` is the space every screen
 * ALREADY reserves so its last row clears the floating capsule, so a toast
 * placed just above that reserve covers nothing but canvas.
 * ===========================================================================
 */
export function toastBottomOffset(tabBarInset: number): number {
  const inset = Number.isFinite(tabBarInset) && tabBarInset > 0 ? tabBarInset : 0;
  return Math.round(inset + TOAST_GAP);
}

// ---------------------------------------------------------------------------
// Type, re-weighted.
// ---------------------------------------------------------------------------

/** Every role on the sans half of the scale. */
export type SansTypeRole = Exclude<
  TypeRole,
  'monoDisplay' | 'monoLarge' | 'monoBody' | 'monoSmall' | 'monoCaption' | 'monoMicro'
>;

/**
 * A sans role at a weight the scale does not itself carry.
 *
 * ===========================================================================
 * WHY THIS IS NOT A NEW TYPE ROLE, AND NOT AN INLINE `fontWeight` OVERRIDE.
 *
 * `tokens/typography.ts` counted the sizes the six artboards use and gave each
 * ONE weight — 13px is 400, 12px is 500, 17px is 700. The feedback layer needs
 * four pairings that scale does not have: an alert title at 13/600, a confirm
 * recap line at 13/500, a toast label at 13/700 and an alert body at 12/400.
 * Adding four roles would mean editing WP-1's file, which this work package
 * does not own; hand-writing `fontWeight` at each site would be wrong in a way
 * that is invisible on iOS and broken on Android.
 *
 * The Android half is the part worth spelling out: React Native does not
 * synthesise weights for a bundled family, so weight 700 and 800 must select
 * `NotoSansGeorgian-Bold` / `-ExtraBold` BY NAME and must then NOT also set
 * `fontWeight` (setting both double-bolds on iOS). Weights 400-600 ride the
 * system sans, where `fontWeight` does its normal job and there is no family
 * to name. `sansFamily` is the token layer's own answer to that question, so
 * this asks it rather than restating it.
 *
 * Size, line height and tracking always come from the role, which is what the
 * scale exists to protect. Only the weight moves. `Button.labelStyle` does the
 * identical thing for the identical reason; this is that helper, exported,
 * because four more call sites now need it.
 * ===========================================================================
 */
export function weightedType(role: SansTypeRole, weight: FontWeightValue): TypeStyle {
  const base = typeRoles[role];
  const family = sansFamily(weight);
  return {
    fontSize: base.fontSize,
    lineHeight: base.lineHeight,
    letterSpacing: base.letterSpacing,
    // Exactly one of the two, never both. See the header.
    ...(family ? { fontFamily: family } : { fontWeight: weight }),
    ...(base.textTransform ? { textTransform: base.textTransform } : {}),
  };
}
