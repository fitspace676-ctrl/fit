import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { fontWeight, radius, spacing, typography, type ThemeColors } from '../tokens';

/** Semantic color of a badge. */
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'danger' | 'warning';

export interface BadgeProps {
  /** Short label — a status, a count, a category. */
  label: string;
  /** Semantic tone. Defaults to `neutral`. */
  tone?: BadgeTone;
  /** Escape hatch for layout tweaks at the call site. */
  style?: StyleProp<ViewStyle>;
}

/** Map a tone to a soft background + readable foreground from the palette. */
function toneColors(tone: BadgeTone, colors: ThemeColors): { background: string; text: string } {
  switch (tone) {
    case 'primary':
      return { background: colors.primarySoft, text: colors.primary };
    case 'success':
      return { background: colors.primarySoft, text: colors.success };
    case 'danger':
      return { background: colors.primarySoft, text: colors.danger };
    case 'warning':
      return { background: colors.primarySoft, text: colors.warning };
    case 'neutral':
      return { background: colors.surfaceMuted, text: colors.textMuted };
  }
}

/**
 * A small pill for status and category labels — "Full", "3 left", "Active" —
 * on a soft tinted background. Tones map to the semantic palette, so a `danger`
 * badge stays legible in both light and dark.
 */
export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const colors = useThemeColors();
  const { background, text } = toneColors(tone, colors);

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: background,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: text,
          fontSize: typography.micro.fontSize,
          fontWeight: fontWeight.semibold,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
