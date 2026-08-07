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
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { ClassTypeSlice } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  rows: { display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.75rem' },
  row: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem' },
  rowName: { color: 'var(--color-text-primary)' },
  rowMeta: { fontFamily: 'var(--font-family-code)', color: 'var(--color-text-secondary)' },
});

export function TopClassTypesCard({ slices }: { slices: ClassTypeSlice[] }) {
  const t = useTranslations('admin.dashboard.classes');
  const data: BarDatum[] = slices.map((slice) => ({
    label: slice.name,
    value: slice.seatsBooked,
  }));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('topTypes.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('topTypes.caption')}</p>
      </div>

      <BarChart data={data} emptyLabel={t('topTypes.empty')} />

      <ul {...stylex.props(styles.rows)}>
        {slices.map((slice) => (
          <li key={slice.name} {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowName)}>{slice.name}</span>
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
    </Card>
  );
}
