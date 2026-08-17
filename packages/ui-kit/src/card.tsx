import type { HTMLAttributes, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/**
 * A panel. The portal's most repeated surface.
 *
 * Deliberately without elevation: the direction gives cards a flat seat on the
 * canvas and reserves shadow for things that FLOAT (the nav capsule, popovers,
 * menus). Separation comes from the surface step instead — white on an ink-100
 * page in light, ink-900 on ink-950 in dark — which is why neither mode needs a
 * border to read as a lifted panel.
 *
 * `padding` is a named step rather than a number because every call site was
 * passing `padding={0}` and then restating the real padding in its own `xstyle`
 * — 40 of them, each with a private `styles.card = { padding: '1.25rem' }`. The
 * steps below are the three values those 40 rules actually held.
 */

const styles = stylex.create({
  base: {
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-card)',
  },
  /** A recessed panel — for a card nested inside another card. */
  muted: {
    backgroundColor: 'var(--color-background-muted)',
  },
  /**
   * The hero step of the radius ladder (32px), reserved for the largest blocks:
   * the membership card and the sign-in screen's panel.
   */
  hero: {
    borderRadius: 'var(--radius-page)',
  },
  /** Rows that run edge to edge need the corners to clip their children. */
  clip: {
    overflow: 'hidden',
  },
  /** A card that is itself a link or a button. */
  interactive: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: { default: 'var(--color-border)', ':hover': 'var(--color-accent)' },
    textDecoration: 'none',
    transitionProperty: 'border-color',
    transitionDuration: '150ms',
  },

  padNone: { padding: 0 },
  padSm: { padding: '1rem' },
  padCard: {
    padding: {
      default: '1.25rem',
      '@media (min-width: 640px)': '1.5rem',
    },
  },
  padLg: { padding: '1.5rem' },
});

const PADDING = {
  none: styles.padNone,
  sm: styles.padSm,
  card: styles.padCard,
  lg: styles.padLg,
} as const;

export type CardPadding = keyof typeof PADDING;
export type CardVariant = 'default' | 'muted';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {
  children?: ReactNode;
  variant?: CardVariant;
  /** @default 'card' */
  padding?: CardPadding;
  /** The 32px hero silhouette, for the largest blocks only. */
  hero?: boolean;
  /** Clip children to the corners — for edge-to-edge row lists. */
  clip?: boolean;
  /** Draws the hover border of a card that is itself a target. */
  interactive?: boolean;
  xstyle?: StyleXStyles;
}

export function Card({
  children,
  variant = 'default',
  padding = 'card',
  hero = false,
  clip = false,
  interactive = false,
  xstyle,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.base,
        variant === 'muted' && styles.muted,
        hero && styles.hero,
        clip && styles.clip,
        interactive && styles.interactive,
        PADDING[padding],
        xstyle,
      )}
    >
      {children}
    </div>
  );
}
