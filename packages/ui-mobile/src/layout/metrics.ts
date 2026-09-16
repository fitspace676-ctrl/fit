// WP-6's arithmetic — the pure half, on Vitest.
//
// ===========================================================================
// WHY THIS FILE EXISTS AT ALL.
//
// Every number in this file is a decision that is invisible on the 390pt
// canvas the six artboards were drawn at, and each one is wrong in a way that
// only shows up on hardware:
//
//   · the floating capsule OVERFLOWS a 320pt device (5 × 56 + 2 × 8 = 296
//     against 320 − 40 = 280),
//   · `bottom-6` puts the capsule ON the home indicator of every notched
//     phone,
//   · `pb-32` is 128, and 128 is not a magic number — it is 24 + 72 + 32, and
//     if the capsule's geometry changes the reserve has to change with it.
//
// None of that needs a renderer to be checked, and §5 of the rebuild plan
// draws the boundary exactly there: Vitest for anything that does not import
// `react-native`, jest-expo only for tests that render. So the arithmetic
// lives here, with no React and no React Native in its import graph, and
// `metrics.spec.ts` asserts it in milliseconds. The components in
// `../navigation/floating-tab-bar.tsx` and `./screen.tsx` are then thin: they
// read a safe-area inset and a window width and ask this module what to do.
// ===========================================================================

import { layout, spacing } from '../tokens/spacing';

// ---------------------------------------------------------------------------
// The frame.
// ---------------------------------------------------------------------------

/**
 * The screen's horizontal gutter — `px-5` on all six artboards.
 *
 * Re-exported from the token layer rather than restated, so a change to the
 * gutter moves the capsule's own inset with it.
 */
export const SCREEN_GUTTER = layout.screenGutter;

/**
 * The artboards' header padding: `pt-14` = 56, uniformly, on all six.
 *
 * That 56 is a LITERAL top pad on a browser canvas with no status bar. On a
 * phone it has to become a floor under the safe-area inset — see
 * {@link headerTopFor}.
 */
export const HEADER_TOP_MIN = spacing[14];

/** Breathing room between the status bar and the first line of the header. */
export const HEADER_TOP_GAP = spacing[3];

/**
 * The header's top padding for a given safe-area inset.
 *
 * `insets.top + 12`, floored at 56. Both halves matter:
 *
 *   · the FLOOR is what keeps a non-notched phone (inset 20) looking like the
 *     artboard, which reserved 56 whether or not anything was up there;
 *   · the INSET is what keeps a Dynamic Island phone (inset 59) from drawing
 *     the screen title underneath the island — 56 is less than the inset, so
 *     a hard 56 would collide.
 */
export function headerTopFor(insetTop: number): number {
  if (!Number.isFinite(insetTop) || insetTop <= 0) return HEADER_TOP_MIN;
  return Math.max(HEADER_TOP_MIN, Math.round(insetTop) + HEADER_TOP_GAP);
}

// ---------------------------------------------------------------------------
// The floating capsule.
// ---------------------------------------------------------------------------

/** A tab item at full size — the artboards' `h-14 w-14`. */
export const TAB_ITEM_SIZE = spacing[14];

/** A tab item on a small device. See {@link capsuleMetricsFor}. */
export const TAB_ITEM_SIZE_COMPACT = 52;

/** The capsule's own padding — the artboards' `p-2`. */
export const CAPSULE_PADDING = spacing[2];

/** The capsule's padding on a small device. See {@link capsuleMetricsFor}. */
export const CAPSULE_PADDING_COMPACT = spacing[1];

/** 56 + 2 × 8. The number `pb-32` is built out of. */
export const CAPSULE_HEIGHT = TAB_ITEM_SIZE + 2 * CAPSULE_PADDING;

/** 52 + 2 × 4. */
export const CAPSULE_HEIGHT_COMPACT = TAB_ITEM_SIZE_COMPACT + 2 * CAPSULE_PADDING_COMPACT;

/** The active tab's glyph — `h-[23px]` on the artboards. */
export const TAB_GLYPH_ACTIVE = 23;

/** An idle tab's glyph — `h-[21px]`. The 2px step is the whole "active" cue
 *  after the lime plate, and it is worth keeping: on a lime disc the glyph is
 *  ink, and ink-on-lime already reads heavier than ink-400-on-charcoal. */
export const TAB_GLYPH_IDLE = 21;

/**
 * The default tab count — Home · Classes · Shop · Profile.
 *
 * D8 originally seated a fifth item, the raised QR action, in the middle of
 * the capsule; it was removed with the QR screen on 2026-08-31 (Q1 — no
 * scanner integration, no member-scoped check-in endpoint). Four items is what
 * the app ships.
 *
 * Only used as the default argument to {@link capsuleMetricsFor}; the bar
 * always passes its real count, so this constant sizes nothing on its own.
 */
export const TAB_COUNT = 4;

/**
 * Below this window width the capsule shrinks. See {@link capsuleMetricsFor}
 * for the arithmetic; 340 is 4pt of margin over the 336 where a FIVE-item row
 * actually stops fitting, because a device reporting 336.0 should not be one
 * rounding error away from a clipped tab.
 *
 * At the four items the app ships today the threshold is no longer load-
 * bearing — 4 × 56 + 16 = 240 fits the 280 a 320pt device leaves — but it is
 * kept rather than raised to a count-dependent formula: shrinking the chrome
 * on a small phone is right either way, and the fit test below is what
 * actually guarantees correctness for any count.
 */
export const COMPACT_WIDTH = 340;

/** The capsule's distance from the screen edge on a device with no home
 *  indicator — the artboards' `bottom-6`. */
export const TAB_BAR_EDGE_OFFSET = layout.tabBarBottom;

/**
 * The gap left above the home indicator on a device that has one.
 *
 * Four points, not zero: sitting the capsule flush on the indicator makes the
 * two read as one object and puts a 56pt tab target underneath the system's
 * own swipe-up gesture area, which the system wins.
 */
export const HOME_INDICATOR_GAP = spacing[1];

/**
 * The gap between the last row of content and the top of the capsule.
 *
 * 128 − 24 − 72. It is not authored anywhere in the artboards; it is what is
 * left over once `pb-32` has paid for the offset and the capsule, and naming
 * it is what makes {@link tabBarInset} legible rather than a magic 128.
 */
export const TAB_BAR_CLEARANCE = spacing[8];

/**
 * How far the capsule sits above the bottom of the window.
 *
 * THE TRAP. The artboards say `bottom-6` — 24 from the edge of a browser
 * viewport, where nothing is drawn. On a home-indicator phone the indicator
 * occupies roughly the bottom 34pt, so a 24pt offset puts the capsule ON it:
 * the tab row and the system's grab handle overlap, and the handle wins the
 * gesture.
 *
 * So the offset is the inset plus a small gap where there IS an inset, and the
 * artboards' own 24 where there is not.
 *
 * THE FLOOR IS NOT IN WP-6'S BRIEF, AND IS DELIBERATE. The brief states the
 * rule as `insets.bottom > 0 ? insets.bottom + 4 : 24`, which is written below
 * verbatim — but taken alone it is wrong in one direction nobody checks:
 * Android's gesture navigation reports a bottom inset of 16 on several OEM
 * skins, and 16 + 4 = 20 pulls the capsule 4pt CLOSER to the edge than any
 * artboard draws it, while still technically clearing the inset. Flooring at
 * the artboards' own 24 changes nothing for iOS (34 → 38) or for a device with
 * no indicator (→ 24), and stops a small inset from making the chrome tighter
 * than the design it came from.
 */
/**
 * The gap between a pinned footer and the floating capsule beneath it.
 *
 * 12, so a footer clears the capsule at `24 + 72 + 12 = 108` on a bezel phone —
 * the `bottom-[108px]` the shop artboard draws.
 */
export const FOOTER_GAP = spacing[3];

export function tabBarBottomOffset(insetBottom: number): number {
  const raw =
    Number.isFinite(insetBottom) && insetBottom > 0
      ? Math.round(insetBottom) + HOME_INDICATOR_GAP
      : TAB_BAR_EDGE_OFFSET;
  return Math.max(TAB_BAR_EDGE_OFFSET, raw);
}

/** The capsule's geometry at a given window width. */
export interface CapsuleMetrics {
  /** Edge length of one round tab item. */
  itemSize: number;
  /** The capsule's own padding, all four sides. */
  padding: number;
  /** The capsule's outer height — `itemSize + 2 × padding`. */
  height: number;
  /** The active tab's glyph size. */
  glyphActive: number;
  /** An idle tab's glyph size. */
  glyphIdle: number;
  /** True when the small-device geometry is in force. */
  compact: boolean;
}

/** The width one row of `count` items at `itemSize` needs inside `padding`. */
export function capsuleWidthFor(count: number, itemSize: number, padding: number): number {
  return count * itemSize + 2 * padding;
}

/**
 * The capsule's geometry for a window width.
 *
 * ===========================================================================
 * THE FIRST OF THE THREE TRAPS, AND THE ONLY ONE WITH REAL ARITHMETIC.
 *
 * The artboards are a 390pt canvas, and they draw FIVE items (the QR action
 * sat in the middle until 2026-08-31). Five 56pt items inside 8pt of padding
 * is 5 × 56 + 16 = 296, and a 390pt screen minus two 20pt gutters leaves 350 —
 * comfortable, which is why nothing looks wrong in the comp.
 *
 * An iPhone SE (1st/2nd/3rd gen) and every small Android are 320pt wide. 320
 * minus the same two gutters leaves 280. 296 does not fit in 280, and what
 * "does not fit" looks like in React Native is not a scrollbar — it is the
 * fifth tab (Profile) clipped by the capsule's `overflow`, or the row pushed
 * out past the gutter, depending on which flex property gives first.
 *
 * WP-6's brief offers two remedies — "shrink capsule padding to 4, or items to
 * 52". Only one of them is sufficient, which is worth writing down:
 *
 *     items 56, padding 4   →  5 × 56 +  8  =  288   >  280   STILL OVERFLOWS
 *     items 52, padding 8   →  5 × 52 + 16  =  276   ≤  280   fits, by 4pt
 *     items 52, padding 4   →  5 × 52 +  8  =  268   ≤  280   fits, by 12pt
 *
 * So this takes BOTH reductions. 4pt of slack across four inter-item gaps is
 * one point each, which is not a gap — the items would read as a solid bar and
 * the active lime disc would touch its neighbours. 12pt gives 3pt gaps, which
 * is the smallest spacing that still reads as separate targets.
 *
 * The item stays at 52, comfortably over the 44pt floor, so nothing here
 * trades away a touch target to make the row fit.
 *
 * AT THE FOUR ITEMS THE APP SHIPS TODAY, none of this is needed for fit:
 *
 *     items 56, padding 8   →  4 × 56 + 16  =  240   ≤  280   fits by 40pt
 *     items 52, padding 4   →  4 × 52 +  8  =  216   ≤  280   fits by 64pt
 *
 * The compact branch still fires below 340 (the width trigger), which is a
 * deliberate keep rather than dead code: the `full > available` trigger beside
 * it is what stops a fifth or sixth item from ever clipping silently, and the
 * property test in `metrics.spec.ts` runs both over counts 3..5.
 * ===========================================================================
 */
export function capsuleMetricsFor(width: number, itemCount: number = TAB_COUNT): CapsuleMetrics {
  const available = Number.isFinite(width) ? Math.max(0, width - 2 * SCREEN_GUTTER) : 0;
  const full = capsuleWidthFor(itemCount, TAB_ITEM_SIZE, CAPSULE_PADDING);

  // Two independent triggers, and the OR is deliberate. The width threshold is
  // the documented rule; the fit test is what keeps a fifth or sixth tab (or a
  // future 360pt foldable cover screen) from silently clipping at a width
  // nobody thought to threshold.
  const compact = width < COMPACT_WIDTH || full > available;

  const itemSize = compact ? TAB_ITEM_SIZE_COMPACT : TAB_ITEM_SIZE;
  const padding = compact ? CAPSULE_PADDING_COMPACT : CAPSULE_PADDING;

  return {
    itemSize,
    padding,
    height: itemSize + 2 * padding,
    // The glyphs shrink with the plate, keeping the 2pt active/idle step that
    // is the design's own "you are here" cue.
    glyphActive: compact ? TAB_GLYPH_ACTIVE - 2 : TAB_GLYPH_ACTIVE,
    glyphIdle: compact ? TAB_GLYPH_IDLE - 2 : TAB_GLYPH_IDLE,
    compact,
  };
}

/**
 * The bottom padding a scroll view needs so its last row clears the capsule.
 *
 * ===========================================================================
 * THIS MUST RETURN 128 AT INSET 0, AND NOT BY COINCIDENCE.
 *
 *     24  the capsule's offset from the edge   (`bottom-6`)
 *   + 72  the capsule itself                   (56 + 2 × 8)
 *   + 32  clearance between content and chrome
 *   ----
 *    128  which is `pb-32`, on every one of the six artboards.
 *
 * DELIBERATELY NOT WIDTH-AWARE. The compact capsule is 60 tall rather than 72,
 * so a width-aware reserve would return 116 on a 320pt device — and then the
 * one number this whole file exists to guarantee ("128 at inset 0") would be
 * false on exactly the device the compact branch was written for. Reserving
 * 12pt more than the chrome needs is invisible; a reserve that disagrees with
 * itself between two devices is a bug someone spends an afternoon on.
 * ===========================================================================
 */
export function tabBarInset(insetBottom: number): number {
  return tabBarBottomOffset(insetBottom) + CAPSULE_HEIGHT + TAB_BAR_CLEARANCE;
}

// ---------------------------------------------------------------------------
// Rails and grids.
// ---------------------------------------------------------------------------

/** What {@link railScrollOffset} needs to place an item. */
export interface RailScrollParams {
  index: number;
  /** Every item in a rail that supports `scrollToIndex` is a fixed width —
   *  the week strip's `w-[50px]` day cells. */
  itemWidth: number;
  /** The rail's inter-item gap. */
  gap: number;
  /** The rail's own visible width, from `onLayout`. */
  viewportWidth: number;
  /** The rail's `contentContainerStyle.paddingHorizontal`. */
  contentPadding?: number;
}

/**
 * The `scrollTo` x that brings item `index` into view, centred where possible.
 *
 * The week strip is the case: seven 50pt cells with 6pt gaps is 7 × 50 + 6 × 6
 * = 386, which just fits a 390pt screen minus nothing and overflows a 320pt
 * one by 66pt. On the small device "today" is off-screen on first paint unless
 * something scrolls to it, and a member opening the Classes tab to find
 * Monday selected and Thursday invisible will assume the app has lost their
 * day.
 *
 * Centring rather than left-aligning matters because it is what shows the days
 * on BOTH sides of the selected one; a left-aligned scroll to Sunday shows
 * nothing before it and the strip reads as if the week starts on Sunday.
 * Clamped at 0 so an early index does not scroll to a negative offset (iOS
 * happily bounces there and settles back, which reads as a glitch).
 */
export function railScrollOffset({
  index,
  itemWidth,
  gap,
  viewportWidth,
  contentPadding = SCREEN_GUTTER,
}: RailScrollParams): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  const itemStart = contentPadding + index * (itemWidth + gap);
  const centred = itemStart - (viewportWidth - itemWidth) / 2;
  return Math.max(0, Math.round(centred));
}

/**
 * Chunk items into rows of `columns`.
 *
 * WHY A GRID IS ROWS-OF-FLEX AND NOT A WRAPPING FLEX BOX. React Native has no
 * CSS grid, and the obvious substitute — `flexWrap: 'wrap'` with a percentage
 * width per child — cannot express `gap` correctly: `width: '50%'` plus a 12pt
 * gap is 100% + 12, so the second column wraps and every row holds one item.
 * Fixing that needs the container's measured width, which means the grid
 * renders wrong for one frame on every mount.
 *
 * Explicit rows of `flex: 1` children with a `gap` between them needs no
 * measurement, is correct on the first frame, and is what the artboards
 * actually are (`grid grid-cols-2 gap-3`, and home's `flex gap-3` with two
 * `flex-1` counters — the same layout written two ways).
 *
 * Returns rows of the ORIGINAL length; `grid.tsx` pads the last row with
 * spacers, because a lone item in a two-column row must stay half-width rather
 * than stretching to full.
 */
export function gridRows<T>(items: readonly T[], columns: number): T[][] {
  const size = Number.isFinite(columns) && columns >= 1 ? Math.floor(columns) : 1;
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
