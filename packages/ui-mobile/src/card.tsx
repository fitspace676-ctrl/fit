import { type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type ViewProps } from 'react-native';

/** Padding scale for {@link Card}. */
export type CardPad = 'none' | 'sm' | 'md' | 'lg';

const PAD: Record<CardPad, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export interface CardProps extends Omit<ViewProps, 'style'> {
  children: ReactNode;
  /** Inner padding. Defaults to `md`. */
  pad?: CardPad;
  /** Extra classes merged onto the surface. */
  className?: string;
}

const SURFACE = 'rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900';

/**
 * The mobile surface primitive: a white card with a hairline border in the
 * light theme, a lifted ink panel in the dark theme — the Expo mirror of web's
 * `Card`. Use {@link PressableCard} when the whole card is tappable.
 */
export function Card({ children, pad = 'md', className = '', ...rest }: CardProps) {
  return (
    <View className={`${SURFACE} ${PAD[pad]} ${className}`} {...rest}>
      {children}
    </View>
  );
}

export interface PressableCardProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  /** Inner padding. Defaults to `md`. */
  pad?: CardPad;
  /** Extra classes merged onto the surface. */
  className?: string;
}

/** A {@link Card} that responds to taps, with a native pressed-state dim. */
export function PressableCard({
  children,
  pad = 'md',
  className = '',
  ...rest
}: PressableCardProps) {
  return (
    <Pressable className={`${SURFACE} ${PAD[pad]} active:opacity-70 ${className}`} {...rest}>
      {children}
    </Pressable>
  );
}

/** A hairline divider that follows the theme border colour. */
export function Divider({ className = '' }: { className?: string }) {
  return <View className={`h-px w-full bg-ink-200 dark:bg-ink-800 ${className}`} />;
}
