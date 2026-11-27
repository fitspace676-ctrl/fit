'use client';

// One cell of a segment tab's KPI strip — the overview strip's treatment, shared.
//
// A tinted glyph names the figure as well as its label does; the lead figure of a
// tab (`hero`) sits on the console's accent fill. The strips keep their own grid
// and hairlines; this is only what goes inside a cell.

import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Icon, type IconName } from '@/components/ui';

const styles = stylex.create({
  cell: {
    // `relative` anchors a sparkline, which is absolutely positioned against this
    // box and bleeds off its bottom edge.
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    paddingBlock: '1.125rem',
    paddingInline: '1.25rem',
    backgroundColor: 'var(--color-background-surface)',
  },
  // Reserves the band a sparkline occupies, so the numeral never sits on its curve.
  sparked: {
    paddingBottom: '2.75rem',
  },
  hero: {
    backgroundColor: 'var(--color-accent)',
    backgroundImage:
      'radial-gradient(120% 140% at 100% 0%, rgb(255 255 255 / 0.22), transparent 60%)',
    // A sparkline on the accent fill draws in the fill's own ink.
    '--chart-series-1': 'var(--color-on-accent)',
    '--chart-glow-1': 'color-mix(in srgb, var(--color-on-accent) 30%, transparent)',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  chip: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    width: '2rem',
    height: '2rem',
    borderRadius: 'var(--radius-inner)',
    color: 'var(--brand-ink)',
    backgroundColor: 'var(--brand-tint)',
  },
  glyph: {
    width: '1rem',
    height: '1rem',
  },
  heroChip: {
    color: 'var(--color-on-accent)',
    backgroundColor: 'color-mix(in srgb, var(--color-on-accent) 14%, transparent)',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
    lineHeight: 1.35,
    color: 'var(--color-text-secondary)',
  },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.75rem',
    lineHeight: 1.15,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  heroInk: {
    color: 'var(--color-on-accent)',
  },
  heroMuted: {
    color: 'color-mix(in srgb, var(--color-on-accent) 72%, transparent)',
  },
});

export function KpiTile({
  icon,
  hero,
  label,
  value,
  hint,
  sparkline,
}: {
  icon: IconName;
  hero?: boolean;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** A `Sparkline`, or null when the figure has no honest series. */
  sparkline?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.cell, sparkline ? styles.sparked : null, hero && styles.hero)}>
      <span {...stylex.props(styles.head)}>
        <span aria-hidden {...stylex.props(styles.chip, hero && styles.heroChip)}>
          <Icon name={icon} {...stylex.props(styles.glyph)} />
        </span>
        <span {...stylex.props(styles.label, hero && styles.heroMuted)}>{label}</span>
      </span>
      <span {...stylex.props(styles.value, hero && styles.heroInk)}>{value}</span>
      {hint ? <span {...stylex.props(styles.hint, hero && styles.heroMuted)}>{hint}</span> : null}
      {sparkline}
    </div>
  );
}
