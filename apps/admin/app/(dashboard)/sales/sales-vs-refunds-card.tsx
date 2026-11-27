'use client';

// New sales against refunds, over the tab's window.
//
// Both series are dated by when the money actually moved: sales by the payment's
// `createdAt`, refunds by the refund's own. That is deliberately NOT how the
// "Refunded" KPI is computed (it sums this window's payments' running refunded
// totals), so the two can legitimately differ. The caption says which this is.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { SalesComparisonPoint } from '@fit/types';
import { StatRow } from '../stat-row';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { EmptyState } from '../overview/format';
import type { NumberFormatter } from '@fit/i18n';
import { formatBucket } from '../format';
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
});

export function SalesVsRefundsCard({
  points,
  money,
}: {
  points: SalesComparisonPoint[];
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: ColumnDatum[] = points.map((point) => ({
    label: point.label,
    value: point.sales / 100,
    negative: point.refunds / 100,
  }));
  const hasData = data.some((point) => point.value !== 0 || point.negative !== 0);
  const salesTotal = points.reduce((sum, point) => sum + point.sales, 0) / 100;
  const refundsTotal = points.reduce((sum, point) => sum + point.refunds, 0) / 100;
  const refundRate = salesTotal > 0 ? (refundsTotal / salesTotal) * 100 : 0;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="retry">{t('vsRefunds.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('vsRefunds.caption')}</p>
      </div>

      {hasData ? (
        <>
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('vsRefunds.sales'), value: money.format(salesTotal), swatch: 'up' },
              {
                label: t('vsRefunds.refunds'),
                value: money.format(refundsTotal),
                swatch: 'down',
                tone: refundsTotal > 0 ? 'bad' : undefined,
              },
              { label: t('vsRefunds.rate'), value: `${refundRate.toFixed(1)}%` },
            ]}
          />
          <ColumnChart
            data={data}
            ariaLabel={t('vsRefunds.chartAria')}
            formatValue={(value) => money.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('vsRefunds.sales')}
            negativeName={t('vsRefunds.refunds')}
            height={180}
          />
        </>
      ) : (
        <EmptyState>{t('vsRefunds.empty')}</EmptyState>
      )}
    </Card>
  );
}
