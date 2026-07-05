import type { HTMLAttributes, ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*  Card                                                                       */
/* -------------------------------------------------------------------------- */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Render the hairline top sheen + inner glow used by the dark glass panels. */
  glow?: boolean;
}

/**
 * The portal's surface primitive: a white card with a soft shadow in the light
 * theme, a frosted glass panel in the dark theme. `glow` adds the dark panel's
 * hairline top highlight.
 */
export function Card({ children, glow = false, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-card border border-ink-200 bg-white shadow-[0_14px_40px_-18px_rgba(0,0,0,0.18)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] dark:backdrop-blur-xl ${className}`}
      {...rest}
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-white/30 to-transparent dark:block"
        />
      )}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dot                                                                        */
/* -------------------------------------------------------------------------- */

/** A 6px status dot. `c` is a background colour class, e.g. `bg-success-500`. */
export function Dot({ c, className = '' }: { c: string; className?: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${c} ${className}`} />;
}

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                     */
/* -------------------------------------------------------------------------- */

export interface AvatarProps {
  src: string;
  alt?: string;
  ring?: boolean;
  /** Size classes; defaults to `h-9 w-9`. */
  size?: string;
  className?: string;
}

/** A circular avatar image, optionally with the brand selection ring. */
export function Avatar({
  src,
  alt = '',
  ring = false,
  size = 'h-9 w-9',
  className = '',
}: AvatarProps) {
  return (
    <img
      src={src}
      alt={alt}
      className={`${size} shrink-0 rounded-full object-cover ${
        ring
          ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950'
          : 'ring-1 ring-ink-200 dark:ring-white/10'
      } ${className}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Progress                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProgressProps {
  /** 0–100. */
  value: number;
  /** Fill colour class; defaults to the brand violet. */
  tone?: string;
  /** Accessible name for the bar (announced with its percentage). */
  label?: string;
  className?: string;
}

/** A slim animated progress bar, exposed to assistive tech as a `progressbar`. */
export function Progress({ value, tone = 'bg-brand-500', label, className = '' }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`h-2 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10 ${className}`}
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-700 ease-out ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  SkipLink                                                                    */
/* -------------------------------------------------------------------------- */

export interface SkipLinkProps {
  /** The target element id, without the `#` (defaults to `main-content`). */
  targetId?: string;
  /** Visible link text. */
  children?: ReactNode;
  className?: string;
}

/**
 * A "skip to main content" link — the first focusable element in the shell so a
 * keyboard user can jump past the nav to the page body (WCAG 2.4.1 Bypass
 * Blocks). It is visually hidden until focused, then springs into the top-left
 * corner. Point it at the shell's `<main id="…">`.
 */
export function SkipLink({
  targetId = 'main-content',
  children = 'Skip to main content',
  className = '',
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={`sr-only rounded-btn bg-white px-4 py-2 text-sm font-semibold text-ink-900 shadow-lg outline-none focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:ring-4 focus:ring-brand-500/40 dark:bg-ink-900 dark:text-white ${className}`.trim()}
    >
      {children}
    </a>
  );
}
