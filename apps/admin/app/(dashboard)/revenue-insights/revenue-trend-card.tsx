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
import { DualAreaChart, SeriesSwatch, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import type { NumberFormatter } from '@fit/i18n';
import { formatBucket } from '../format';

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

  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.recurring,
    secondary: point.oneOff,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('trend.title')}</h2>
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
          {/*
            `neutral`, not the default: both streams are money coming IN. The error
            tone is reserved for money going back out, and using it here would draw
            the till's takings as if they were a problem.
          */}
          <DualAreaChart
            data={data}
            ariaLabel={t('trend.chartAria')}
            secondaryTone="neutral"
            formatValue={(value) => money.format(value / 100)}
            formatLabel={(label) => formatBucket(locale, label)}
            primaryLabel={t('trend.recurring')}
            secondaryLabel={t('trend.oneOff')}
          />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesSwatch tone="primary" />
              {t('trend.recurring')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesSwatch tone="neutral" />
              {t('trend.oneOff')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('trend.empty')}</EmptyState>
      )}
    </Card>
  );
}
