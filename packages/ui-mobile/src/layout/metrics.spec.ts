// The pure half of WP-6, on Vitest.
//
// Nothing in this file — or in the module it tests — imports `react-native`.
// That is §5's one hard boundary, and it is what lets the three traps in this
// work package be asserted in milliseconds on every save rather than in a
// simulator that is 390pt wide and has no home indicator, which is to say: on
// the exact device none of the three traps is visible on.

import { describe, expect, it } from 'vitest';

import {
  CAPSULE_HEIGHT,
  CAPSULE_PADDING,
  CAPSULE_PADDING_COMPACT,
  COMPACT_WIDTH,
  HEADER_TOP_MIN,
  SCREEN_GUTTER,
  TAB_BAR_CLEARANCE,
  TAB_BAR_EDGE_OFFSET,
  TAB_COUNT,
  TAB_GLYPH_ACTIVE,
  TAB_GLYPH_IDLE,
  TAB_ITEM_SIZE,
  TAB_ITEM_SIZE_COMPACT,
  capsuleMetricsFor,
  capsuleWidthFor,
  gridRows,
  headerTopFor,
  railScrollOffset,
  tabBarBottomOffset,
  tabBarInset,
} from './metrics';
import { layout } from '../tokens/spacing';
import { MIN_TOUCH_TARGET } from '../internal/hit-slop';

// ===========================================================================
// TRAP 2 — the safe area, and the one number the whole frame is built on.
// ===========================================================================

describe('tabBarInset', () => {
  // THE HEADLINE ASSERTION. Every artboard ends in `pb-32` = 128, and 128 is
  // 24 + 72 + 32. If this number ever changes without the capsule changing,
  // the last row of every scrolling screen either floats or hides.
  it('is exactly 128 at inset 0 — the artboards’ own pb-32', () => {
    expect(tabBarInset(0)).toBe(128);
  });

  it('is the token layer’s `layout.tabBarInset`, not a second opinion', () => {
    // WP-1 already wrote 128 down, with a comment naming WP-6 as the module
    // that has to agree with it. Two constants that must be equal and are not
    // mechanically checked are two constants that will diverge.
    expect(tabBarInset(0)).toBe(layout.tabBarInset);
  });

  it('decomposes into offset + capsule + clearance', () => {
    expect(TAB_BAR_EDGE_OFFSET + CAPSULE_HEIGHT + TAB_BAR_CLEARANCE).toBe(128);
    expect(CAPSULE_HEIGHT).toBe(TAB_ITEM_SIZE + 2 * CAPSULE_PADDING);
  });

  it('grows with a home indicator', () => {
    // iPhone 14/15/16 report 34. 34 + 4 + 72 + 32 = 142.
    expect(tabBarInset(34)).toBe(142);
    // An iPad's 20pt indicator.
    expect(tabBarInset(20)).toBe(128 - 24 + 24);
    expect(tabBarInset(20)).toBe(148 - 20);
  });

  it('never shrinks below the no-indicator reserve', () => {
    for (let inset = 0; inset <= 60; inset += 1) {
      expect(tabBarInset(inset)).toBeGreaterThanOrEqual(128);
    }
  });

  // DELIBERATELY WIDTH-INDEPENDENT — see the header of `tabBarInset`. A
  // width-aware reserve would return 116 on a 320pt device and make the
  // headline assertion above false on exactly the phone the compact branch
  // exists for.
  it('takes no width argument, so the reserve cannot disagree with itself', () => {
    expect(tabBarInset.length).toBe(1);
  });
});

describe('tabBarBottomOffset', () => {
  // THE TRAP. `bottom-6` is 24 from the edge of a browser viewport, where
  // nothing is drawn. On a home-indicator phone it lands the capsule on the
  // indicator, and the system's swipe-up wins every gesture that starts there.
  it('is the artboards’ 24 when there is no indicator', () => {
    expect(tabBarBottomOffset(0)).toBe(24);
    expect(tabBarBottomOffset(-1)).toBe(24);
    expect(tabBarBottomOffset(Number.NaN)).toBe(24);
  });

  it('clears the indicator by 4 when there is one', () => {
    expect(tabBarBottomOffset(34)).toBe(38);
    expect(tabBarBottomOffset(21)).toBe(25);
  });

  // The floor the brief's bare ternary does not have. Android gesture nav
  // reports 16 on several skins; 16 + 4 = 20 would draw the capsule tighter to
  // the edge than any artboard does.
  it('never sits closer to the edge than the artboards’ 24', () => {
    expect(tabBarBottomOffset(16)).toBe(24);
    for (let inset = 0; inset <= 60; inset += 1) {
      expect(tabBarBottomOffset(inset)).toBeGreaterThanOrEqual(TAB_BAR_EDGE_OFFSET);
    }
  });

  it('always clears the indicator itself', () => {
    for (let inset = 1; inset <= 60; inset += 1) {
      expect(tabBarBottomOffset(inset)).toBeGreaterThan(inset);
    }
  });
});

// ===========================================================================
// TRAP 1 — the capsule overflows the smallest supported device.
// ===========================================================================

describe('capsuleMetricsFor', () => {
  /** Does a capsule of this geometry fit inside the gutters at this width? */
  function fits(width: number, count = 5): boolean {
    const m = capsuleMetricsFor(width, count);
    return capsuleWidthFor(count, m.itemSize, m.padding) <= width - 2 * SCREEN_GUTTER;
  }

  it('the artboard geometry genuinely overflows a 320pt device', () => {
    // The premise, at the FIVE items the artboards draw. If this ever stops
    // being true the compact branch is dead code and should be deleted rather
    // than left as folklore.
    expect(capsuleWidthFor(5, TAB_ITEM_SIZE, CAPSULE_PADDING)).toBe(296);
    expect(320 - 2 * SCREEN_GUTTER).toBe(280);
    expect(296).toBeGreaterThan(280);
  });

  it('the four tabs the app ships fit a 320pt device in either geometry', () => {
    // The QR centre action was removed on 2026-08-31, so the capsule is four
    // items. Neither geometry overflows the narrowest supported device, and
    // the compact one — which the width threshold still selects at 320 — has
    // 64pt to spare across three inter-item gaps.
    expect(capsuleWidthFor(TAB_COUNT, TAB_ITEM_SIZE, CAPSULE_PADDING)).toBe(240);
    expect(240).toBeLessThanOrEqual(280);

    const m = capsuleMetricsFor(320, TAB_COUNT);
    expect(m.compact).toBe(true);
    expect(capsuleWidthFor(TAB_COUNT, m.itemSize, m.padding)).toBe(216);
    expect(280 - 216).toBe(64);
    expect(m.itemSize).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(fits(320, TAB_COUNT)).toBe(true);
    // …and at the artboard width the row keeps the artboards' own geometry.
    expect(capsuleMetricsFor(390, TAB_COUNT).itemSize).toBe(TAB_ITEM_SIZE);
  });

  it('padding alone would NOT have been enough', () => {
    // WP-6's brief offers "padding to 4, OR items to 52". Only the second
    // works, which is why this implementation takes both.
    expect(capsuleWidthFor(5, TAB_ITEM_SIZE, CAPSULE_PADDING_COMPACT)).toBe(288);
    expect(288).toBeGreaterThan(280);
  });

  it('fits an iPhone SE at 320pt, with room for real gaps', () => {
    const m = capsuleMetricsFor(320);
    expect(m.compact).toBe(true);
    expect(m.itemSize).toBe(TAB_ITEM_SIZE_COMPACT);
    expect(m.padding).toBe(CAPSULE_PADDING_COMPACT);
    expect(capsuleWidthFor(5, m.itemSize, m.padding)).toBe(268);
    // 12pt of slack across four inter-item gaps — 3pt each, the smallest that
    // still reads as five separate targets.
    expect(280 - 268).toBe(12);
    expect(fits(320)).toBe(true);
  });

  it('keeps the artboard geometry at 390pt', () => {
    const m = capsuleMetricsFor(390);
    expect(m.compact).toBe(false);
    expect(m.itemSize).toBe(56);
    expect(m.padding).toBe(8);
    expect(m.height).toBe(72);
    expect(m.glyphActive).toBe(TAB_GLYPH_ACTIVE);
    expect(m.glyphIdle).toBe(TAB_GLYPH_IDLE);
  });

  it('branches at 340', () => {
    expect(capsuleMetricsFor(COMPACT_WIDTH - 1).compact).toBe(true);
    expect(capsuleMetricsFor(COMPACT_WIDTH).compact).toBe(false);
  });

  // THE PROPERTY, over every width a phone or a foldable cover screen can
  // report. A table of three widths passes forever; this fails the day
  // somebody adds a sixth tab.
  it('∀ width in 320..1024, ∀ count in 3..5: the capsule fits its gutters', () => {
    // 320 is the narrowest device the product supports (iPhone SE, and the
    // small-Android floor). Four tabs is the nav; five is the count the
    // artboards drew, kept in range so the branch stays honest.
    for (let count = 3; count <= 5; count += 1) {
      for (let width = 320; width <= 1024; width += 1) {
        expect(fits(width, count)).toBe(true);
      }
    }
  });

  // The honest limit, written down rather than discovered later. If Q6 is ever
  // reopened and Services becomes a sixth tab, THIS is the test that has to be
  // dealt with — a sixth 52pt item does not fit a 320pt screen at any padding,
  // and the answer will be labels-off icons at 44 or a four-tab bar, not a
  // tweak to `capsuleMetricsFor`.
  it('six tabs do not fit a 320pt device at all — a real ceiling, not a bug', () => {
    expect(capsuleWidthFor(6, TAB_ITEM_SIZE_COMPACT, CAPSULE_PADDING_COMPACT)).toBe(320);
    expect(320).toBeGreaterThan(320 - 2 * SCREEN_GUTTER);
    expect(fits(320, 6)).toBe(false);
  });

  it('∀ geometry: an item still clears the 44pt touch floor', () => {
    for (let width = 280; width <= 1024; width += 1) {
      expect(capsuleMetricsFor(width).itemSize).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });

  it('keeps the active/idle glyph step in both geometries', () => {
    for (const width of [320, 390, 430]) {
      const m = capsuleMetricsFor(width);
      expect(m.glyphActive - m.glyphIdle).toBe(2);
      expect(m.glyphActive).toBeLessThan(m.itemSize);
    }
  });

  it('goes compact when a sixth tab would not fit at full size', () => {
    // 6 × 56 + 16 = 352, against 390 − 40 = 350. Two points short, on the
    // canvas the design was drawn at.
    expect(capsuleWidthFor(6, TAB_ITEM_SIZE, CAPSULE_PADDING)).toBe(352);
    expect(capsuleMetricsFor(390, 6).compact).toBe(true);
  });
});

// ===========================================================================
// The header.
// ===========================================================================

describe('headerTopFor', () => {
  it('is the artboards’ 56 on a device with no notch', () => {
    // A pre-notch iPhone reports 20. 20 + 12 = 32, which is under the floor.
    expect(headerTopFor(20)).toBe(HEADER_TOP_MIN);
    expect(headerTopFor(0)).toBe(56);
  });

  it('clears a Dynamic Island rather than drawing under it', () => {
    expect(headerTopFor(59)).toBe(71);
    expect(headerTopFor(47)).toBe(59);
  });

  it('∀ inset: the header starts below the inset', () => {
    for (let inset = 0; inset <= 80; inset += 1) {
      expect(headerTopFor(inset)).toBeGreaterThanOrEqual(inset);
      expect(headerTopFor(inset)).toBeGreaterThanOrEqual(HEADER_TOP_MIN);
    }
  });
});

// ===========================================================================
// Rails and grids.
// ===========================================================================

describe('railScrollOffset', () => {
  const WEEK = { itemWidth: 50, gap: 6, contentPadding: SCREEN_GUTTER };

  it('does not scroll for the first item', () => {
    expect(railScrollOffset({ ...WEEK, index: 0, viewportWidth: 320 })).toBe(0);
  });

  it('clamps rather than bouncing to a negative offset', () => {
    // Index 1 on a wide viewport centres to a negative x. iOS bounces there
    // and settles back, which reads as a glitch on first paint.
    expect(railScrollOffset({ ...WEEK, index: 1, viewportWidth: 430 })).toBe(0);
  });

  it('centres a late item on a narrow viewport', () => {
    // The case the week strip exists for: 7 × 50 + 6 × 6 = 386 of content in a
    // 320pt viewport. Sunday is 66pt off-screen without this.
    const x = railScrollOffset({ ...WEEK, index: 6, viewportWidth: 320 });
    expect(x).toBe(20 + 6 * 56 - (320 - 50) / 2);
    expect(x).toBe(221);
  });

  it('∀ index: the offset is a non-negative integer', () => {
    for (let index = 0; index < 30; index += 1) {
      const x = railScrollOffset({ ...WEEK, index, viewportWidth: 375 });
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('gridRows', () => {
  it('chunks into rows of the requested width', () => {
    expect(gridRows([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('leaves the last row SHORT rather than padding it', () => {
    // `grid.tsx` pads with spacers. If this padded instead, a caller could not
    // tell a real item from a hole.
    expect(gridRows([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('survives a nonsense column count', () => {
    expect(gridRows([1, 2], 0)).toEqual([[1], [2]]);
    expect(gridRows([1, 2], 2.7)).toEqual([[1, 2]]);
    expect(gridRows([], 3)).toEqual([]);
  });

  it('∀ input: every item appears exactly once, in order', () => {
    const items = Array.from({ length: 17 }, (_, i) => i);
    for (let columns = 1; columns <= 5; columns += 1) {
      expect(gridRows(items, columns).flat()).toEqual(items);
    }
  });
});
