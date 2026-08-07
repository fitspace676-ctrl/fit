'use client';

// Where the takings came from, for a gym that has more than one branch.
//
// The view renders this only when the API sends an ARRAY. A single-location gym
// gets `null` — not an empty list — because the question does not apply to it, and
// an empty chart would be a different, wrong answer.
//
// Only the till/shop stream is attributable: a subscription invoice names no
// location, and inventing one would be a fabricated figure. The caption says that
// rather than letting these bars silently fail to add up to the KPI tile.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import { Card } from '@astryxdesign/core/Card';
import type { RevenueLocationSlice } from '@fit/types';
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
});

export function RevenueByLocationCard({
  slices,
  money,
}: {
  slices: RevenueLocationSlice[];
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const data: BarDatum[] = slices.map((slice) => ({ label: slice.location, value: slice.value }));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('byLocation.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('byLocation.caption')}</p>
      </div>
      <BarChart
        data={data}
        formatValue={(value) => money.format(value / 100)}
        emptyLabel={t('byLocation.empty')}
      />
    </Card>
  );
}
