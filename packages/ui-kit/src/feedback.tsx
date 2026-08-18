import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { StyleXStyles } from '@stylexjs/stylex';
import { text } from './tokens';

/**
 * The two "state of the data" components: nothing here yet, and how far along.
 */

const styles = stylex.create({
  /* ------------------------------ empty state ----------------------------- */
  empty: {
    display: 'grid',
    placeItems: 'center',
    gap: '0.5rem',
    paddingBlock: '2.5rem',
    paddingInline: '1.5rem',
    textAlign: 'center',
  },
  emptyCompact: {
    paddingBlock: '1.5rem',
  },
  emptyIcon: {
    display: 'grid',
    placeItems: 'center',
    height: '2rem',
    width: '2rem',
    color: 'var(--color-text-disabled)',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  emptyBody: {
    margin: 0,
    maxWidth: '32ch',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  emptyAction: {
    marginTop: '0.5rem',
  },

  /* ------------------------------- progress ------------------------------- */
  progress: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  progressHead: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  progressValue: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  progressCap: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  progressPct: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  track: {
    height: '0.5rem',
    overflow: 'hidden',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
  },
  fill: {
    height: '100%',
    borderRadius: 'var(--radius-full)',
    transitionProperty: 'width',
    transitionDuration: '300ms',
  },
  // The three signals the direction allows. `full` is the one place a meter is
  // allowed to go red: a class at capacity is a hard stop, not a warning.
  fillOk: {
    backgroundColor: 'var(--color-accent)',
    backgroundImage: 'var(--brand-fill-image, none)',
  },
  fillTight: { backgroundColor: 'var(--color-warning)' },
  fillFull: { backgroundColor: 'var(--color-error)' },
});

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** One line on what would put something here. */
  body?: string;
  /** Usually a `ButtonLink` — the way out of the empty state. */
  action?: ReactNode;
  /** Tighter vertical rhythm, for an empty slot inside a card rather than a page. */
  compact?: boolean;
  xstyle?: StyleXStyles;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  compact = false,
  xstyle,
}: EmptyStateProps) {
  return (
    <div {...stylex.props(styles.empty, compact && styles.emptyCompact, xstyle)}>
      {icon ? <span {...stylex.props(styles.emptyIcon)}>{icon}</span> : null}
      <p {...stylex.props(styles.emptyTitle)}>{title}</p>
      {body ? <p {...stylex.props(styles.emptyBody)}>{body}</p> : null}
      {action ? <span {...stylex.props(styles.emptyAction)}>{action}</span> : null}
    </div>
  );
}

export interface MeterProps {
  value: number;
  max: number;
  /** Accessible name for the bar — e.g. "spots taken". */
  label: string;
  /** Show the `value/max` header and the percentage above the track. */
  showHeader?: boolean;
  xstyle?: StyleXStyles;
}

/**
 * A `value / max` bar, colour-coded by how full it is.
 *
 * The thresholds (60% / 85%) are the class-booking ones: under 60 there is
 * comfortable room, over 85 a member should hurry, at 100 the only remaining
 * action is the waitlist. It renders as a real `progressbar` so the number is
 * available to a screen reader without reading the visual header.
 */
export function Meter({ value, max, label, showHeader = true, xstyle }: MeterProps) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const fill = pct > 85 ? styles.fillFull : pct > 60 ? styles.fillTight : styles.fillOk;

  return (
    <div {...stylex.props(styles.progress, xstyle)}>
      {showHeader ? (
        <div {...stylex.props(styles.progressHead)}>
          <p {...stylex.props(styles.progressValue, text.numeral)}>
            {value}
            <span {...stylex.props(styles.progressCap)}>/{max}</span>
          </p>
          <span {...stylex.props(styles.progressPct, text.numeral)}>{pct}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        {...stylex.props(styles.track)}
      >
        <div {...stylex.props(styles.fill, fill)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
