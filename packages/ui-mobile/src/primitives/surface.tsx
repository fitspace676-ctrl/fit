import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { clampRadiusTo } from '../internal/clamp-radius';
import { resolveColor } from './icon/icon';
import type { ColorValue } from './icon/types';
import type { SurfaceRadius } from '../tokens/radii';
import { shadowsFor, type ShadowName } from '../tokens/shadows';
import { layout, spacing, type SpacingStep } from '../tokens/spacing';
import { useTheme } from '../tokens/theme';

/**
 * The recurring materials, by name.
 *
 * Each tone is a `[background, border]` pair of semantic roles, transcribed
 * from what the artboards actually put on screen — not invented. The one that
 * looks wrong and is not is `tile`: inside a panel, an inset tile goes DARKER
 * than its parent in dark mode (`ink-950` inside `ink-900` — the page colour
 * punched back through) and LIGHTER in light mode. Both read as "recessed"
 * without a shadow, which this direction reserves for floating chrome.
 */
const TONES = {
  /** `bg-ink-900` — the default card. 5 of 6 artboards, dozens of instances. */
  card: { background: 'backgroundCard', border: null },
  /** Header controls and fields: white in light, the panel colour in dark. */
  control: { background: 'control', border: null },
  /** An inset tile inside a panel. See the note above. */
  tile: { background: 'tile', border: 'tileBorder' },
  /** A filled but voiceless plate — spots-left counts, monograms, thumbnails. */
  quiet: { background: 'quiet', border: null },
  /** The lime block. `onAccent` is the only text colour legible on it. */
  accent: { background: 'accent', border: null },
  /** The BOOKED state: tinted lime fill, lime hairline. Not a CTA. */
  booked: { background: 'booked', border: 'bookedBorder' },
  /** The page itself, for a section that must match the canvas. */
  body: { background: 'backgroundBody', border: null },
  /** No fill at all — for using `Surface` purely as a radius + padding box. */
  none: { background: null, border: null },
} as const;

export type SurfaceTone = keyof typeof TONES;

export interface SurfaceProps extends Omit<ViewProps, 'style'> {
  tone?: SurfaceTone;
  /**
   * A named step (`'container'`) or a literal (the artboards' 18/20/22/28/30
   * pass-throughs). Default `'container'` — 26, the card radius.
   */
  radius?: SurfaceRadius;
  /** Uniform padding, as a spacing step. */
  padding?: SpacingStep;
  padHorizontal?: SpacingStep;
  padVertical?: SpacingStep;
  /** Force the tone's hairline on or off. Defaults to whatever the tone says. */
  border?: boolean;
  /** Elevation. Reserved for things that actually float. */
  shadow?: ShadowName;
  /**
   * The shorter side of this box, when it is fixed.
   *
   * Supply it and the radius is clamped to `floor(side / 2)` — see
   * `internal/clamp-radius.ts`. Without it a 26px container radius on a 29px
   * pill renders a full capsule and the design's octagonal silhouette is gone.
   * Content-sized boxes do not need it: they grow to fit.
   */
  side?: number;
  /** Override the tone's fill. */
  background?: ColorValue;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
  children?: ReactNode;
}

/**
 * A filled, rounded box.
 *
 * This is the boring component, and it earns its place only because `Text`
 * exists: a screen that is already expressing its type through the token layer
 * has no reason to hand-roll `{backgroundColor, borderRadius, padding}` as
 * well. The previous package shipped this component WITHOUT a text primitive,
 * which is why it went unused — see the header of `text.tsx`.
 */
export function Surface({
  tone = 'card',
  radius = 'container',
  padding,
  padHorizontal,
  padVertical,
  border,
  shadow,
  side,
  background,
  style,
  className,
  children,
  ...rest
}: SurfaceProps) {
  const { colors, isDark } = useTheme();
  const spec = TONES[tone];

  const showBorder = border ?? spec.border !== null;
  const borderColor = spec.border ? colors[spec.border] : colors.border;

  return (
    <View
      {...rest}
      style={[
        { borderRadius: clampRadiusTo(radius, side) },
        background
          ? { backgroundColor: resolveColor(background, colors) }
          : spec.background
            ? { backgroundColor: colors[spec.background] }
            : null,
        showBorder ? { borderWidth: layout.hairline, borderColor } : null,
        padding === undefined ? null : { padding: spacing[padding] },
        padHorizontal === undefined ? null : { paddingHorizontal: spacing[padHorizontal] },
        padVertical === undefined ? null : { paddingVertical: spacing[padVertical] },
        shadow ? shadowsFor(isDark)[shadow] : null,
        style,
      ]}
      className={className}
    >
      {children}
    </View>
  );
}

/**
 * The default card: `backgroundCard` at the container radius.
 *
 * A named alias rather than a distinct component, because the artboards use
 * this exact combination in every screen and a name is cheaper to read than
 * three props.
 */
export function Card(props: SurfaceProps) {
  return <Surface tone="card" radius="container" {...props} />;
}
