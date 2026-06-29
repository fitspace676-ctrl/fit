import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icon';

export type BtnVariant =
  | 'primary'
  | 'white'
  | 'glass'
  | 'outline'
  | 'ghost'
  | 'ink'
  | 'danger';

export type BtnSize = 'sm' | 'md' | 'lg' | 'icon';

const SIZES: Record<BtnSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 justify-center',
};

/**
 * Variant classes. `primary`/`white`/`glass` are tuned for the gradient and
 * dark Aurora surfaces (white text on translucent fills), while `outline`/
 * `ghost`/`ink` flip with the theme via `dark:` variants so they read on both
 * the light and dark member skins.
 */
const VARIANTS: Record<BtnVariant, string> = {
  primary:
    'bg-[linear-gradient(135deg,#6257E3,#7A5AF8)] text-white shadow-[0_6px_24px_-6px_rgba(98,87,227,0.7)] hover:brightness-110 active:brightness-95 focus-visible:ring-brand-500/40',
  white:
    'bg-white text-ink-950 shadow-[0_6px_24px_-8px_rgba(255,255,255,0.5)] hover:bg-ink-100 active:bg-ink-200 focus-visible:ring-white/40',
  glass:
    'border border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/20 active:bg-white/25 focus-visible:ring-white/30',
  outline:
    'border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 active:bg-ink-100 focus-visible:ring-ink-400/30 dark:border-white/15 dark:bg-white/[0.04] dark:text-ink-100 dark:hover:bg-white/10',
  ghost:
    'text-ink-600 hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-ink-400/20 dark:text-ink-300 dark:hover:bg-white/5 dark:hover:text-white',
  ink: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 focus-visible:ring-ink-500/40 dark:bg-white dark:text-ink-950 dark:hover:bg-ink-100',
  danger:
    'bg-danger-500 text-white hover:bg-danger-400 active:bg-danger-600 focus-visible:ring-danger-500/40',
};

const BASE =
  'inline-flex items-center justify-center font-semibold rounded-btn transition-all outline-none focus-visible:ring-4 disabled:opacity-40 disabled:pointer-events-none';

/** Compose the class string for a button-styled element (use on `<Link>` too). */
export function buttonClasses(
  variant: BtnVariant = 'primary',
  size: BtnSize = 'md',
  className = '',
): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`.trim();
}

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  v?: BtnVariant;
  size?: BtnSize;
  /** Leading icon. */
  icon?: IconName;
  /** Trailing icon. */
  iconRight?: IconName;
  children?: ReactNode;
}

/** The member portal button. Pair with {@link buttonClasses} for link buttons. */
export function Btn({
  v = 'primary',
  size = 'md',
  icon,
  iconRight,
  className = '',
  children,
  type = 'button',
  ...rest
}: BtnProps) {
  return (
    // eslint-disable-next-line react/button-has-type
    <button type={type} className={buttonClasses(v, size, className)} {...rest}>
      {icon && <Icon name={icon} className="h-4 w-4" sw={2} />}
      {children}
      {iconRight && <Icon name={iconRight} className="h-4 w-4" sw={2} />}
    </button>
  );
}
