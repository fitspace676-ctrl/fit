import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import { clampRadiusTo } from '../internal/clamp-radius';
import type { ColorRole } from '../tokens/semantic';
import type { SurfaceRadius } from '../tokens/radii';
import { useThemeColors } from '../tokens/theme';

export interface SkeletonProps {
  /** Default `'100%'`. */
  width?: DimensionValue;
  /** Default 16 — one line of body text. */
  height?: number;
  /** Default `'inner'` (10). Clamped to half the height, so a 12pt line of
   *  placeholder text cannot silently become a capsule. */
  radius?: SurfaceRadius;
  /** Default `'skeleton'` — `ink-800` in dark, `ink-200` in light. */
  color?: ColorRole;
  /**
   * Turn the pulse off. For a screen that shows a dozen skeletons at once,
   * twelve independent pulses read as noise; the convention is to animate the
   * container and leave the children static.
   */
  animated?: boolean;
  /**
   * Announce this placeholder. Omit (the default) and it is silent.
   *
   * The right place for the announcement is almost always ONE
   * `accessibilityLabel` on the section, not one per bar — a loading card made
   * of six skeletons should say "loading" once.
   */
  accessibilityLabel?: string;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * A loading placeholder.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS ONE MAY USE OPACITY WHEN NOTHING ELSE IN THE PACKAGE MAY.
 *
 * `internal/use-pressed.ts` bans opacity for PRESS feedback, because a lime
 * fill faded over warm charcoal goes olive and the one colour the product owns
 * goes off-brand under the finger. None of that applies here: the skeleton's
 * fill is `ink-800`, a neutral one step from its own ground, so fading it
 * moves along the ramp rather than off it — and unlike a press, nobody is
 * looking at a specific colour while it happens.
 *
 * The alternative — animating `backgroundColor` between two palette stops —
 * cannot use the native driver, so a screen showing a dozen skeletons while it
 * waits on eight endpoints would be running a dozen JS-thread animations at
 * exactly the moment the JS thread is busiest. That is a stutter you can see.
 * ---------------------------------------------------------------------------
 */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'inner',
  color = 'skeleton',
  animated = true,
  accessibilityLabel,
  testID,
  style,
  className,
}: SkeletonProps) {
  const colors = useThemeColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(1);
    };
  }, [animated, pulse]);

  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityLabel, accessibilityState: { busy: true } } as const)
    : DECORATIVE;

  return (
    <Animated.View
      testID={testID}
      {...a11y}
      style={[
        {
          width,
          height,
          borderRadius: clampRadiusTo(radius, height),
          backgroundColor: colors[color],
          opacity: animated ? pulse : 1,
        },
        style,
      ]}
      className={className}
    />
  );
}
