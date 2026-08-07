'use client';

import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { DashboardOverviewResponse, DashboardRange } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from './format';

/** The range values offered by the segmented control, in ascending span order. */
const RANGE_VALUES = ['7d', '30d', '12w'] as const satisfies readonly DashboardRange[];

/** i18n keys (under `admin.dashboard.weekdays`) indexed by JS day-of-week (0 = Sun). */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

const styles = stylex.create({
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  revenueHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  sectionLabel: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
  revenueCaption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  rangeControl: {
    flexShrink: 0,
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

/* -------------------------------------------------------------------------- */
/*  Revenue                                                                    */
/* -------------------------------------------------------------------------- */

export function RevenueCard({
  data,
  money,
  onSelectRange,
  disabled,
}: {
  data: DashboardOverviewResponse;
  money: Intl.NumberFormat;
  onSelectRange: (next: DashboardRange) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard');
  const points: AreaPoint[] = data.revenue.series.map((p) => ({
    // Money is carried in MINOR units; the chart plots major units.
    label: t(`weekdays.${WEEKDAY_KEYS[new Date(`${p.date}T00:00:00.000Z`).getUTCDay()]}`),
    value: p.value / 100,
  }));
  const hasData = points.some((p) => p.value !== null && p.value > 0);

  return (
    <Card variant="default" padding={0} xstyle={styles.cardWide}>
      <div {...stylex.props(styles.revenueHead)}>
        <div>
          <h2 {...stylex.props(styles.sectionLabel)}>{t('revenueCard.title')}</h2>
          <p {...stylex.props(styles.revenueCaption)}>
            {t('revenueCard.caption', {
              range: t(rangeCaptionKey(data.revenue.range)),
              total: money.format(data.revenue.total / 100),
            })}
          </p>
        </div>
        <SegmentedControl
          value={data.revenue.range}
          onChange={(next) => onSelectRange(next as DashboardRange)}
          label={t('revenueCard.rangeAria')}
          size="sm"
          isDisabled={disabled}
          xstyle={styles.rangeControl}
        >
          {RANGE_VALUES.map((value) => (
            <SegmentedControlItem key={value} value={value} label={t(`ranges.${value}`)} />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <AreaChart data={points} ariaLabel={t('revenueCard.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            {points.map((p, i) => (
              <span key={i}>{p.label}</span>
            ))}
          </div>
        </>
      ) : (
        <EmptyState>{t('revenueCard.empty')}</EmptyState>
      )}
    </Card>
  );
}

/** i18n key (under `admin.dashboard`) for a range's human caption. */
function rangeCaptionKey(range: DashboardRange): string {
  switch (range) {
    case '7d':
      return 'revenueCard.range7d';
    case '30d':
      return 'revenueCard.range30d';
    case '12w':
      return 'revenueCard.range12w';
  }
}
