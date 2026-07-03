import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useThemeColors } from '../theme';
import { fontWeight, radius, spacing, typography, type ThemeColors } from '../tokens';

/** Visual weight of a button. */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** Height / padding preset. */
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  /** Text label. */
  label: string;
  /** Tap handler. Ignored while `busy` or `disabled`. */
  onPress: () => void;
  /** Fill/emphasis. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Size preset. Defaults to `md`. */
  size?: ButtonSize;
  /** Shows a spinner (and `busyLabel`), and blocks presses, while true. */
  busy?: boolean;
  /** Label swapped in while `busy`. Falls back to `label`. */
  busyLabel?: string;
  /** Greys out and blocks presses. */
  disabled?: boolean;
  /** Stretch to the full width of the parent. */
  fullWidth?: boolean;
  /** Optional leading element (icon/glyph) rendered before the label. */
  leftIcon?: ReactNode;
  /** Escape hatch for layout tweaks at the call site. */
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number }> = {
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl },
};

/** Resolve the fill, border and label colors for a variant. */
function palette(variant: ButtonVariant, colors: ThemeColors) {
  switch (variant) {
    case 'primary':
      return { background: colors.primary, border: colors.primary, label: colors.onPrimary };
    case 'danger':
      return { background: colors.danger, border: colors.danger, label: '#ffffff' };
    case 'secondary':
      return { background: colors.surface, border: colors.border, label: colors.text };
    case 'ghost':
      return { background: 'transparent', border: 'transparent', label: colors.primary };
  }
}

/**
 * The primary tappable action across the app: a filled brand button by default,
 * with `secondary` (bordered surface), `ghost` (borderless) and `danger`
 * variants, three sizes, and a busy state that shows a spinner and blocks
 * double-taps. Colors resolve from the active theme, so it repaints with system
 * dark mode. This is the shared successor to the per-screen auth `AuthButton`.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  busy = false,
  busyLabel,
  disabled = false,
  fullWidth = false,
  leftIcon,
  style,
}: ButtonProps) {
  const colors = useThemeColors();
  const tone = palette(variant, colors);
  const inactive = busy || disabled;
  const spinnerColor = variant === 'secondary' || variant === 'ghost' ? colors.primary : tone.label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: tone.border,
          backgroundColor: tone.background,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: inactive ? 0.6 : pressed ? 0.85 : 1,
          ...SIZES[size],
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={spinnerColor} />
      ) : leftIcon ? (
        <View>{leftIcon}</View>
      ) : null}
      <Text
        style={{
          color: tone.label,
          fontSize: typography.body.fontSize,
          fontWeight: fontWeight.semibold,
        }}
      >
        {busy ? (busyLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}
