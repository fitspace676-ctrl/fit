'use client';

// The Classes tab's four numbers, in one container — the Revenue tab's treatment,
// and deliberately identical to it so the tabs read as one dashboard.
//
// Two tiles are counts and two are percentages, and the percentages are NULLABLE.
// `null` means "there was nothing to measure" — no marked bookings, or no class
// with any capacity — and it renders as an em-dash. Rendering it as 0% would be a
// confident claim about a fact nobody recorded.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import type { ClassesGranularity, ClassesKpis, DashboardClassesResponse } from '@fit/types';
import { Sparkline } from '../charts';
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
    // `relative` anchors the sparkline, which is absolutely positioned against
    // this box and bleeds off its bottom edge.
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'var(--color-background-surface)',
  },
  // Reserves the band the sparkline occupies, so the numeral never sits on the
  // curve. Only the tiles that HAVE a series get it — an unconditional pad would
  // leave the others looking short of something.
  cellSparked: {
    paddingBottom: '2.25rem',
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

/** The tiles, in reading order. `rate` marks the two carried as percentages. */
const TILES = [
  { key: 'classesHeld', rate: false },
  { key: 'seatsBooked', rate: false },
  { key: 'noShowRate', rate: true },
  { key: 'utilizationRate', rate: true },
] as const satisfies readonly { key: keyof ClassesKpis; rate: boolean }[];

/** A nullable percentage as text: the figure, or the em-dash placeholder. */
function formatRate(t: T, value: number | null): string {
  return value === null ? t('noValue') : `${value}%`;
}

/**
 * The series behind each tile — where one honestly exists.
 *
 * `noShowRate` gets none ON PURPOSE. The payload's `attendanceOverTime` is the
 * ATTENDED share, and attended and no-show are not two sides of one coin: a
 * booking can be marked late-cancelled and belong to neither. Plotting one under
 * the other would be an arithmetic claim the data does not support.
 *
 * `classesHeld` gets none because `bookingsOverTime` counts SEATS, not sessions.
 */
function tileSeries(key: keyof ClassesKpis, data: DashboardClassesResponse) {
  switch (key) {
    case 'seatsBooked':
      return data.bookingsOverTime.map((p) => p.value);
    case 'utilizationRate':
      return data.utilizationOverTime.map((p) => p.value);
    default:
      return null;
  }
}

export function ClassesKpiStrip({
  data,
  granularity,
}: {
  data: DashboardClassesResponse;
  granularity: ClassesGranularity;
}) {
  const kpis = data.kpis;
  const t = useTranslations('admin.dashboard.classes');
  // NOT `toLocaleString()`: that formats in the RUNTIME's default locale, which is
  // the server's in Node and the viewer's OS setting in the browser — the same
  // hydration mismatch the money figures had, waiting for a count above 999.
  const count = createNumberFormat(useLocale());

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile) => {
            const series = tileSeries(tile.key, data);
            return (
              <div key={tile.key} {...stylex.props(styles.cell, series && styles.cellSparked)}>
                <span {...stylex.props(styles.label)}>{t(`kpi.${tile.key}`)}</span>
                <span {...stylex.props(styles.value)}>
                  {tile.rate ? formatRate(t, kpis[tile.key]) : count.format(kpis[tile.key] ?? 0)}
                </span>
                {series && <Sparkline values={series} />}
              </div>
            );
          })}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', { window: t(`window.${granularity}`) })}
      </p>
    </div>
  );
}
