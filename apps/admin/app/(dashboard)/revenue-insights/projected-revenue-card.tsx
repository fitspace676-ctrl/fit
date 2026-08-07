'use client';

// What is scheduled to arrive, day by day, and what is already late.
//
// Not a forecast: every point is a charge an existing subscription's own billing
// date has already set. Nothing here models growth or churn — a number that
// guessed would be worth less than the one that does not.
//
// The at-risk line beneath is deliberately OUTSIDE the total. Past-due money is
// late, not upcoming, and folding it in would let a collection problem read as a
// healthy week. It is shown here rather than hidden because "what is coming in" is
// only honest next to what is being chased.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { PROJECTION_WINDOW_DAYS, type ProjectedRevenue, type ProjectionWindow } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
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
  axisRow: {
    marginTop: '0.25rem',
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
  // The late money, in the error tone so it never reads as part of the total above.
  atRisk: {
    margin: 0,
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-error)',
  },
});

/** The windows offered, in ascending span order. */
const WINDOW_VALUES = ['7', '30'] as const satisfies readonly ProjectionWindow[];

export function ProjectedRevenueCard({
  projected,
  window,
  money,
  onSelectWindow,
  disabled,
}: {
  projected: ProjectedRevenue;
  window: ProjectionWindow;
  money: Intl.NumberFormat;
  onSelectWindow: (next: ProjectionWindow) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  const data: AreaPoint[] = projected.points.map((point) => ({
    label: point.label,
    value: point.value,
  }));
  const hasData = data.some((point) => point.value !== 0);
  const first = projected.points[0]?.label;
  const last = projected.points[projected.points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('projected.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('projected.caption', {
              total: money.format(projected.total / 100),
              days: PROJECTION_WINDOW_DAYS[window],
            })}
          </p>
        </div>
        <SegmentedControl
          value={window}
          onChange={(next) => onSelectWindow(next as ProjectionWindow)}
          label={t('projected.windowLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {WINDOW_VALUES.map((value) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={t(`projected.window.${value}`)}
            />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('projected.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('projected.empty')}</EmptyState>
      )}

      {projected.atRiskCount > 0 ? (
        <p {...stylex.props(styles.atRisk)}>
          {t('projected.atRisk', {
            count: projected.atRiskCount,
            total: money.format(projected.atRiskTotal / 100),
          })}
        </p>
      ) : null}
    </Card>
  );
}
