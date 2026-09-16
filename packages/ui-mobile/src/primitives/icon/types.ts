import type { StyleProp, ViewStyle } from 'react-native';

import type { ColorRole } from '../../tokens/semantic';

import type { IconName } from './paths';

/**
 * A colour a component will accept: a semantic role name (resolved against the
 * active theme) or a literal colour string.
 *
 * `(string & {})` rather than plain `string` is deliberate — the intersection
 * keeps TypeScript from collapsing the union to `string`, so editors still
 * autocomplete the ~60 role names while a raw `'#E4F26A'` remains legal for
 * the one case that needs it (a category colour the API ships per class type,
 * which cannot be a role because the design system does not know it).
 */
export type ColorValue = ColorRole | (string & {});

export interface IconProps {
  /** Which glyph. See `ICON_PATHS`. */
  name: IconName;

  /**
   * REQUIRED, and the single most important prop on this component.
   *
   * `react-native-svg` does NOT resolve `currentColor` — there is no cascade
   * to inherit from, and a `stroke` it cannot resolve renders as nothing. An
   * optional `color` with a sensible default would paper over that at the type
   * level and then produce an invisible icon the first time a component is
   * dropped onto a surface whose default is wrong, which is the single largest
   * source of "the icon is missing" in React Native SVG work. Making it
   * required means the question is answered at every call site.
   */
  color: ColorValue;

  /** Edge length in points. Default 20 — the artboards' most common icon size. */
  size?: number;

  /** Default 1.9 — the "Lime Block" stroke. (Web's older set is 2.1.) */
  strokeWidth?: number;

  /**
   * Supply ONLY when the glyph carries meaning nothing around it repeats.
   *
   * Omitted (the default) the icon is decorative: `accessible={false}` plus
   * the iOS and Android hide-subtree flags, so the labelled control around it
   * announces once instead of announcing its own name and then the icon's.
   */
  accessibilityLabel?: string;

  testID?: string;

  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;

  /** Merged last, so a screen can always nudge. */
  className?: string;
}

export type { IconName };
