'use client';

// Which classes people actually book.
//
// The bars rank by seats, but seats alone hide the thing an owner acts on: a
// class can top this list and still run half empty because it is scheduled
// twelve times. So each row repeats underneath with its session count and its own
// fill rate — a popular class at 40% full is a timetabling problem, and a bar
// chart on its own would never say so.
//
// Capped at eight rows, and the caption says so rather than letting a ninth class
// vanish silently.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import { TOP_CLASS_TYPES } from '@fit/types';
import type { ClassTypeSlice } from '@fit/types';
import { EmptyState } from '../overview/format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  // One row per class type: what it sold, a bar against the leader, and how
  // often it ran and how full — the two lists this card used to print separately.
  rows: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '0.75rem',
    rowGap: '0.3125rem',
    alignItems: 'baseline',
  },
  rowName: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  track: {
    display: 'block',
    gridColumn: '1 / -1',
    height: '0.375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
  },
  rowMeta: {
    gridColumn: '1 / -1',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
});

export function TopClassTypesCard({ slices }: { slices: ClassTypeSlice[] }) {
  const t = useTranslations('admin.dashboard.classes');
  const best = Math.max(1, ...slices.map((slice) => slice.seatsBooked));

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="star">{t('topTypes.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('topTypes.caption', { count: TOP_CLASS_TYPES })}</p>
      </div>

      {slices.length === 0 ? (
        <EmptyState>{t('topTypes.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.rows)}>
          {slices.map((slice) => (
            <li key={slice.name} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowName)} title={slice.name}>
                {slice.name}
              </span>
              <span {...stylex.props(styles.rowValue)}>
                {t('topTypes.seats', { count: slice.seatsBooked })}
              </span>
              <span aria-hidden {...stylex.props(styles.track)}>
                <span
                  {...stylex.props(styles.fill)}
                  data-grow="x"
                  style={{ width: `${Math.max(2, (slice.seatsBooked / best) * 100)}%` }}
                />
              </span>
              <span {...stylex.props(styles.rowMeta)}>
                {t('topTypes.row', {
                  sessions: slice.sessions,
                  // `null` — this class resolved no capacity at all, so how full it
                  // ran is unknowable rather than zero.
                  utilization:
                    slice.utilizationRate === null ? t('noValue') : `${slice.utilizationRate}%`,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
