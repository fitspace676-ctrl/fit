'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Card } from '@fit/ui-kit';
import type { NumberFormatter } from '@fit/i18n';
import * as stylex from '@stylexjs/stylex';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { DashboardOverviewResponse, DashboardRange } from '@fit/types';
import { EmptyState } from './format';
import { CardTitle } from '../card-title';

/** The range values offered by the segmented control, in ascending span order. */
const RANGE_VALUES = ['7d', '30d', '12w'] as const satisfies readonly DashboardRange[];

/** i18n keys (under `admin.dashboard.weekdays`) indexed by JS day-of-week (0 = Sun). */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Above this many columns the axis labels thin out and the figures leave the bars. */
const DENSE_COLUMNS = 12;

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const styles = stylex.create({
  cardWide: {
    display: 'flex',
    flexDirection: 'column',
    padding: '1.25rem',
  },
  revenueHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '1.25rem',
  },
  // The window's total is the card's headline; the chart explains it.
  total: {
    display: 'block',
    marginTop: '0.375rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '2rem',
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.025em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  revenueCaption: {
    margin: 0,
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  rangeControl: {
    flexShrink: 0,
  },
  // Columns, not a smoothed curve: a day's takings are a quantity on that day,
  // and a curve drawn between days invents revenue on the days around a spike.
  plot: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-end',
    height: '11rem',
    paddingTop: '1.25rem',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
    // Three quiet guides at quarter heights, so a bar's size reads against something.
    backgroundImage:
      'linear-gradient(to bottom, transparent calc(100% - 1px), var(--chart-guide) calc(100% - 1px))',
    backgroundSize: '100% 25%',
    backgroundPosition: '0 100%',
  },
  plotGap: { gap: '0.5rem' },
  plotGapDense: { gap: '0.1875rem' },
  column: {
    position: 'relative',
    flex: 1,
    minWidth: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    maxWidth: '3rem',
    borderTopLeftRadius: '0.375rem',
    borderTopRightRadius: '0.375rem',
    backgroundColor: 'var(--chart-series-1)',
    backgroundImage:
      'linear-gradient(to top, color-mix(in srgb, var(--chart-series-1) 55%, transparent), var(--chart-series-1))',
    opacity: { default: 0.75, ':hover': 1 },
    transitionProperty: 'opacity',
    transitionDuration: '150ms',
    transitionTimingFunction: EASE_OUT,
  },
  // The latest bucket is "now" — the one the eye should land on.
  barCurrent: {
    opacity: 1,
  },
  // A day with nothing taken: a hairline stub, so the day is visibly there.
  barEmpty: {
    height: '3px',
    opacity: 1,
    backgroundColor: 'var(--color-border)',
    backgroundImage: 'none',
  },
  figure: {
    marginBottom: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    color: 'var(--color-text-primary)',
  },
  axisRow: {
    display: 'flex',
    marginTop: '0.5rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  axisLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'visible',
  },
  axisCurrent: {
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  // Two figures the chart implies but makes you compute: the typical bucket and the best one.
  stats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '0.75rem',
    marginTop: '1.25rem',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    paddingBlock: '0.75rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
  },
  statLabel: {
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  statValue: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  statNote: {
    fontWeight: 500,
    fontSize: '0.75rem',
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
  money: NumberFormatter;
  onSelectRange: (next: DashboardRange) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard');
  const range = data.revenue.range;
  const columns = data.revenue.series.map((p) => {
    const date = new Date(`${p.date}T00:00:00.000Z`);
    return {
      // Money is carried in MINOR units; the chart plots major units.
      value: (p.value ?? 0) / 100,
      label:
        range === '7d'
          ? t(`weekdays.${WEEKDAY_KEYS[date.getUTCDay()]}`)
          : `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    };
  });
  const hasData = columns.some((c) => c.value > 0);
  const max = Math.max(1, ...columns.map((c) => c.value));
  const dense = columns.length > DENSE_COLUMNS;
  // Thin the axis so labels never collide: every label at a week's width, about
  // six across a month.
  const labelEvery = dense ? Math.ceil(columns.length / 6) : 1;
  const last = columns.length - 1;
  const average = columns.length > 0 ? data.revenue.total / 100 / columns.length : 0;
  const peak = columns.reduce((best, c) => (c.value > best.value ? c : best), {
    value: 0,
    label: '',
  });

  return (
    <Card padding="none" xstyle={styles.cardWide}>
      <div {...stylex.props(styles.revenueHead)}>
        <div>
          <CardTitle icon="chart">{t('revenueCard.title')}</CardTitle>
          <span {...stylex.props(styles.total)}>{money.format(data.revenue.total / 100)}</span>
          <p {...stylex.props(styles.revenueCaption)}>{t(rangeCaptionKey(range))}</p>
        </div>
        <SegmentedControl
          value={range}
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
          <div
            role="img"
            aria-label={t('revenueCard.chartAria')}
            {...stylex.props(styles.plot, dense ? styles.plotGapDense : styles.plotGap)}
          >
            {columns.map((column, i) => (
              <div
                key={i}
                title={`${column.label}: ${money.format(column.value)}`}
                {...stylex.props(styles.column)}
              >
                {!dense && column.value > 0 ? (
                  <span
                    data-fade
                    style={
                      {
                        '--fade-delay': `${520 + Math.round((i / Math.max(1, last)) * 280)}ms`,
                      } as CSSProperties
                    }
                    {...stylex.props(styles.figure)}
                  >
                    {money.format(column.value)}
                  </span>
                ) : null}
                <span
                  {...stylex.props(
                    styles.bar,
                    i === last && styles.barCurrent,
                    column.value <= 0 && styles.barEmpty,
                  )}
                  data-grow={column.value > 0 ? 'up' : undefined}
                  style={
                    column.value > 0
                      ? ({
                          height: `${Math.max(4, (column.value / max) * 100)}%`,
                          '--grow-delay': `${200 + Math.round((i / Math.max(1, last)) * 280)}ms`,
                        } as CSSProperties)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
          <div aria-hidden {...stylex.props(styles.axisRow)}>
            {columns.map((column, i) => (
              <span key={i} {...stylex.props(styles.axisLabel, i === last && styles.axisCurrent)}>
                {i % labelEvery === 0 || i === last ? column.label : ''}
              </span>
            ))}
          </div>
          <dl {...stylex.props(styles.stats)}>
            <div {...stylex.props(styles.stat)}>
              <dt {...stylex.props(styles.statLabel)}>{t('revenueCard.average')}</dt>
              <dd {...stylex.props(styles.statValue)}>{money.format(average)}</dd>
            </div>
            <div {...stylex.props(styles.stat)}>
              <dt {...stylex.props(styles.statLabel)}>{t('revenueCard.peak')}</dt>
              <dd {...stylex.props(styles.statValue)}>
                {money.format(peak.value)}{' '}
                <span {...stylex.props(styles.statNote)}>{peak.label}</span>
              </dd>
            </div>
          </dl>
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
