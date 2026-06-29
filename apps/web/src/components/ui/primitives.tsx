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
export function Avatar({ src, alt = '', ring = false, size = 'h-9 w-9', className = '' }: AvatarProps) {
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
  className?: string;
}

/** A slim animated progress bar. */
export function Progress({ value, tone = 'bg-brand-500', className = '' }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={`h-2 overflow-hidden rounded-pill bg-ink-100 dark:bg-white/10 ${className}`}
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-700 ease-out ${tone}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
