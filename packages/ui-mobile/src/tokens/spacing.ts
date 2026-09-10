// Spacing — a 4pt grid, keyed by Tailwind's own step names.
//
// The keys are Tailwind's (`3` is 12, `2.5` is 10) rather than a t-shirt scale,
// for one reason: every measurement in this design system was authored as a
// Tailwind class on a web artboard. `gap-3` in `mobile-home-v2.tsx` should port
// to `spacing[3]`, not to a `spacing.md` a reader has to decode. Porting a
// screen becomes transcription instead of translation, and a transcription
// error is visible in review.
//
// `tailwind.preset.mjs` re-derives its `spacing` scale from this module, so the
// class `p-5` and the constant `spacing[5]` cannot disagree.

/** The 4pt grid. Only the steps the artboards actually use. */
export const spacing = {
  0: 0,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  11: 44,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

/** A step on the grid. */
export type SpacingStep = keyof typeof spacing;

/**
 * Layout constants that are decisions rather than grid steps.
 *
 * These are the numbers a screen would otherwise hardcode, and each one has a
 * reason that is not "it looked right".
 */
export const layout = {
  /**
   * The screen's horizontal gutter. `px-5` on every one of the six mobile
   * artboards — 52 occurrences against 14 of `px-4` (which are all nested
   * cards, not the screen frame).
   */
  screenGutter: spacing[5],

  /** Vertical rhythm between two sections of a screen. */
  sectionGap: spacing[6],

  /**
   * Bottom padding a scroll view needs so its last row clears the floating tab
   * capsule. Every artboard ends in `pb-32` = 128. `useTabBarInset()` (WP-6)
   * must return exactly this at safe-area inset 0.
   */
  tabBarInset: spacing[32],

  /**
   * The floating capsule's own distance from the screen edge on a device with
   * no home indicator (`bottom-6` on the artboards). On a device that has one,
   * WP-6 computes `insets.bottom + 4` instead — 24 from the raw edge overlaps
   * the indicator.
   */
  tabBarBottom: spacing[6],

  /**
   * The accessibility floor for a touch target. The artboards ship 36px and
   * 40px icon buttons, which are under it; `hitSlopFor(size)` in WP-5 exists to
   * close that gap in the component, never at the call site.
   */
  minTouchTarget: 44,

  /** Control heights the artboards use: `h-9` / `h-10` / `h-11` / `h-14`. */
  controlHeight: {
    sm: spacing[9],
    md: spacing[10],
    lg: spacing[11],
    xl: spacing[14],
  },

  /** A hairline. RN rounds to the device pixel grid; 1 is correct here. */
  hairline: 1,
} as const;
