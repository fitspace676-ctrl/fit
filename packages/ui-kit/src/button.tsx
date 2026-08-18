'use client';

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { control, controlSquare, focus, stretch } from './tokens';

/**
 * The portal's button — the sign-in screen's control, promoted.
 *
 * The visual is the artboards' one: a rounded rectangle at the `element` step,
 * lime for the action the screen wants and progressively quieter fills for the
 * ones it merely allows. What it is NOT is Astryx's button dressed in tokens.
 * That arrangement never held its size: Astryx authors its heights in its own
 * StyleX, which compiles UNLAYERED and therefore outranks the theme's
 * `@layer astryx-theme`, so `components.button` in `formacoreTheme` reached the
 * page for `borderRadius` alone and every button rendered at Astryx's 28/32/36px
 * until the call site pushed it back up with an `xstyle` override. Every call
 * site passing both a `size` and a contradicting override is the smell that
 * ended the arrangement. Here the size prop is simply the height.
 */

const spin = stylex.keyframes({
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
});

const styles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: 0,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    cursor: 'pointer',
    // Colour and shadow both animate: the fill carries hover, the ring carries
    // focus, and a control that changes one without the other reads as broken.
    transitionProperty: 'background-color, color, box-shadow',
    transitionDuration: '150ms',
  },

  /* ------------------------------- variants ------------------------------- */
  // The lime, and the ink that is legible on it. `--color-on-accent` is ink-950
  // and must never be flipped to white: white on this lime is ~1.5:1.
  primary: {
    backgroundColor: { default: 'var(--color-accent)', ':hover': 'var(--fc-accent-hover)' },
    // An app may supply a brand gradient to paint OVER the accent fill (the
    // console's light mode does); where the var is absent the fallback keeps
    // the flat accent exactly as before.
    backgroundImage: {
      default: 'var(--brand-fill-image, none)',
      ':hover': 'var(--brand-fill-image-hover, none)',
    },
    color: 'var(--color-on-accent)',
  },
  // A filled but voiceless control — "also available", never competing with the
  // lime for the eye.
  secondary: {
    backgroundColor: { default: 'var(--fc-quiet)', ':hover': 'var(--fc-tile-hover)' },
    color: 'var(--fc-on-quiet)',
  },
  ghost: {
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
  },
  // Red is the one functional colour the direction keeps. Destructive is a fill
  // rather than red text, because the action it guards is not reversible.
  destructive: {
    backgroundColor: { default: 'var(--color-error)', ':hover': 'var(--color-text-red)' },
    color: 'var(--color-on-error)',
  },
  /**
   * For a button sitting ON the lime block. The lime is the surface there, so a
   * lime button would vanish into it; this inverts — solid ink carrying lime
   * type, which is the same move the block's status pill makes. Mode-independent
   * literals, because the block itself does not change between themes.
   */
  onAccent: {
    backgroundColor: { default: '#131312', ':hover': '#2B2B29' },
    color: 'var(--color-accent)',
  },
  /** The quiet counterpart to `onAccent` — a 10% ink wash on the lime block. */
  onAccentQuiet: {
    backgroundColor: {
      default: 'rgba(19, 19, 18, 0.10)',
      ':hover': 'rgba(19, 19, 18, 0.16)',
    },
    color: '#131312',
  },

  /* -------------------------------- states -------------------------------- */
  // Disabled keeps the silhouette and drops the voice, rather than going
  // translucent — a 50%-opacity lime on a charcoal page turns muddy.
  disabled: {
    backgroundColor: 'var(--fc-quiet)',
    color: 'var(--color-text-disabled)',
    cursor: 'not-allowed',
  },
  // Busy is NOT disabled-looking: the action is under way, so the control keeps
  // its fill and only stops accepting a second press.
  busy: {
    cursor: 'progress',
  },
  spinner: {
    height: '1.15em',
    width: '1.15em',
    flexShrink: 0,
    animationName: spin,
    animationDuration: '900ms',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
  // The end slot inherits the button's colour so a chevron or a count matches
  // the variant without the call site restating it.
  endContent: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'inherit',
  },
});

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'onAccent'
  | 'onAccentQuiet';

/** Named for the job the control does, not for a t-shirt letter. See `tokens.ts`. */
export type ButtonSize = 'door' | 'page' | 'block' | 'card' | 'inline';

export interface ButtonOwnProps {
  /**
   * The visible text. When `iconOnly` is set it becomes the accessible name
   * instead — which is why it stays required on an icon-only control.
   */
  label: string;
  /** Rendered instead of `label`, which then serves only as the accessible name. */
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Rendered before the label. */
  icon?: ReactNode;
  /** Square control showing `icon` alone; `label` becomes the `aria-label`. */
  iconOnly?: boolean;
  /** Rendered after the label — a count, a chevron. Ignored when `iconOnly`. */
  endContent?: ReactNode;
  /** Stretch to the container's width. */
  fullWidth?: boolean;
  /**
   * An action is in flight: shows the spinner and sets `aria-busy`, and blocks a
   * second press without painting the control as disabled.
   */
  loading?: boolean;
  xstyle?: StyleXStyles;
}

export type ButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps | 'className' | 'style'>;

/** The spinner — an arc over a faint ring, rotating. Shared with the auth screens. */
export function Spinner({ xstyle }: { xstyle?: StyleXStyles }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      {...stylex.props(styles.spinner, xstyle)}
    >
      <circle cx="12" cy="12" r="8.5" opacity={0.3} />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" />
    </svg>
  );
}

/**
 * Resolve the fill for a button's state. Kept as a function so the disabled
 * fill wins over the variant rather than being layered under it — composing
 * both would leave the variant's `:hover` rule live on a dead control.
 */
function variantStyle(variant: ButtonVariant, isDisabled: boolean) {
  if (isDisabled) return styles.disabled;
  return styles[variant];
}

export function Button({
  label,
  children,
  variant = 'secondary',
  size = 'card',
  icon,
  iconOnly = false,
  endContent,
  fullWidth = false,
  loading = false,
  disabled = false,
  type = 'button',
  xstyle,
  ...rest
}: ButtonProps) {
  const inert = disabled || loading;

  return (
    <button
      type={type}
      disabled={inert}
      aria-busy={loading || undefined}
      aria-label={iconOnly ? label : undefined}
      {...rest}
      {...stylex.props(
        styles.base,
        control[size],
        iconOnly && controlSquare[size],
        variantStyle(variant, disabled),
        loading && styles.busy,
        fullWidth && stretch.full,
        focus.ring,
        xstyle,
      )}
    >
      {loading ? <Spinner /> : icon}
      {iconOnly ? null : (children ?? label)}
      {!iconOnly && endContent ? (
        <span {...stylex.props(styles.endContent)}>{endContent}</span>
      ) : null}
    </button>
  );
}

/**
 * The button's surface, without the element.
 *
 * WHY THIS IS EXPORTED RATHER THAN A `ButtonLink` COMPONENT. A navigating button
 * needs a `Link`, and the two apps do not share one: the member portal routes
 * through next-intl's locale-aware `Link` (it prefixes `/ka` / `/en`), while the
 * console uses plain `next/link` and keeps its locale in a cookie. Hard-coding
 * either here would give the other app the wrong router.
 *
 * So the package owns the LOOK and each app owns the ELEMENT — a ~25-line
 * `ButtonLink` that spreads these props onto its own `Link` and renders
 * {@link ButtonContent} inside. The silhouette still changes in exactly one
 * place, which is the part that had to stay shared.
 */
export function buttonSurfaceProps({
  variant = 'secondary',
  size = 'card',
  iconOnly = false,
  fullWidth = false,
  disabled = false,
  xstyle,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  xstyle?: StyleXStyles;
}) {
  return stylex.props(
    styles.base,
    control[size],
    iconOnly && controlSquare[size],
    variantStyle(variant, disabled),
    fullWidth && stretch.full,
    focus.ring,
    xstyle,
  );
}

/** The icon / label / end-slot arrangement every button-shaped control renders. */
export function ButtonContent({
  label,
  children,
  icon,
  iconOnly = false,
  endContent,
}: Pick<ButtonOwnProps, 'label' | 'children' | 'icon' | 'iconOnly' | 'endContent'>) {
  return (
    <>
      {icon}
      {iconOnly ? null : (children ?? label)}
      {!iconOnly && endContent ? (
        <span {...stylex.props(styles.endContent)}>{endContent}</span>
      ) : null}
    </>
  );
}

/**
 * Props an app's `ButtonLink` accepts. The anchor attributes are spread by the
 * app, so this only fixes the kit's own half.
 *
 * `popover` and its two target props are dropped because React's DOM typings and
 * next-intl's `Link` typings disagree on the attribute's value union (React has
 * since added `"hint"`), so passing the anchor attributes through whole fails to
 * assign. Astryx's `BaseProps` omits the same three for the same reason, and
 * nothing in either app opens a popover from a link.
 *
 * No `loading`: a navigation has no in-flight state the control owns.
 */
export type ButtonLinkProps = Omit<ButtonOwnProps, 'loading'> & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    | keyof ButtonOwnProps
    | 'href'
    | 'className'
    | 'style'
    | 'popover'
    | 'popoverTarget'
    | 'popoverTargetAction'
  >;
