// `hitSlopFor` — the 44px touch-target floor, applied by the component.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A MODULE AND NOT A CONVENTION.
//
// The design's icon buttons come in five sizes and three of them are smaller
// than the 44×44 minimum both platforms' accessibility guidance asks for:
// `quiet` is 40, `ghost` is 36, and the qty-stepper's plus/minus are 36 too.
// That is not a bug in the design — a 36px circle is the right *silhouette* in
// a dense row — it is a bug only if the TOUCHABLE area is also 36.
//
// The failure mode this module exists to prevent is the one where the fix is
// "remember to pass `hitSlop`". Every call site remembers on the day it is
// written and no call site remembers six months later, so the button ships at
// 36 and the miss rate is invisible in every test that drives the component by
// `fireEvent.press` rather than by a coordinate. `IconButton` therefore calls
// `hitSlopFor(size)` itself, unconditionally, and does not accept a `hitSlop`
// prop that a caller could get wrong.
//
// The plan states the contract as a PROPERTY rather than a table, and the spec
// asserts it that way:
//
//     ∀ size:  size + 2 × hitSlopFor(size)  ≥  44
//
// A property survives a new size being added to the variant table; a table of
// expected values does not.
// ---------------------------------------------------------------------------

/** The minimum touch target, in points. Both iOS HIG and Android agree at ~44. */
export const MIN_TOUCH_TARGET = 44;

/** The four-sided slop RN's `hitSlop` prop takes. */
export interface HitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * The extra touch area a control of `size` points needs on each side to reach
 * {@link MIN_TOUCH_TARGET}.
 *
 * Rounds UP (`Math.ceil`) so an odd shortfall overshoots rather than lands one
 * point short — 43 is as much a failure as 36. Returns 0 for anything already
 * at or above the floor, and treats a non-finite or negative `size` as 0 (a
 * caller measuring a not-yet-laid-out view gets the maximum slop, which is the
 * safe direction to be wrong in).
 */
export function slopFor(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return MIN_TOUCH_TARGET / 2;
  if (size >= MIN_TOUCH_TARGET) return 0;
  return Math.ceil((MIN_TOUCH_TARGET - size) / 2);
}

/**
 * {@link slopFor} as the object React Native's `hitSlop` prop wants.
 *
 * Square by construction: the controls this is for are circles, and an
 * asymmetric slop on a circle produces an off-centre target that feels worse
 * than no slop at all.
 */
export function hitSlopFor(size: number): HitSlop {
  const slop = slopFor(size);
  return { top: slop, bottom: slop, left: slop, right: slop };
}

/**
 * The effective touch target of a control of `size` once its slop is applied.
 * Exists so a test — and the cross-cutting a11y sweep — can assert the floor
 * without re-deriving the arithmetic it is checking.
 */
export function touchTargetFor(size: number): number {
  return size + 2 * slopFor(size);
}
