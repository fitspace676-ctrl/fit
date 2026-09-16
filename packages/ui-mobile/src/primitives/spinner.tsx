import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { resolveColor } from './icon/icon';
import type { ColorValue } from './icon/types';
import { useThemeColors } from '../tokens/theme';

/** The arc, on the same 24 grid every icon is drawn on. */
const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** A 28% arc — long enough to read as a ring, short enough to read as motion. */
const ARC = CIRCUMFERENCE * 0.28;

export interface SpinnerProps {
  /** Edge length in points. Default 20, matching `Icon`. */
  size?: number;
  /** Default `'accent'` — the lime. */
  color?: ColorValue;
  /** Default 2.5. Thicker than an icon's 1.9: an arc in motion needs the mass. */
  strokeWidth?: number;
  /**
   * REQUIRED. Package rule 1 — "loading" is copy, and a busy indicator that
   * announces nothing leaves a screen-reader user on a silent screen with no
   * way to tell "still working" from "finished, and empty".
   */
  accessibilityLabel: string;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/**
 * An indeterminate busy indicator.
 *
 * Rotation runs on RN's `Animated` with `useNativeDriver: true`, not on
 * Reanimated. A spinner is one interpolated transform with no gesture input,
 * which is precisely the case the native driver was built for — it keeps
 * turning while JS is blocked, which is exactly when a spinner is on screen.
 * Reanimated is reserved for the sheet and the tab bar, where WP-8 needs
 * layout animations and a worklet.
 */
export function Spinner({
  size = 20,
  color = 'accent',
  strokeWidth = 2.5,
  accessibilityLabel,
  testID,
  style,
  className,
}: SpinnerProps) {
  const colors = useThemeColors();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      // Reset, so a spinner that unmounts and remounts starts from the top
      // rather than from wherever the last one happened to be.
      spin.setValue(0);
    };
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: true }}
      style={[{ width: size, height: size, transform: [{ rotate }] }, style]}
      className={className}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Circle
          cx={12}
          cy={12}
          r={RADIUS}
          stroke={resolveColor(color, colors)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
        />
      </Svg>
    </Animated.View>
  );
}
