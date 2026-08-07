'use client';

// The Staff tab's four numbers, in one container — the Classes tab's treatment.
//
// Three KINDS in four tiles: two counts, one nullable percentage, one hours
// figure. The percentage renders an em-dash when null, because a gym whose
// trainers have no availability set has no utilization rather than none of it.
//
// The caption carries the qualifier the last tile needs: scheduled hours are a
// standing weekly rota, so unlike its three neighbours it does not move when the
// granularity does.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import type { NumberFormatter } from '@fit/i18n';
import type { StaffGranularity, StaffKpis } from '@fit/types';
import type { T } from '../overview/format';

const styles = stylex.create({
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-surface)',
  },
  grid: {
    display: 'grid',
    gap: '1px',
    backgroundColor: 'var(--color-border)',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'var(--color-background-surface)',
  },
  label: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    paddingInline: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The tiles, in reading order, with how each renders. */
const TILES = [
  { key: 'trainersDelivering', kind: 'count' },
  { key: 'sessionsDelivered', kind: 'count' },
  { key: 'utilizationRate', kind: 'rate' },
  { key: 'scheduledHoursPerWeek', kind: 'hours' },
] as const satisfies readonly { key: keyof StaffKpis; kind: 'count' | 'rate' | 'hours' }[];

/**
 * A tile's value as text. `null` is the em-dash, never `0%`.
 *
 * The count goes through the shared formatter rather than `toLocaleString()`,
 * which would format in the RUNTIME's default locale — the server's in Node, the
 * viewer's OS setting in the browser.
 */
function formatTile(
  t: T,
  count: NumberFormatter,
  kind: 'count' | 'rate' | 'hours',
  value: number | null,
): string {
  if (value === null) return t('noValue');
  if (kind === 'rate') return `${value}%`;
  if (kind === 'hours') return `${value}h`;
  return count.format(value);
}

export function StaffKpiStrip({
  kpis,
  granularity,
}: {
  kpis: StaffKpis;
  granularity: StaffGranularity;
}) {
  const t = useTranslations('admin.dashboard.staff');
  const count = createNumberFormat(useLocale());

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile) => (
            <div key={tile.key} {...stylex.props(styles.cell)}>
              <span {...stylex.props(styles.label)}>{t(`kpi.${tile.key}`)}</span>
              <span {...stylex.props(styles.value)}>
                {formatTile(t, count, tile.kind, kpis[tile.key])}
              </span>
            </div>
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', { window: t(`window.${granularity}`) })}
      </p>
    </div>
  );
}
