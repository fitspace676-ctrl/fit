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
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { PROJECTION_WINDOW_DAYS, type ProjectedRevenue, type ProjectionWindow } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
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
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
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
  money: NumberFormatter;
  onSelectWindow: (next: ProjectionWindow) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units.
  const data: ColumnDatum[] = projected.points.map((point) => ({
    label: point.label,
    value: point.value / 100,
  }));
  const hasData = data.some((point) => point.value !== 0);

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="spark">{t('projected.title')}</CardTitle>
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
          <StatRow
            hidden={data.length <= 1}
            stats={[
              {
                label: t('projected.expected'),
                value: money.format(projected.total / 100),
                swatch: 'up',
              },
              // The late money stays OUTSIDE the total above — see this file's header.
              ...(projected.atRiskCount > 0
                ? [
                    {
                      label: t('projected.overdue', { count: projected.atRiskCount }),
                      value: money.format(projected.atRiskTotal / 100),
                      tone: 'bad' as const,
                    },
                  ]
                : []),
            ]}
          />
          <ColumnChart
            data={data}
            ariaLabel={t('projected.chartAria')}
            formatValue={(value) => money.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('projected.expected')}
          />
        </>
      ) : (
        <EmptyState>{t('projected.empty')}</EmptyState>
      )}
    </Card>
  );
}
