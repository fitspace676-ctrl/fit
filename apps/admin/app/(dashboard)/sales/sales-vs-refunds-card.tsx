'use client';

// New sales against refunds, over the tab's window.
//
// Both series are dated by when the money actually moved: sales by the payment's
// `createdAt`, refunds by the refund's own. That is deliberately NOT how the
// "Refunded" KPI is computed (it sums this window's payments' running refunded
// totals), so the two can legitimately differ. The caption says which this is.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { SalesComparisonPoint } from '@fit/types';
import { DualAreaChart, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from './format';

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
  swatch: { width: '0.75rem', height: '0.1875rem', borderRadius: 'var(--radius-full)' },
  swatchSales: { backgroundColor: 'var(--color-accent)' },
  swatchRefunds: { backgroundColor: 'var(--color-error)' },
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function SalesVsRefundsCard({ points }: { points: SalesComparisonPoint[] }) {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.sales / 100,
    secondary: point.refunds / 100,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('vsRefunds.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('vsRefunds.caption')}</p>
      </div>

      {hasData ? (
        <>
          <DualAreaChart data={data} ariaLabel={t('vsRefunds.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchSales)} aria-hidden="true" />
              {t('vsRefunds.sales')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <span {...stylex.props(styles.swatch, styles.swatchRefunds)} aria-hidden="true" />
              {t('vsRefunds.refunds')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('vsRefunds.empty')}</EmptyState>
      )}
    </Card>
  );
}
