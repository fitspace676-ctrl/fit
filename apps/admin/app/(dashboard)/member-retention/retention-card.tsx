'use client';

// The rolling retention rate, with its own 30 / 60 / 90-day control.
//
// This control is CARD-LOCAL, unlike the tab-wide granularity: it changes what
// this one line means and nothing else on the tab reads it. The caption names the
// active window so the number is never ambiguous.
//
// A `null` bucket must reach `AreaChart` as `null`. Mapping it to 0 would draw a
// collapse to zero retention where the truth is that there was nobody to retain —
// a gym's first weeks would look like a catastrophe. The note under the chart
// says what a gap means, because an unexplained break reads as a rendering bug.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import type { RetentionPoint, RetentionWindow } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
import { CardTitle } from '../card-title';

/** The windows the control offers, ascending. */
const WINDOWS = ['30', '60', '90'] as const satisfies readonly RetentionWindow[];

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
  note: {
    margin: 0,
    marginTop: '0.5rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-disabled)',
  },
});

export function RetentionCard({
  points,
  window,
  onSelectWindow,
  disabled,
}: {
  points: RetentionPoint[];
  window: RetentionWindow;
  onSelectWindow: (next: RetentionWindow) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  // `null` passes straight through — see this file's header.
  const data: ColumnDatum[] = points.map((point) => ({ label: point.label, value: point.value }));
  const measured = points.filter((point) => point.value !== null);
  const hasData = measured.length > 0;
  const hasGap = measured.length !== points.length;
  const rates = measured.map((point) => point.value ?? 0);
  const latest = rates[rates.length - 1] ?? 0;
  const average = rates.length > 0 ? rates.reduce((sum, v) => sum + v, 0) / rates.length : 0;
  const lowest = rates.length > 0 ? Math.min(...rates) : 0;
  const pct = (value: number) => `${value.toFixed(1)}%`;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="target">{t('retention.title')}</CardTitle>
          <p {...stylex.props(styles.caption)}>{t('retention.caption', { days: window })}</p>
        </div>
        <SegmentedControl
          value={window}
          onChange={(next) => onSelectWindow(next as RetentionWindow)}
          label={t('retention.windowLabel')}
          size="sm"
          isDisabled={disabled}
        >
          {WINDOWS.map((value) => (
            <SegmentedControlItem
              key={value}
              value={value}
              label={t(`retention.window.${value}`)}
            />
          ))}
        </SegmentedControl>
      </div>

      {hasData ? (
        <>
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('retention.latest'), value: pct(latest), swatch: 'up' },
              { label: t('retention.average'), value: pct(average) },
              { label: t('retention.lowest'), value: pct(lowest) },
            ]}
          />
          <ColumnChart
            data={data}
            maxValue={100}
            ariaLabel={t('retention.chartAria')}
            formatValue={(value) => `${Math.round(value)}%`}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('retention.title')}
            noDataLabel={t('retention.noData')}
          />
          {hasGap ? <p {...stylex.props(styles.note)}>{t('retention.gapNote')}</p> : null}
        </>
      ) : (
        <EmptyState>{t('retention.empty')}</EmptyState>
      )}
    </Card>
  );
}
