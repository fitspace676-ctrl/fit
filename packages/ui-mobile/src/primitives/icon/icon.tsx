import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { DECORATIVE } from '../../internal/a11y';
import { useThemeColors } from '../../tokens/theme';
import type { ThemeColors } from '../../tokens/semantic';

import { ICON_PATHS } from './paths';
import type { ColorValue, IconProps } from './types';

/** The grid every glyph in `ICON_PATHS` is drawn on. */
const VIEW_BOX = '0 0 24 24';

/** The "Lime Block" stroke. Web's pre-repaint set is 2.1; the artboards are 1.9. */
export const ICON_STROKE_WIDTH = 1.9;

/** The artboards' most common icon size. */
export const ICON_DEFAULT_SIZE = 20;

/**
 * Resolve a {@link ColorValue} against the active theme.
 *
 * A bare `in` check is enough: role names are camelCase identifiers and every
 * literal colour is a `#…`, `rgb…` or a CSS keyword, so the two spaces cannot
 * collide.
 */
export function resolveColor(value: ColorValue, colors: ThemeColors): string {
  return value in colors ? colors[value as keyof ThemeColors] : value;
}

/**
 * One glyph from {@link ICON_PATHS}, drawn as a single stroked path.
 *
 * ---------------------------------------------------------------------------
 * THREE THINGS HERE ARE NOT STYLISTIC.
 *
 * 1. `width` AND `height` are both set, always. Given only one, Android's SVG
 *    backend derives the other from the viewBox at a different rounding step
 *    than iOS does, and a 20px icon comes out 19 or 21 on one platform only —
 *    which reads as "the icons are misaligned on Android" and gets chased in
 *    the layout, where it is not.
 *
 * 2. `stroke` takes a RESOLVED colour string. `react-native-svg` has no
 *    cascade, so `currentColor` is not a thing; see `IconProps.color`.
 *
 * 3. Decorative by default. See `IconProps.accessibilityLabel`.
 * ---------------------------------------------------------------------------
 *
 * The component ships no copy — `accessibilityLabel` is the caller's, and the
 * overwhelmingly common case is that the caller is a labelled control and
 * passes nothing at all.
 */
export function Icon({
  name,
  color,
  size = ICON_DEFAULT_SIZE,
  strokeWidth = ICON_STROKE_WIDTH,
  accessibilityLabel,
  testID,
  style,
  className,
}: IconProps) {
  const colors = useThemeColors();
  const stroke = resolveColor(color, colors);

  // `react-native-svg` renders a raw DOM `<svg>` on web and forwards whatever it
  // is given, so React Native's accessibility props arrive at the element
  // unmapped — `importantForAccessibility` and `accessible={false}` become
  // unknown-attribute warnings on every icon in the tree. Every other component
  // in this package spreads these onto a `View` or a `Text`, which
  // `react-native-web` translates for us; the SVG is the one node that has to
  // say the same thing in the DOM's own words.
  const a11y = accessibilityLabel
    ? Platform.OS === 'web'
      ? ({ role: 'img', 'aria-label': accessibilityLabel } as const)
      : ({ accessible: true, accessibilityRole: 'image', accessibilityLabel } as const)
    : Platform.OS === 'web'
      ? ({ 'aria-hidden': true, focusable: false } as const)
      : DECORATIVE;

  return (
    <Svg
      // See note 1: both dimensions, every time.
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      testID={testID}
      {...a11y}
      style={style}
      className={className}
    >
      <Path
        d={ICON_PATHS[name]}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
