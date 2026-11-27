'use client';

// The answer row above a trend chart: the window's totals as figures, so the
// chart only has to show the shape. A swatch ties a figure to its series.

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(7.5rem, 1fr))',
    gap: '0.75rem',
    margin: 0,
    marginBottom: '0.5rem',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    paddingBlock: '0.625rem',
    paddingInline: '0.75rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  value: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  good: { color: 'var(--brand-ink)' },
  bad: { color: 'var(--alert-ink)' },
  swatch: {
    width: '0.625rem',
    height: '0.625rem',
    flexShrink: 0,
    borderRadius: '3px',
  },
  up: { backgroundColor: 'var(--chart-series-1)' },
  down: { backgroundColor: 'var(--color-error)' },
  stack: { backgroundColor: 'var(--chart-series-2)' },
});

export interface Stat {
  label: string;
  value: ReactNode;
  /** The series colour this figure belongs to, when it names one. */
  swatch?: 'up' | 'down' | 'stack';
  /** Colours the figure itself, for a change that is good or bad news. */
  tone?: 'good' | 'bad';
}

export function StatRow({
  stats,
  hidden,
}: {
  stats: Stat[];
  /** For a single-bucket window, where total, average and peak are one figure. */
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <dl {...stylex.props(styles.row)}>
      {stats.map((stat) => (
        <div key={stat.label} {...stylex.props(styles.stat)}>
          <dt {...stylex.props(styles.label)}>
            {stat.swatch ? (
              <span aria-hidden {...stylex.props(styles.swatch, styles[stat.swatch])} />
            ) : null}
            {stat.label}
          </dt>
          <dd {...stylex.props(styles.value, stat.tone && styles[stat.tone])}>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
