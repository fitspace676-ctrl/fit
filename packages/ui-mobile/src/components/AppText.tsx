import { Text, type TextProps } from 'react-native';

import { useThemeColors } from '../theme';
import { fontWeight as weights, typography } from '../tokens';

/** Type-ramp step, straight from {@link typography}. */
export type TextVariant = keyof typeof typography;
/** Semantic color role for text. */
export type TextTone = 'default' | 'muted' | 'primary' | 'onPrimary' | 'danger' | 'success';

export interface AppTextProps extends TextProps {
  /** Size/line-height step. Defaults to `body`. */
  variant?: TextVariant;
  /** Color role. Defaults to `default`. */
  tone?: TextTone;
  /** Font weight. Defaults to the sensible weight for the variant. */
  weight?: keyof typeof weights;
}

/** Heading-ish variants default to semibold; the rest to regular. */
const DEFAULT_WEIGHT: Record<TextVariant, keyof typeof weights> = {
  display: 'bold',
  title: 'bold',
  heading: 'semibold',
  body: 'regular',
  label: 'medium',
  caption: 'regular',
  micro: 'medium',
};

/**
 * The text primitive: one component that binds the {@link typography} ramp to
 * the semantic color palette, so screens read `<AppText variant="title">`
 * instead of re-deriving `fontSize` / `color` on every `<Text>`. Still a plain
 * React Native `Text` underneath — all its props pass through.
 */
export function AppText({
  variant = 'body',
  tone = 'default',
  weight,
  style,
  ...rest
}: AppTextProps) {
  const colors = useThemeColors();
  const toneColor: Record<TextTone, string> = {
    default: colors.text,
    muted: colors.textMuted,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    danger: colors.danger,
    success: colors.success,
  };

  return (
    <Text
      style={[
        {
          fontSize: typography[variant].fontSize,
          lineHeight: typography[variant].lineHeight,
          fontWeight: weights[weight ?? DEFAULT_WEIGHT[variant]],
          color: toneColor[tone],
        },
        style,
      ]}
      {...rest}
    />
  );
}
