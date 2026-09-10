// Radii — the cut-corner ladder, rounded.
//
// THE DELIBERATE DEPARTURE FROM THE ARTBOARDS. The design's signature
// silhouette is an octagon: every corner cut on the diagonal via `clip-path`,
// in six sizes. React Native has no `clip-path`, and `packages/astryx-theme`
// already made the same trade for web (`formacoreTheme.ts:16-25`) — the
// moodboard's own radius board sanctions a rounded ladder
// (`rounded-[26px] · ბარათი`, `rounded-[32px] · ბლოკი`) beside the cut one, and
// radii buy back real borders, real focus rings and `overflow` that clips
// children instead of fighting them. Mobile takes the identical mapping so the
// two platforms cannot drift apart.
//
// ===========================================================================
// CUT_* → RADIUS  (decision Q3)
//
//   artboard const   inset   named step   px    where it is used
//   ------------------------------------------------------------------------
//   CUT_XS            7px    inner        10    badges, chips, inline markers,
//                                               count pills, spot markers
//   CUT_SM            9px    inner        10    small controls, filter chips,
//                                               segmented items
//   CUT_MD           11px    element      14    buttons, inputs, segmented
//                                               controls, header icon buttons
//   CUT_TILE         14px    element      14    inset tiles inside a panel
//                                               (stat tiles, fact tiles)
//   CUT_PANEL        22px    container    26    cards, panels, list rows
//   CUT_LG           30px    page         32    hero blocks (membership block,
//                                               login hero, QR pass)
//
// Six cut steps collapse onto four radius steps, plus `none` and `full`: six
// named steps in total. The collapse is not sloppiness — a 7px and a 9px
// diagonal inset are visually the same corner at a phone's viewing distance,
// and shipping two named steps a designer cannot tell apart is how a ladder
// grows to fourteen rungs nobody can choose between.
//
// The artboards ALSO write literal radii — `rounded-[18px]`, `[20px]`, `[22px]`,
// `[28px]`, `[30px]` — a handful of times each. Those pass through as NUMBERS
// via the escape hatch below rather than being force-snapped to the nearest
// named step: snapping them would silently redraw six elements the design
// signed off on, and each of those literals is a one-off geometry (a progress
// track's cap, a QR frame) rather than a missing rung. `26` and `32` DO snap,
// because those two are the ladder — they are `container` and `page`.
// ===========================================================================

/** The named ladder. Six steps; there is no seventh. */
export const radii = {
  /** Square. Dividers, full-bleed media, the flush edge of a scroll rail. */
  none: 0,
  /** CUT_XS / CUT_SM. Badges, chips, count pills, inline markers. */
  inner: 10,
  /** CUT_MD / CUT_TILE. Buttons, inputs, icon buttons, inset tiles. */
  element: 14,
  /** CUT_PANEL. Cards, panels, list rows — the moodboard's `rounded-[26px]`. */
  container: 26,
  /** CUT_LG. Hero blocks — the moodboard's `rounded-[32px]`. */
  page: 32,
  /** Pills and circles. RN clamps to half the shorter side, so this is safe. */
  full: 9999,
} as const;

/** A named rung on the ladder. */
export type RadiusName = keyof typeof radii;

/**
 * A radius a component will accept: a named rung, or a raw number.
 *
 * The numeric arm is the escape hatch decision Q3 asks for. It exists so the
 * artboards' one-off literals (18/20/22/28/30) can be authored as what they
 * are, without either lying about the ladder or growing it.
 */
export type SurfaceRadius = RadiusName | number;

/** Every named rung, largest-first — useful for docs and the kit gallery. */
export const RADIUS_NAMES = ['none', 'inner', 'element', 'container', 'page', 'full'] as const;

/**
 * The `clip-path` insets the artboards use, and the rung each maps to.
 *
 * Kept as data rather than only as prose so the table above is checkable: if a
 * rung is renamed, this stops compiling. Ported components should reach for the
 * rung, never for the inset.
 */
export const CUT_TO_RADIUS = {
  CUT_XS: { inset: 7, radius: 'inner' },
  CUT_SM: { inset: 9, radius: 'inner' },
  CUT_MD: { inset: 11, radius: 'element' },
  CUT_TILE: { inset: 14, radius: 'element' },
  CUT_PANEL: { inset: 22, radius: 'container' },
  CUT_LG: { inset: 30, radius: 'page' },
} as const satisfies Record<string, { inset: number; radius: RadiusName }>;

/**
 * Literal radii the artboards author directly, for reference. These are NOT
 * snapped — `clampRadius(18)` is 18 — and the list is here so a reviewer can
 * tell a deliberate one-off from a typo.
 */
export const PASSTHROUGH_RADII = [18, 20, 22, 28, 30] as const;

/** Largest radius the ladder will hand back. `full` is the ceiling. */
export const RADIUS_MAX = radii.full;

/**
 * Resolve a {@link SurfaceRadius} to the number RN's `borderRadius` wants.
 *
 * Names resolve through the ladder. Numbers pass through, clamped to
 * `[0, RADIUS_MAX]` and rounded — a negative radius throws on Android's older
 * renderers and a fractional one produces a half-pixel-soft corner, which on a
 * dark surface reads as a rendering bug rather than a design choice. Anything
 * that is neither (a `NaN` out of a bad interpolation, `undefined` out of an
 * optional prop) falls back to `none`, because a missing radius must not take
 * a screen down.
 */
export function clampRadius(radius: SurfaceRadius | null | undefined): number {
  if (typeof radius === 'number') {
    if (!Number.isFinite(radius)) return radii.none;
    if (radius <= 0) return radii.none;
    return Math.round(Math.min(radius, RADIUS_MAX));
  }
  if (radius != null && radius in radii) return radii[radius];
  return radii.none;
}
