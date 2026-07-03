import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';
import { palette } from './tokens';

export type ButtonVariant = 'primary' | 'white' | 'outline' | 'ghost' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

/** Height + horizontal padding + label size per size token. */
const SIZES: Record<ButtonSize, { box: string; label: string }> = {
  sm: { box: 'h-9 px-3.5', label: 'text-sm' },
  md: { box: 'h-11 px-5', label: 'text-sm' },
  lg: { box: 'h-12 px-6', label: 'text-base' },
};

/**
 * Container classes per variant. The mobile primary is a solid brand fill
 * (React Native `className` can't paint the web's CSS gradient); everything else
 * flips with the OS colour scheme via NativeWind `dark:` variants so it reads on
 * both the light and dark skins.
 */
const VARIANT_BOX: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 active:bg-brand-700',
  white: 'bg-white active:bg-ink-100',
  outline:
    'border border-ink-200 bg-white active:bg-ink-50 dark:border-ink-700 dark:bg-transparent dark:active:bg-ink-800',
  ghost: 'bg-transparent active:bg-ink-100 dark:active:bg-ink-800',
  danger: 'bg-danger-500 active:bg-danger-600',
};

/** Label colour per variant. */
const VARIANT_LABEL: Record<ButtonVariant, string> = {
  primary: 'text-white',
  white: 'text-ink-950',
  outline: 'text-ink-800 dark:text-ink-100',
  ghost: 'text-ink-700 dark:text-ink-200',
  danger: 'text-white',
};

/** Spinner tint per variant (RN `ActivityIndicator` needs a concrete colour). */
const SPINNER: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  white: palette.ink[950],
  outline: palette.ink[600],
  ghost: palette.ink[600],
  danger: '#FFFFFF',
};

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  /** Visual style. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Height + padding. Defaults to `md`. */
  size?: ButtonSize;
  /** Button label. */
  children?: ReactNode;
  /** Leading element (icon glyph, image, …), rendered before the label. */
  leading?: ReactNode;
  /** Trailing element, rendered after the label. */
  trailing?: ReactNode;
  /** Show a spinner and block presses. */
  busy?: boolean;
  /** Stretch to the full width of the parent. */
  fullWidth?: boolean;
  /** Extra classes merged onto the container. */
  className?: string;
}

/**
 * The shared mobile button — the Expo mirror of web's `Btn`. A `Pressable` with
 * a native pressed state (`active:` classes), an optional busy spinner that
 * disables the press, and leading/trailing slots. Text children are wrapped in a
 * `<Text>` automatically so callers pass a plain string.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  children,
  leading,
  trailing,
  busy = false,
  fullWidth = false,
  disabled = false,
  className = '',
  ...rest
}: ButtonProps) {
  const inactive = Boolean(busy || disabled);
  const s = SIZES[size];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      className={`flex-row items-center justify-center gap-2 rounded-btn ${s.box} ${
        VARIANT_BOX[variant]
      } ${fullWidth ? 'w-full' : ''} ${inactive ? 'opacity-50' : ''} ${className}`}
      {...rest}
    >
      {busy ? <ActivityIndicator size="small" color={SPINNER[variant]} /> : leading}
      {typeof children === 'string' ? (
        <Text className={`font-semibold ${s.label} ${VARIANT_LABEL[variant]}`}>{children}</Text>
      ) : (
        children
      )}
      {trailing ? <View>{trailing}</View> : null}
    </Pressable>
  );
}
