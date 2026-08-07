'use client';

// Revenue over time — and the tab's two controls.
//
// The controls live here (this is the card they most obviously belong to) but
// their state is lifted to `SalesView`: both scope the WHOLE tab. Scoping them to
// this card alone would leave the KPI strip describing one window and this chart
// another, and the two sets of numbers would not reconcile.
//
// The x-axis shows the first and last bucket only. Thirty `YYYY-MM-DD` labels in
// a 640-unit viewBox is an unreadable smear; the chart carries the shape and the
// caption carries the total.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
  SALES_GRANULARITIES,
  SALES_PRODUCT_TYPES,
  type ReportSeriesPoint,
  type SalesGranularity,
  type SalesProductType,
} from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';

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
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    flexShrink: 0,
  },
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

export function SalesTrendCard({
  points,
  granularity,
  productType,
  total,
  money,
  onSelectGranularity,
  onSelectProductType,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: SalesGranularity;
  productType: SalesProductType;
  /** Net revenue across the window, MINOR units. */
  total: number;
  money: Intl.NumberFormat;
  onSelectGranularity: (next: SalesGranularity) => void;
  onSelectProductType: (next: SalesProductType) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: AreaPoint[] = points.map((point) => ({
    label: point.label,
    value: point.value / 100,
  }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('trend.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('trend.caption', {
              window: t(`window.${granularity}`),
              productType: t(`productType.${productType}`),
              total: money.format(total / 100),
            })}
          </p>
        </div>
        <div {...stylex.props(styles.controls)}>
          <SegmentedControl
            value={granularity}
            onChange={(next) => onSelectGranularity(next as SalesGranularity)}
            label={t('granularityLabel')}
            size="sm"
            isDisabled={disabled}
          >
            {SALES_GRANULARITIES.map((value) => (
              <SegmentedControlItem key={value} value={value} label={t(`granularity.${value}`)} />
            ))}
          </SegmentedControl>
          <SegmentedControl
            value={productType}
            onChange={(next) => onSelectProductType(next as SalesProductType)}
            label={t('productTypeLabel')}
            size="sm"
            isDisabled={disabled}
          >
            {SALES_PRODUCT_TYPES.map((value) => (
              <SegmentedControlItem key={value} value={value} label={t(`productType.${value}`)} />
            ))}
          </SegmentedControl>
        </div>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('trend.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('trend.empty')}</EmptyState>
      )}
    </Card>
  );
}

/** A `YYYY-MM-DD` bucket start as a locale short date. UTC in, UTC out. */
export function formatBucket(locale: string, bucket: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${bucket}T00:00:00.000Z`));
}
