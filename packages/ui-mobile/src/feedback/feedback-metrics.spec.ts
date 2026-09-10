// The pure half of WP-8b, on Vitest.
//
// Nothing here — or in the module it tests — imports `react-native`. That is
// §5's one hard boundary, and it is what lets the two things in this work
// package that are genuinely arithmetic (an occupancy threshold and a sheet's
// height budget) be asserted on every save rather than in a simulator.

import { describe, expect, it } from 'vitest';

import {
  OCCUPANCY_FULL,
  OCCUPANCY_TIGHT,
  PIP_GAP,
  PIP_HEIGHT,
  PIP_WIDTH,
  PROGRESS_BAR_HEIGHT,
  RING_RADIUS,
  RING_SIZE,
  RING_STROKE,
  RING_VIEWBOX,
  SHEET_BOTTOM_PAD_MIN,
  SHEET_ENTER_MS,
  SHEET_EXIT_MS,
  SHEET_MAX_HEIGHT_RATIO,
  SHEET_RADIUS,
  TOAST_AUTO_HIDE_MS,
  TOAST_GAP,
  clampToRange,
  occupancyPercent,
  occupancyTone,
  occupancyToneFor,
  progressFraction,
  progressPercent,
  ringCircumference,
  ringDashArray,
  sheetBodyMaxHeight,
  sheetBottomPad,
  toastBottomOffset,
  weightedType,
} from './feedback-metrics';
import { radii } from '../tokens/radii';
import { type as typeRoles } from '../tokens/typography';

// ===========================================================================
// `occupancyTone` — the reason this file exists.
//
// The rule is stated once in the plan (">= 100 -> danger, > 85 -> ink, else
// accent") and drawn three times in the design. What a threshold test has to
// pin down is not the middle of each band — anyone gets that right — but the
// two boundaries and the degenerate input, which is where three independent
// transcriptions drift apart.
// ===========================================================================
describe('occupancyTone', () => {
  it('is accent below the tight threshold', () => {
    expect(occupancyTone(0, 20)).toBe('accent');
    expect(occupancyTone(7, 12)).toBe('accent'); // the gallery's Boxing Basics
    expect(occupancyTone(14, 20)).toBe('accent'); // Morning Yoga, 70%
    expect(occupancyTone(20, 24)).toBe('accent'); // Spin Express, 83%
  });

  it('treats exactly 85% as accent — the threshold is STRICTLY above', () => {
    expect(occupancyPercent(85, 100)).toBe(OCCUPANCY_TIGHT);
    expect(occupancyTone(85, 100)).toBe('accent');
  });

  it('is ink from just above 85% up to just below full', () => {
    expect(occupancyTone(86, 100)).toBe('ink');
    expect(occupancyTone(99, 100)).toBe('ink');
    // 17/19 is 89.5%, which ROUNDS to 90 — the rounding happens before the
    // comparison, exactly as the artboard does it.
    expect(occupancyTone(17, 19)).toBe('ink');
  });

  it('is danger at exactly full, and stays there when overbooked', () => {
    expect(occupancyTone(14, 14)).toBe('danger'); // the gallery's CrossFit WOD
    expect(occupancyTone(100, 100)).toBe('danger');
    expect(occupancyTone(30, 24)).toBe('danger');
    // Clamped, not reported as 125.
    expect(occupancyPercent(30, 24)).toBe(OCCUPANCY_FULL);
  });

  // THE DIVIDE-BY-ZERO. `0 / 0` is NaN and NaN fails every comparison, so an
  // unguarded meter is silently `accent` — a lime "spaces available" bar on a
  // class that has none.
  describe('capacity === 0', () => {
    it('is empty and accent when nobody is booked', () => {
      expect(occupancyPercent(0, 0)).toBe(0);
      expect(occupancyTone(0, 0)).toBe('accent');
    });

    it('is full and danger when anyone is booked against no capacity', () => {
      expect(occupancyPercent(3, 0)).toBe(OCCUPANCY_FULL);
      expect(occupancyTone(3, 0)).toBe('danger');
    });

    it('never returns NaN', () => {
      expect(Number.isNaN(occupancyPercent(0, 0))).toBe(false);
      expect(Number.isNaN(occupancyPercent(5, 0))).toBe(false);
    });
  });

  it('survives negative and non-finite input', () => {
    expect(occupancyTone(-4, 20)).toBe('accent');
    expect(occupancyPercent(-4, 20)).toBe(0);
    expect(occupancyTone(5, -20)).toBe('danger');
    expect(occupancyTone(Number.NaN, 20)).toBe('accent');
    expect(occupancyTone(5, Number.NaN)).toBe('danger');
    // A non-finite BOOKED count can only come from a broken computation, and
    // it floors to 0 in the same direction `clampToRange` does — a bar that
    // reads empty is a bug someone investigates; one that reads full is a
    // class members are told not to book.
    expect(occupancyPercent(Number.POSITIVE_INFINITY, 20)).toBe(0);
  });

  it('agrees with occupancyToneFor on the percentage it computes', () => {
    for (const [booked, capacity] of [
      [0, 20],
      [17, 20],
      [18, 20],
      [19, 20],
      [20, 20],
      [21, 20],
    ] as const) {
      expect(occupancyTone(booked, capacity)).toBe(
        occupancyToneFor(occupancyPercent(booked, capacity)),
      );
    }
  });
});

// ===========================================================================
// The progressbar clamp. `accessibilityValue.now` outside its range is
// announced wrong on iOS and dropped outright on Android, and neither shows
// up on screen.
// ===========================================================================
describe('clampToRange', () => {
  it('clamps below and above', () => {
    expect(clampToRange(-5, 0, 100)).toBe(0);
    expect(clampToRange(140, 0, 100)).toBe(100);
    expect(clampToRange(42, 0, 100)).toBe(42);
  });

  it('honours a non-zero minimum', () => {
    expect(clampToRange(0, 10, 20)).toBe(10);
    expect(clampToRange(99, 10, 20)).toBe(20);
  });

  it('falls back to the minimum rather than propagating a NaN', () => {
    expect(clampToRange(Number.NaN, 0, 100)).toBe(0);
    expect(clampToRange(Number.POSITIVE_INFINITY, 0, 100)).toBe(0);
  });

  it('collapses a degenerate range to its minimum', () => {
    expect(clampToRange(5, 10, 10)).toBe(10);
    expect(clampToRange(5, 10, 2)).toBe(10);
  });
});

describe('progressFraction / progressPercent', () => {
  it('maps a value onto 0..1', () => {
    expect(progressFraction(0, 0, 100)).toBe(0);
    expect(progressFraction(50, 0, 100)).toBe(0.5);
    expect(progressFraction(100, 0, 100)).toBe(1);
  });

  it('clamps out-of-range input rather than overflowing the track', () => {
    expect(progressFraction(-5, 0, 100)).toBe(0);
    expect(progressFraction(140, 0, 100)).toBe(1);
    expect(progressPercent(-5)).toBe(0);
    expect(progressPercent(140)).toBe(100);
  });

  it('handles a non-percentage range — three PT credits, two used', () => {
    expect(progressFraction(2, 0, 3)).toBeCloseTo(2 / 3);
    expect(progressPercent(2, 0, 3)).toBe(67);
  });

  it('gives 0 for a degenerate range instead of dividing by zero', () => {
    expect(progressFraction(5, 0, 0)).toBe(0);
    expect(progressFraction(5, 10, 10)).toBe(0);
    expect(Number.isNaN(progressFraction(5, 0, 0))).toBe(false);
  });
});

// ===========================================================================
// The ring.
// ===========================================================================
describe('ring geometry', () => {
  it('keeps the numbers the artboard draws', () => {
    expect(RING_VIEWBOX).toBe(48);
    expect(RING_RADIUS).toBe(20);
    expect(RING_STROKE).toBe(5);
    expect(RING_SIZE).toBe(56);
  });

  it('the stroke fits inside the viewBox', () => {
    // r + half the stroke must clear the box, or the arc is clipped on all
    // four sides — which reads as a rendering bug, not a design choice.
    expect(RING_RADIUS + RING_STROKE / 2).toBeLessThanOrEqual(RING_VIEWBOX / 2);
  });

  it('dashes a full circle at 1 and nothing at 0', () => {
    const c = ringCircumference();
    expect(ringDashArray(1)).toEqual([c, c]);
    expect(ringDashArray(0)).toEqual([0, c]);
    expect(ringDashArray(0.5)[0]).toBeCloseTo(c / 2);
  });

  it('clamps a fraction outside 0..1', () => {
    const c = ringCircumference();
    expect(ringDashArray(1.4)).toEqual([c, c]);
    expect(ringDashArray(-1)).toEqual([0, c]);
    expect(ringDashArray(Number.NaN)).toEqual([0, c]);
  });
});

describe('bar and pip geometry', () => {
  it('is the artboards, not the gallery', () => {
    // `mobile-class-detail.tsx:177` and `mobile-profile.tsx:203` are both
    // `h-2`. The gallery's `Occupancy` is `h-1` and predates the repaint.
    expect(PROGRESS_BAR_HEIGHT).toBe(8);
    // `h-1.5 w-4`, `gap-1`.
    expect(PIP_WIDTH).toBe(16);
    expect(PIP_HEIGHT).toBe(6);
    expect(PIP_GAP).toBe(4);
  });
});

// ===========================================================================
// The sheet.
// ===========================================================================
describe('sheetBottomPad', () => {
  it('reproduces the artboards pb-8 on a device with no inset', () => {
    expect(sheetBottomPad(0)).toBe(32);
  });

  it('does not go below the artboards value for a small Android inset', () => {
    expect(sheetBottomPad(16)).toBe(32);
    expect(sheetBottomPad(8)).toBe(32);
  });

  it('clears an iPhone home indicator', () => {
    expect(sheetBottomPad(34)).toBe(50);
    expect(sheetBottomPad(34)).toBeGreaterThan(34);
  });

  it('is never less than the floor plus the gap', () => {
    for (const inset of [-10, 0, 1, 16, 20, 34, 48, Number.NaN]) {
      expect(sheetBottomPad(inset)).toBeGreaterThanOrEqual(SHEET_BOTTOM_PAD_MIN + 16);
    }
  });

  it('always leaves clear space above the inset itself', () => {
    for (const inset of [0, 16, 20, 34, 48]) {
      expect(sheetBottomPad(inset) - inset).toBeGreaterThanOrEqual(16);
    }
  });
});

describe('sheetBodyMaxHeight', () => {
  const windowHeight = 844; // iPhone 14/15 logical height.

  it('caps the body at the ratio, less the chrome', () => {
    expect(sheetBodyMaxHeight({ windowHeight, chromeHeight: 200 })).toBe(
      Math.round(844 * SHEET_MAX_HEIGHT_RATIO) - 200,
    );
  });

  it('shrinks as the footer grows, so the footer never leaves the screen', () => {
    const withoutFooter = sheetBodyMaxHeight({ windowHeight, chromeHeight: 140 });
    const withFooter = sheetBodyMaxHeight({ windowHeight, chromeHeight: 140 + 52 });
    expect(withoutFooter - withFooter).toBe(52);
  });

  it('plus its chrome never exceeds the ratio of the window', () => {
    for (const chrome of [0, 80, 200, 400]) {
      const body = sheetBodyMaxHeight({ windowHeight, chromeHeight: chrome });
      expect(body + chrome).toBeLessThanOrEqual(Math.round(windowHeight * SHEET_MAX_HEIGHT_RATIO));
    }
  });

  it('returns 0 — read as "unconstrained" — when the chrome already fills the cap', () => {
    expect(sheetBodyMaxHeight({ windowHeight, chromeHeight: 5000 })).toBe(0);
    expect(sheetBodyMaxHeight({ windowHeight: 0, chromeHeight: 100 })).toBe(0);
    expect(sheetBodyMaxHeight({ windowHeight: Number.NaN, chromeHeight: 100 })).toBe(0);
  });

  it('honours a caller ratio, clamped to something renderable', () => {
    expect(sheetBodyMaxHeight({ windowHeight: 1000, chromeHeight: 0, maxHeightRatio: 0.5 })).toBe(
      500,
    );
    expect(sheetBodyMaxHeight({ windowHeight: 1000, chromeHeight: 0, maxHeightRatio: 4 })).toBe(
      1000,
    );
    expect(sheetBodyMaxHeight({ windowHeight: 1000, chromeHeight: 0, maxHeightRatio: -1 })).toBe(
      100,
    );
  });

  it('ignores a negative or non-finite chrome measurement', () => {
    const full = sheetBodyMaxHeight({ windowHeight, chromeHeight: 0 });
    expect(sheetBodyMaxHeight({ windowHeight, chromeHeight: -50 })).toBe(full);
    expect(sheetBodyMaxHeight({ windowHeight, chromeHeight: Number.NaN })).toBe(full);
  });
});

describe('sheet constants', () => {
  it('rounds the top corners at the ladder page step, not at a literal', () => {
    // `rounded-t-[32px]` on all five sheets IS `radii.page`.
    expect(SHEET_RADIUS).toBe(radii.page);
  });

  it('leaves and arrives at the same speed', () => {
    expect(SHEET_ENTER_MS).toBe(220);
    expect(SHEET_EXIT_MS).toBe(SHEET_ENTER_MS);
  });
});

// ===========================================================================
// The toast.
// ===========================================================================
describe('toastBottomOffset', () => {
  it('sits above the space the tab capsule already reserves', () => {
    // `tabBarInset(0)` is 128 — the artboards own `pb-32`.
    expect(toastBottomOffset(128)).toBe(128 + TOAST_GAP);
    expect(toastBottomOffset(128)).toBeGreaterThan(128);
  });

  it('degrades to the gap alone rather than to NaN', () => {
    expect(toastBottomOffset(0)).toBe(TOAST_GAP);
    expect(toastBottomOffset(Number.NaN)).toBe(TOAST_GAP);
    expect(toastBottomOffset(-40)).toBe(TOAST_GAP);
  });

  it('keeps the salvaged provider timings', () => {
    expect(TOAST_AUTO_HIDE_MS).toBe(3000);
  });
});

// ===========================================================================
// The weight override.
// ===========================================================================
describe('weightedType', () => {
  it('keeps the role size, leading and tracking and moves only the weight', () => {
    const base = typeRoles.bodySmall;
    const re = weightedType('bodySmall', '600');
    expect(re.fontSize).toBe(base.fontSize);
    expect(re.lineHeight).toBe(base.lineHeight);
    expect(re.letterSpacing).toBe(base.letterSpacing);
    expect(re.fontWeight).toBe('600');
  });

  // THE ANDROID RULE, asserted rather than commented. A bundled family is
  // selected BY NAME and must not also carry a `fontWeight`; a system-sans
  // weight is the exact opposite.
  it('never sets fontFamily and fontWeight together', () => {
    for (const weight of ['400', '500', '600', '700', '800'] as const) {
      const style = weightedType('bodySmall', weight);
      expect(style.fontFamily === undefined || style.fontWeight === undefined).toBe(true);
    }
  });

  it('names the bundled face for 700 and 800, and only for those', () => {
    expect(weightedType('bodySmall', '700').fontFamily).toBeDefined();
    expect(weightedType('bodySmall', '800').fontFamily).toBeDefined();
    expect(weightedType('bodySmall', '600').fontFamily).toBeUndefined();
    expect(weightedType('bodySmall', '400').fontFamily).toBeUndefined();
  });

  it('carries an eyebrow role uppercase transform through', () => {
    expect(weightedType('label', '700').textTransform).toBe('uppercase');
    expect(weightedType('bodySmall', '700').textTransform).toBeUndefined();
  });

  it('produces the four pairings the feedback layer needs', () => {
    // Alert title 13/600, confirm recap line 13/500, toast label 13/700,
    // alert body 12/400 — none of which the scale itself carries.
    expect(weightedType('bodySmall', '600').fontSize).toBe(13);
    expect(weightedType('bodySmall', '500').fontSize).toBe(13);
    expect(weightedType('bodySmall', '700').fontSize).toBe(13);
    expect(weightedType('caption', '400').fontSize).toBe(12);
  });
});
