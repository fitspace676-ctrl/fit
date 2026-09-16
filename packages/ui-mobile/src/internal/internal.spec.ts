// The pure half of WP-5, on Vitest.
//
// Nothing in this file imports `react-native`. That is the test strategy's one
// hard boundary (`docs/mobile-rebuild-plan.md` §5): Vitest for everything that
// does not need a renderer, `jest-expo` for everything that does. The two
// modules under test here are pure arithmetic precisely so that the rules they
// encode — the 44pt touch floor and the radius clamp — can be asserted in
// milliseconds, on every save, without a React tree.
//
// Both are asserted as PROPERTIES over a swept domain rather than as tables of
// expected values. A table passes forever and says nothing the moment somebody
// adds a sixth `IconButton` size; a property is a claim about every size there
// will ever be.

import { describe, expect, it } from 'vitest';

import { clampRadiusTo } from './clamp-radius';
import { hitSlopFor, slopFor, touchTargetFor, MIN_TOUCH_TARGET } from './hit-slop';
import { radii, CUT_TO_RADIUS, PASSTHROUGH_RADII } from '../tokens/radii';

// ===========================================================================
// hitSlopFor
// ===========================================================================

describe('hitSlopFor', () => {
  // THE PROPERTY. Every size the design can produce, plus every size it
  // cannot, must clear the 44pt floor once the component's own slop is
  // applied. `IconButton` accepts an arbitrary `size` override, so the domain
  // is "every plausible control size", not "the five in the variant table".
  it('∀ size in 1..200: size + 2 × slop ≥ 44', () => {
    for (let size = 1; size <= 200; size += 1) {
      expect(touchTargetFor(size)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  it('holds for fractional sizes too', () => {
    for (let size = 0.5; size < 60; size += 0.5) {
      expect(size + 2 * slopFor(size)).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  // The three sizes the design actually ships below the floor. If any of these
  // ever came back 0, the component would be shipping a 36pt target.
  it('pays the difference for the sub-44 variants', () => {
    expect(slopFor(36)).toBe(4); // ghost
    expect(slopFor(40)).toBe(2); // quiet, onAccent
    expect(slopFor(44)).toBe(0); // surface, accent — already at the floor
  });

  it('adds nothing to a control that is already large enough', () => {
    for (const size of [44, 45, 52, 56, 72]) {
      expect(slopFor(size)).toBe(0);
    }
  });

  it('rounds the shortfall UP, because 43 fails as surely as 36', () => {
    // An odd shortfall (44 − 43 = 1) halves to 0.5. Rounding down would leave
    // the target at 43 and the property above would silently be false.
    expect(slopFor(43)).toBe(1);
    expect(touchTargetFor(43)).toBe(45);
  });

  it('is square on every side', () => {
    const slop = hitSlopFor(36);
    expect(slop).toEqual({ top: 4, bottom: 4, left: 4, right: 4 });
  });

  it('is maximally generous about a size it cannot trust', () => {
    // A caller measuring a not-yet-laid-out view gets 0 or NaN. Erring toward
    // MORE touch area is the safe direction to be wrong in.
    for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(slopFor(bad)).toBe(MIN_TOUCH_TARGET / 2);
    }
  });
});

// ===========================================================================
// clampRadiusTo
// ===========================================================================

describe('clampRadiusTo', () => {
  // THE PROPERTY. A radius may never exceed half the box it rounds, or the
  // design's octagonal silhouette becomes a capsule. React Native does not
  // enforce this the way CSS does, so the component must.
  it('∀ radius, ∀ side: result ≤ floor(side / 2)', () => {
    const names = Object.keys(radii) as (keyof typeof radii)[];
    for (let side = 1; side <= 120; side += 1) {
      for (const name of names) {
        expect(clampRadiusTo(name, side)).toBeLessThanOrEqual(Math.floor(side / 2));
      }
      for (const literal of [0, 4, 10, 18, 22, 30, 64, 9999]) {
        expect(clampRadiusTo(literal, side)).toBeLessThanOrEqual(Math.floor(side / 2));
      }
    }
  });

  it('never returns more than the token layer resolved', () => {
    for (let side = 1; side <= 120; side += 1) {
      expect(clampRadiusTo('page', side)).toBeLessThanOrEqual(radii.page);
      expect(clampRadiusTo(30, side)).toBeLessThanOrEqual(30);
    }
  });

  // The worked example from the brief: 12 on a 29pt pill.
  it('keeps a small radius on a short control, and clamps a large one', () => {
    expect(clampRadiusTo(12, 29)).toBe(12);
    expect(clampRadiusTo('container', 29)).toBe(14); // 26 → floor(29/2)
    expect(clampRadiusTo('full', 22)).toBe(11); // a capsule IS half the height
  });

  it('is a pass-through when the box has no fixed side', () => {
    // A content-sized card grows to fit, so over-radius cannot arise.
    for (const side of [undefined, null, 0, -1, Number.NaN]) {
      expect(clampRadiusTo('container', side)).toBe(radii.container);
    }
  });

  it('floors rather than rounds, so an odd height cannot re-create the capsule', () => {
    expect(clampRadiusTo('full', 29)).toBe(14); // not 15
    expect(clampRadiusTo('full', 45)).toBe(22); // not 23
  });

  it('accepts everything the token layer calls a SurfaceRadius', () => {
    // Both halves of the `SurfaceRadius` union — the six named steps and the
    // artboards' literal pass-through values — must survive the second clamp.
    for (const { radius } of Object.values(CUT_TO_RADIUS)) {
      expect(clampRadiusTo(radius, 200)).toBe(radii[radius]);
    }
    for (const literal of PASSTHROUGH_RADII) {
      expect(clampRadiusTo(literal, 200)).toBe(literal);
    }
  });
});
