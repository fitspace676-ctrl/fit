import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@astryxdesign/core/Button';
import { Icon, type IconName } from './icon';

export type BtnVariant = 'primary' | 'white' | 'glass' | 'outline' | 'ghost' | 'ink' | 'danger';

export type BtnSize = 'sm' | 'md' | 'lg' | 'icon';

/* -------------------------------------------------------------------------- */
/*  buttonClasses — Tailwind link-button helper (coexistence, T11.6)           */
/* -------------------------------------------------------------------------- */
//
// `Btn` now renders an Astryx `<Button>` (below), but this class-string helper
// stays: ~30 not-yet-migrated screens style `<Link>` / `<a>` as buttons with
// `className={buttonClasses(...)}`, and Astryx has no equivalent for "give an
// arbitrary element the button look". It is Tailwind-based on purpose so those
// anchors keep rendering while Tailwind coexists with Astryx; it retires with
// the Tailwind decommission, not here.

const SIZES: Record<BtnSize, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 justify-center',
};

const VARIANTS: Record<BtnVariant, string> = {
  primary:
    'bg-[linear-gradient(135deg,var(--brand-gradient-from,#7C3AED),var(--brand-gradient-to,#EC4899))] text-white shadow-[0_6px_24px_-6px_rgba(98,87,227,0.7)] hover:brightness-110 active:brightness-95 focus-visible:ring-brand-500/40',
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

/* -------------------------------------------------------------------------- */
/*  Btn — the shared button, now an Astryx <Button> under the Fit theme         */
/* -------------------------------------------------------------------------- */

/**
 * Formacore variant → Astryx variant. Astryx ships four semantic variants
 * (`primary` / `secondary` / `ghost` / `destructive`); the brand palette rides
 * in through the Fit theme (T11.1). The formacore names with no 1:1 fold onto
 * the closest semantic role (`white`/`outline` → secondary, `glass` → ghost,
 * `ink` → primary); the brand-parity sweep tunes them further.
 */
const ASTRYX_VARIANT: Record<BtnVariant, ButtonVariant> = {
  primary: 'primary',
  white: 'secondary',
  glass: 'ghost',
  outline: 'secondary',
  ghost: 'ghost',
  ink: 'primary',
  danger: 'destructive',
};

const ASTRYX_SIZE: Record<Exclude<BtnSize, 'icon'>, ButtonSize> = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
};

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  v?: BtnVariant;
  size?: BtnSize;
  /** Leading icon. */
  icon?: IconName;
  /** Trailing icon. */
  iconRight?: IconName;
  children?: ReactNode;
}

/**
 * The shared portal/console button. Renders an Astryx `<Button>` styled by the
 * Fit brand theme, keeping the formacore prop shape (`v` / `size` / `icon` /
 * `iconRight`) so consuming screens don't change. Native button attributes
 * (`onClick`, `type`, `name`, `disabled`, `aria-*`, `data-*` …) pass straight
 * through. Pair with {@link buttonClasses} for link buttons.
 */
export function Btn({
  v = 'primary',
  size = 'md',
  icon,
  iconRight,
  className = '',
  children,
  type = 'button',
  disabled,
  'aria-label': ariaLabel,
  ...rest
}: BtnProps) {
  const isIconOnly = size === 'icon';
  // Astryx requires a string `label` for the accessible name. Prefer an explicit
  // aria-label, else a plain-text child, else empty (icon-only callers pass one).
  const label = ariaLabel ?? (typeof children === 'string' ? children : '');

  return (
    <Button
      type={type}
      label={label}
      variant={ASTRYX_VARIANT[v]}
      size={isIconOnly ? 'md' : ASTRYX_SIZE[size]}
      isIconOnly={isIconOnly}
      isDisabled={disabled}
      className={className || undefined}
      icon={icon ? <Icon name={icon} className="h-4 w-4" sw={2} /> : undefined}
      endContent={iconRight ? <Icon name={iconRight} className="h-4 w-4" sw={2} /> : undefined}
      // The formacore API accepts the full native-button attribute surface; a few
      // (`title`, `form*`, …) sit outside Astryx's curated BaseProps but are still
      // valid DOM attributes it forwards, so bridge the two prop shapes here.
      {...(rest as unknown as Omit<ComponentProps<typeof Button>, 'label'>)}
    >
      {isIconOnly ? undefined : children}
    </Button>
  );
}
