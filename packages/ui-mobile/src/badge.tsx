import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

/** Semantic tone for a {@link Badge}. */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

/** Soft-fill container classes per tone (light + dark). */
const TONE_BOX: Record<Tone, string> = {
  neutral: 'bg-ink-100 dark:bg-ink-800',
  brand: 'bg-brand-100 dark:bg-brand-500/20',
  success: 'bg-success-100 dark:bg-success-500/20',
  warning: 'bg-warning-100 dark:bg-warning-500/20',
  danger: 'bg-danger-100 dark:bg-danger-500/20',
  info: 'bg-info-100 dark:bg-info-500/20',
};

/** Label colour per tone (light + dark). */
const TONE_LABEL: Record<Tone, string> = {
  neutral: 'text-ink-700 dark:text-ink-200',
  brand: 'text-brand-700 dark:text-brand-200',
  success: 'text-success-700 dark:text-success-300',
  warning: 'text-warning-700 dark:text-warning-300',
  danger: 'text-danger-700 dark:text-danger-300',
  info: 'text-info-700 dark:text-info-300',
};

export interface BadgeProps {
  children: ReactNode;
  /** Semantic colour. Defaults to `neutral`. */
  tone?: Tone;
  /** Extra classes merged onto the pill. */
  className?: string;
}

/**
 * A soft, pill-shaped status label — the Expo mirror of web's `Badge`. String
 * children are wrapped in a `<Text>` automatically.
 */
export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <View className={`self-start rounded-pill px-2.5 py-1 ${TONE_BOX[tone]} ${className}`}>
      {typeof children === 'string' ? (
        <Text className={`text-xs font-semibold ${TONE_LABEL[tone]}`}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
