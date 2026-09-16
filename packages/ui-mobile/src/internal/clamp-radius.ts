// Radius clamping — the HEIGHT-AWARE half of it.
//
// ---------------------------------------------------------------------------
// WP-1 ALREADY SHIPPED `clampRadius`. THIS FILE DOES NOT REDEFINE IT.
//
// `src/tokens/radii.ts` owns `clampRadius(radius)`, which resolves the
// `SurfaceRadius` union — a named step (`'container'`) or a literal number
// (the artboards' 18/20/22/28/30 pass-through values) — down to one number and
// caps it at `RADIUS_MAX`. That is the whole of the token layer's job and it is
// re-exported below rather than copied, because two implementations of "what
// does `'container'` mean" is exactly the drift WP-1 and WP-2 exist to stop.
//
// What the token layer CANNOT do is the second clamp, because it does not know
// the box. A radius is only meaningful relative to the shorter side of the
// thing it rounds:
//
//     a 12px radius on a 29px-tall pill  →  min(12, 14) = 12   still a pill
//     a 26px radius on a 29px-tall pill  →  min(26, 14) = 14   a CAPSULE
//
// The second is not "a bit rounder", it is a different silhouette: the
// design's cut-corner language reads as an octagon precisely because the
// corner treatment is small relative to the edge, and a capsule loses the
// signature entirely. CSS clamps this for you (`border-radius` is scaled down
// when the sum of two corner radii exceeds the side). React Native does NOT —
// it will happily render a full capsule — so the clamp has to be explicit, and
// it has to live where the component knows its own height.
// ---------------------------------------------------------------------------

import { clampRadius, radii, type SurfaceRadius } from '../tokens/radii';

// Re-exported, not re-implemented. See the header.
export { clampRadius, radii };
export type { SurfaceRadius };

/**
 * Resolve `radius` and clamp it to half of `side`.
 *
 * `side` is the SHORTER dimension of the box being rounded — a control's
 * height for a horizontal pill, the diameter for a circle. Pass `undefined`
 * when the box has no fixed size (a card whose height is content-driven); the
 * result is then just {@link clampRadius}, and CSS-style over-radius simply
 * cannot arise because a content-sized box grows to fit.
 *
 * Floors rather than rounds: `min(radius, floor(side / 2))`. On an odd height
 * the difference is half a point, and rounding up re-creates the capsule this
 * function exists to prevent.
 */
export function clampRadiusTo(
  radius: SurfaceRadius | null | undefined,
  side?: number | null,
): number {
  const resolved = clampRadius(radius);
  if (side == null || !Number.isFinite(side) || side <= 0) return resolved;
  return Math.min(resolved, Math.floor(side / 2));
}
