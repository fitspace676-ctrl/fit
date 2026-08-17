'use client';

// Seats booked against seats offered.
//
// The expensive number on this tab: a gym commits a trainer and a room to every
// occurrence whether or not anyone books it, so an hour at 20% is a paid hour
// mostly spent empty.
//
// Cancelled occurrences are excluded on both sides — a class called off released
// its room, so it never committed the cost this metric exists to expose. A bucket
// whose classes resolved NO capacity is a gap, not 0%: nothing to fill is a
// different fact from nothing filled.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassesRatePoint } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';

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
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function UtilizationCard({ points }: { points: ClassesRatePoint[] }) {
  const t = useTranslations('admin.dashboard.classes');
  const locale = useLocale();

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  // A series that is null the whole way through has nothing to draw a gap AGAINST.
  const hasData = data.some((point) => point.value !== null);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('utilization.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('utilization.caption')}</p>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('utilization.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <p {...stylex.props(styles.caption)}>{t('utilization.gapNote')}</p>
        </>
      ) : (
        <EmptyState>{t('utilization.empty')}</EmptyState>
      )}
    </Card>
  );
}
