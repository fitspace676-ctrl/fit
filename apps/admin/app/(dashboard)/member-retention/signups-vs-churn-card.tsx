'use client';

// Joins against memberships that ended, over the tab's window.
//
// `DualAreaChart` scales both series to a SHARED maximum, which is the whole
// point here: a month with 40 joins and 3 cancellations must LOOK like that. Two
// independently-scaled series would draw them the same height.
//
// Churn is dated by a subscription's terminal instant — `canceledAt` for a
// cancellation, `updatedAt` for an expiry — not by when its period would have run
// out.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { SignupsChurnPoint } from '@fit/types';
import { DualAreaChart, SeriesSwatch, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { createNumberFormat } from '@fit/i18n';
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
  legend: {
    display: 'flex',
    gap: '1rem',
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '0.375rem' },
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function SignupsVsChurnCard({ points }: { points: SignupsChurnPoint[] }) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();
  const count = createNumberFormat(locale);

  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.signups,
    secondary: point.churned,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('signupsVsChurn.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('signupsVsChurn.caption')}</p>
      </div>

      {hasData ? (
        <>
          <DualAreaChart
            data={data}
            ariaLabel={t('signupsVsChurn.chartAria')}
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            primaryLabel={t('signupsVsChurn.signups')}
            secondaryLabel={t('signupsVsChurn.churned')}
          />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesSwatch tone="primary" />
              {t('signupsVsChurn.signups')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesSwatch tone="negative" />
              {t('signupsVsChurn.churned')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('signupsVsChurn.empty')}</EmptyState>
      )}
    </Card>
  );
}
