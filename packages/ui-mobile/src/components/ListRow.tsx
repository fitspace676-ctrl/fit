import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { fontWeight, radius, spacing, typography } from '../tokens';

export interface ListRowProps {
  /** Primary line. */
  title: string;
  /** Optional secondary line under the title. */
  subtitle?: string;
  /** Optional leading element — an icon, avatar or thumbnail. */
  leading?: ReactNode;
  /** Optional trailing element — a value, badge, switch or chevron. */
  trailing?: ReactNode;
  /** When set the row is tappable with a press-dim. */
  onPress?: () => void;
  /** Show a `›` chevron on the trailing edge (implies a navigable row). */
  chevron?: boolean;
  /** Escape hatch for layout tweaks at the call site. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A single horizontal row — leading · (title / subtitle) · trailing — that the
 * class, product, booking and settings lists share. Mirrors the layout those
 * screens hand-rolled (12px gutter, 1-line-clamped title, muted subtitle) so
 * they can be rebuilt against one primitive. Pass `chevron` for a navigable
 * row, or a `trailing` node for a value/badge; both may be combined.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron = false,
  style,
}: ListRowProps) {
  const colors = useThemeColors();

  const body = (
    <>
      {leading != null ? <View>{leading}</View> : null}

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            color: colors.text,
            fontSize: typography.heading.fontSize,
            fontWeight: fontWeight.semibold,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: colors.textMuted, fontSize: typography.caption.fontSize }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing != null ? <View>{trailing}</View> : null}
      {chevron ? (
        <Text style={{ color: colors.textMuted, fontSize: typography.title.fontSize }}>›</Text>
      ) : null}
    </>
  );

  const base: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [base, { opacity: pressed ? 0.7 : 1 }, style]}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={[base, style]}>{body}</View>;
}
