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
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
  SALES_GRANULARITIES,
  SALES_PRODUCT_TYPES,
  type ReportSeriesPoint,
  type SalesGranularity,
  type SalesProductType,
} from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { EmptyState } from '../overview/format';
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
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    // Deliberately NOT `flexShrink: 0`. These are two segmented controls, not
    // one: side by side they run ~550px in English and ~610px in Georgian, and
    // an unshrinkable flex item is sized from its single-line max-content, so
    // its own `flexWrap` could never engage. `Card` clips its overflow, so the
    // excess would not scroll — the trailing product-type segments would simply
    // be cut off and unclickable, which is what happened at ordinary laptop
    // widths in Georgian. Letting it shrink is what lets the row wrap instead.
  },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function SalesTrendCard({
  points,
  granularity,
  windowLabel,
  productType,
  total,
  money,
  onSelectGranularity,
  onSelectProductType,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: SalesGranularity;
  /** The window the response covers, named by the view; falls back to the rolling label. */
  windowLabel?: string;
  productType: SalesProductType;
  /** Net revenue across the window, MINOR units. */
  total: number;
  money: NumberFormatter;
  onSelectGranularity: (next: SalesGranularity) => void;
  onSelectProductType: (next: SalesProductType) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.sales');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: ColumnDatum[] = points.map((point) => ({
    label: point.label,
    value: point.value / 100,
  }));
  const hasData = data.some((point) => point.value !== 0);

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="chart">{t('trend.title')}</CardTitle>
          <p {...stylex.props(styles.caption)}>
            {t('trend.caption', {
              window: windowLabel ?? t(`window.${granularity}`),
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
        <ColumnChart
          data={data}
          ariaLabel={t('trend.chartAria')}
          formatValue={(value) => money.format(value)}
          formatLabel={(label) => formatBucket(locale, label)}
          valueName={t('trend.net')}
          meanLabel={t('trend.mean')}
        />
      ) : (
        <EmptyState>{t('trend.empty')}</EmptyState>
      )}
    </Card>
  );
}
