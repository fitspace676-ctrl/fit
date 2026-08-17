import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';

/**
 * A status chip.
 *
 * The silhouette is a small rounded rectangle at the `inner` step (10px), not a
 * stadium. That is the whole reason this replaces Astryx's badge: its radius is
 * baked into its own StyleX as a full pill and no theme token reaches it, so
 * every chip in the portal read as a component borrowed from another product
 * sitting among the family's rounded rectangles.
 *
 * TONES, NOT HUES. The direction reduces sentiment to three signals — a positive
 * state is the lime, a pending or neutral one is ink, and red is the single
 * functional exception. Astryx offered ten categorical hues on top of that, and
 * the theme had to flatten nine of them onto ink so that a stray `variant="purple"`
 * could not reintroduce a colour the design spent its whole budget removing.
 * That worked, but it left seven call sites asking for `purple` and getting grey,
 * which reads as a mistake in the source even though the pixels are right. The
 * tones below are the ones that actually exist.
 */

const styles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    flexShrink: 0,
    borderRadius: 'var(--radius-inner)',
    height: '1.5rem',
    paddingInline: '0.5rem',
    fontSize: '0.6875rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  /** The default: filled, voiceless. Counts, categories, specialties. */
  neutral: {
    backgroundColor: 'var(--fc-quiet)',
    color: 'var(--fc-on-quiet)',
  },
  /**
   * Confirmed / ACTIVE / ATTENDED. A TINT with a lime hairline rather than a
   * solid lime fill: solid, it competes with the membership block, and this
   * state means "already done" rather than "press me".
   */
  positive: {
    backgroundColor: 'var(--fc-booked)',
    color: 'var(--fc-on-booked)',
    boxShadow: 'inset 0 0 0 1px var(--fc-booked-border)',
  },
  /** WAITLIST / FROZEN / pending — ink, because the direction gives it no hue. */
  pending: {
    backgroundColor: 'var(--fc-ghost)',
    color: 'var(--fc-on-ghost)',
  },
  /** Payment failed, cancelled, out of stock. The one surviving colour. */
  danger: {
    backgroundColor: 'var(--color-error-muted)',
    color: 'var(--color-text-red)',
  },
  /** A solid lime chip — for the one place a badge IS the headline. */
  accent: {
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
  },
});

export type BadgeTone = 'neutral' | 'positive' | 'pending' | 'danger' | 'accent';

export interface BadgeProps {
  label: ReactNode;
  /** @default 'neutral' */
  tone?: BadgeTone;
  icon?: ReactNode;
  xstyle?: StyleXStyles;
}

export function Badge({ label, tone = 'neutral', icon, xstyle }: BadgeProps) {
  return (
    <span {...stylex.props(styles.base, styles[tone], xstyle)}>
      {icon ? <span {...stylex.props(styles.icon)}>{icon}</span> : null}
      {label}
    </span>
  );
}
