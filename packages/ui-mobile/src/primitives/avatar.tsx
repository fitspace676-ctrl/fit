import {
  Image,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { DECORATIVE } from '../internal/a11y';
import type { ColorRole } from '../tokens/semantic';
import { useThemeColors } from '../tokens/theme';
import { Mono } from './text';

/**
 * The ring treatments, from the artboards.
 *
 *   accent   `ring-2 ring-brand-300`  — the signed-in member (home, QR, profile)
 *   neutral  `ring-2 ring-ink-700`    — anybody else (trainers, class detail)
 *   none                              — inside a row that already has an edge
 *
 * The lime ring is not decoration: it is the only thing on the home header
 * that says "this is you" without a word of copy, and it is what makes the
 * trainer rows lower down read as other people.
 */
const RINGS = {
  accent: 'accent',
  neutral: 'avatarRing',
  none: null,
} as const satisfies Record<string, ColorRole | null>;

export type AvatarRing = keyof typeof RINGS;

/**
 * Any point size. The artboards use three: 44 (the QR header), 52 (the home
 * and class-detail rows) and 72 (the profile).
 */
export type AvatarSize = number;

export interface AvatarProps {
  /** A remote or bundled image. Omit and the monogram is drawn instead. */
  source?: ImageSourcePropType;
  /**
   * The monogram, shown when there is no image or it fails to load.
   *
   * Passed rather than derived from a name: initial-taking is locale-specific
   * (Georgian names, mononyms, and Latin names each want a different rule) and
   * this package does not know the locale — which is the same reason it ships
   * no copy.
   */
  initials?: string;
  /** Default 44. */
  size?: AvatarSize;
  /** Default `'neutral'`. */
  ring?: AvatarRing;
  /**
   * Supply ONLY when the person's name is not already adjacent in the layout.
   *
   * In all six artboards it is — the avatar always sits beside the name it
   * belongs to — so the default is decorative, and an avatar that announced
   * "Nino Kapanadze" immediately before a `Text` reading "Nino Kapanadze"
   * would just say it twice.
   */
  accessibilityLabel?: string;
  testID?: string;
  /** Merged last, so a screen can always nudge. */
  style?: StyleProp<ViewStyle>;
  /** Merged last, so a screen can always nudge. */
  className?: string;
}

/** The mono monogram size for a plate, matching the shop artboard's 30/72 ratio. */
function monogramVariant(size: number): 'monoDisplay' | 'monoLarge' | 'monoBody' {
  if (size >= 68) return 'monoDisplay';
  if (size >= 48) return 'monoLarge';
  return 'monoBody';
}

/**
 * A round portrait, with a monogram fallback.
 *
 * The ring is drawn as a `borderWidth` on the outer view with the image inset
 * inside it, rather than as a shadow or a second absolutely-positioned circle.
 * On Android a `borderRadius` on an `Image` clips reliably only when the image
 * has an opaque parent of the same radius, and the two-circle version produces
 * a one-pixel light seam between the ring and the photo on any screen whose
 * scale factor is not an integer.
 */
export function Avatar({
  source,
  initials,
  size = 44,
  ring = 'neutral',
  accessibilityLabel,
  testID,
  style,
  className,
}: AvatarProps) {
  const colors = useThemeColors();
  const ringRole = RINGS[ring];
  const ringWidth = ringRole ? 2 : 0;
  const inner = size - 2 * ringWidth;

  const a11y = accessibilityLabel
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel } as const)
    : DECORATIVE;

  return (
    <View
      testID={testID}
      {...a11y}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.quiet,
          overflow: 'hidden',
          ...(ringRole ? { borderWidth: ringWidth, borderColor: colors[ringRole] } : {}),
        },
        style,
      ]}
      className={className}
    >
      {source ? (
        <Image
          source={source}
          style={{ width: inner, height: inner, borderRadius: inner / 2 }}
          resizeMode="cover"
        />
      ) : initials ? (
        <Mono variant={monogramVariant(size)} color="onQuiet" accessible={false}>
          {initials}
        </Mono>
      ) : null}
    </View>
  );
}
