'use client';

// Revenue over the tab's window, split into the two streams it actually arrives in.
//
// `DualAreaChart` scales both series to a SHARED maximum, which is the point: a
// month where memberships dwarf the till must LOOK like that. Two independently
// scaled series would draw them the same height.
//
// The two are disjoint by construction — subscription invoices carry no `orderId`,
// order takings are counted from the payment — so reading them together in the eye
// is reading the real total.
//
// The control lives here but its state is lifted to `RevenueView`: it scopes the
// whole tab. Scoping it to this card alone would leave the KPI strip describing one
// window and this chart another.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type RevenueGranularity, type RevenueStreamPoint } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import type { NumberFormatter } from '@fit/i18n';
import { formatBucket } from '../format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function RevenueTrendCard({
  points,
  money,
  granularity,
  onSelectGranularity,
  disabled,
}: {
  points: RevenueStreamPoint[];
  /** Formats the tooltip's figures. Both series are MINOR units. */
  money: NumberFormatter;
  granularity: RevenueGranularity;
  onSelectGranularity: (next: RevenueGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units. The till's
  // takings are the column's base and the invoices settled without a payment sit
  // on top, so a column's height is everything that came in that bucket.
  const data: ColumnDatum[] = points.map((point) => ({
    label: point.label,
    value: point.oneOff / 100,
    stack: point.recurring / 100,
  }));
  const hasData = data.some((point) => point.value !== 0 || point.stack !== 0);
  const payments = points.reduce((sum, point) => sum + point.oneOff, 0) / 100;
  const invoiced = points.reduce((sum, point) => sum + point.recurring, 0) / 100;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="chart">{t('trend.title')}</CardTitle>
          <p {...stylex.props(styles.caption)}>{t('trend.caption')}</p>
        </div>
        <SegmentedControl
          value={granularity}
          onChange={(next) => onSelectGranularity(next as RevenueGranularity)}
          label={t('granularityLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {SALES_GRANULARITIES.map((value) => (
            <SegmentedControlItem key={value} value={value} label={t(`granularity.${value}`)} />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('trend.oneOff'), value: money.format(payments), swatch: 'up' },
              { label: t('trend.recurring'), value: money.format(invoiced), swatch: 'stack' },
              { label: t('trend.total'), value: money.format(payments + invoiced) },
            ]}
          />
          <ColumnChart
            data={data}
            ariaLabel={t('trend.chartAria')}
            formatValue={(value) => money.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('trend.oneOff')}
            stackName={t('trend.recurring')}
            totalName={t('trend.total')}
          />
        </>
      ) : (
        <EmptyState>{t('trend.empty')}</EmptyState>
      )}
    </Card>
  );
}
