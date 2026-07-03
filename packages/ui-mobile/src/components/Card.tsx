import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useThemeColors } from '../theme';
import { radius, shadow, spacing } from '../tokens';

export interface CardProps {
  children: ReactNode;
  /** When set, the whole card becomes tappable with a press-dim. */
  onPress?: () => void;
  /** Inner padding. Defaults to `md` (12). Pass `none` to lay content edge-to-edge. */
  padding?: keyof typeof spacing;
  /** Lift the card with a resting shadow. Defaults to false (flat, bordered). */
  elevated?: boolean;
  /** Escape hatch for layout tweaks at the call site. */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label when the card is pressable. */
  accessibilityLabel?: string;
}

/**
 * The surface primitive: a rounded, bordered container on the theme `surface`
 * color that the redesigned class / product / booking rows are all built from.
 * Pass `onPress` to make the whole card a button (with the same press-dim those
 * rows use); pass `elevated` for a resting shadow instead of the flat border.
 */
export function Card({
  children,
  onPress,
  padding = 'md',
  elevated = false,
  style,
  accessibilityLabel,
}: CardProps) {
  const colors = useThemeColors();

  const base: ViewStyle = {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing[padding],
    ...(elevated ? shadow.card : null),
  };

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [base, { opacity: pressed ? 0.7 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }

  return <View style={[base, style]}>{children}</View>;
}
