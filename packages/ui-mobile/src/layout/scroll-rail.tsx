import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { spacing, type SpacingStep } from '../tokens/spacing';

import { SCREEN_GUTTER, railScrollOffset } from './metrics';

// ===========================================================================
// A HORIZONTAL RAIL.
//
// Four in the artboards: the home schedule's category capsule
// (`mobile-home-v2.tsx:316`), the classes week strip and category capsule
// (`mobile-classes.tsx:248,277`) and the profile's achievements
// (`mobile-profile.tsx:281`). All four are `flex gap-* overflow-x-auto px-5
// pb-1`.
//
// ---------------------------------------------------------------------------
// `ScrollView`, NOT `FlatList`.
//
// The longest rail in the design is seven items. `FlatList` buys windowing —
// at the cost of a `renderItem` indirection, a `keyExtractor`, a measurement
// pass, and a blank cell whenever the user flicks faster than the list can
// render. For seven views that are already mounted the moment the screen is,
// virtualisation costs strictly more than it saves, and it makes the call site
// a data-shaped API instead of `{children}`.
// ---------------------------------------------------------------------------
// ===========================================================================

export interface ScrollRailProps {
  children: ReactNode;

  /** Space between items, as a spacing step. Default `1.5` (6) — `gap-1.5`. */
  gap?: SpacingStep;

  /**
   * The rail's edge padding. Default 20, the screen gutter.
   *
   * ==========================================================================
   * THIS IS `contentContainerStyle.paddingHorizontal`, AND THAT IS THE WHOLE
   * POINT OF THE COMPONENT.
   *
   * A rail's edge padding belongs to its CONTENT, not to its parent. Put the
   * `px-5` on the container instead — which is what a screen naturally does,
   * because every other section on the page has it — and the scroll viewport
   * itself narrows by 40pt: the first item then starts at the padding's inner
   * edge and the last one is CLIPPED there too, so scrolling to the end shows
   * the last chip cut off 20pt short of the screen edge instead of bleeding
   * to it.
   *
   * That single difference is the visual tell of a hand-rolled rail, and it is
   * why `Screen` has a `gutter` prop that a rail's section turns off.
   * ==========================================================================
   */
  edgePadding?: number;

  /**
   * Scroll so this item is visible, once, on mount and whenever it changes.
   *
   * Requires {@link itemWidth}, because a `ScrollView` cannot measure a child
   * it has not been told about — the trade for not being a `FlatList`. The
   * week strip is the case that needs it: seven 50pt cells and six 6pt gaps is
   * 386pt of content, which fits a 390pt screen and overflows a 320pt one, so
   * on a small device "today" can start off-screen.
   */
  scrollToIndex?: number;

  /** The fixed width of one item. Required with {@link scrollToIndex}. */
  itemWidth?: number;

  /** `pb-1` on the artboards — room for a shadow or a focus ring to breathe. */
  padBottom?: SpacingStep;

  /** Forwarded to the root node. */
  testID?: string;

  /** Merged last onto the scroll view. */
  style?: StyleProp<ViewStyle>;

  /** Merged last onto the content container. */
  contentContainerStyle?: StyleProp<ViewStyle>;

  /** Merged last onto the scroll view. */
  className?: string;
}

/** A horizontally scrolling row of items that bleeds to both screen edges. */
export function ScrollRail({
  children,
  gap = 1.5,
  edgePadding = SCREEN_GUTTER,
  scrollToIndex,
  itemWidth,
  padBottom = 1,
  testID,
  style,
  contentContainerStyle,
  className,
}: ScrollRailProps) {
  const ref = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportWidth(event.nativeEvent.layout.width);
  }, []);

  useEffect(() => {
    if (scrollToIndex === undefined || itemWidth === undefined) return;
    // Wait for the first layout: scrolling against a zero-width viewport
    // centres on nothing and lands at 0, which looks like the prop being
    // ignored.
    if (viewportWidth <= 0) return;

    ref.current?.scrollTo({
      x: railScrollOffset({
        index: scrollToIndex,
        itemWidth,
        gap: spacing[gap],
        viewportWidth,
        contentPadding: edgePadding,
      }),
      // Not animated. This runs on mount, and a rail that animates itself into
      // position as the screen appears reads as the layout settling rather
      // than as a deliberate starting point.
      animated: false,
    });
  }, [scrollToIndex, itemWidth, viewportWidth, gap, edgePadding]);

  return (
    <ScrollView
      ref={ref}
      testID={testID}
      horizontal
      onLayout={onLayout}
      showsHorizontalScrollIndicator={false}
      // The same first-tap-after-typing trap `Screen` documents at length. It
      // applies to every scroll container, and a rail of filter chips under a
      // search field is exactly where it bites.
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[gap],
          // See `edgePadding` — on the CONTENT container, never the parent.
          paddingHorizontal: edgePadding,
          paddingBottom: spacing[padBottom],
        },
        contentContainerStyle,
      ]}
      style={style}
      className={className}
    >
      {children}
    </ScrollView>
  );
}
