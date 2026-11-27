'use client';

// Seats booked over the tab's window, and the tab's granularity control.
//
// Bucketed by when the CLASS RUNS, not by when the booking was made: the question
// a timetable is planned against is when demand lands, not when it was expressed.
//
// Waitlist entries are absent — they held no seat. They are demand the gym could
// not serve, which is a real figure and a different one from this.
//
// The control lives here but its state is lifted to `ClassesView`: it scopes the
// whole tab. Scoping it to this card alone would leave the KPI strip describing
// one window and this chart another.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type ClassesGranularity, type ReportSeriesPoint } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
import { CardTitle } from '../card-title';
import { createNumberFormat } from '@fit/i18n';

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

export function BookingsTrendCard({
  points,
  granularity,
  onSelectGranularity,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: ClassesGranularity;
  onSelectGranularity: (next: ClassesGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.classes');
  const locale = useLocale();

  const data: ColumnDatum[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const count = createNumberFormat(locale);
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const average = points.length > 0 ? total / points.length : 0;
  const best = points.reduce((top, point) => (point.value > top.value ? point : top), {
    label: '',
    value: 0,
  });

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="chart">{t('bookings.title')}</CardTitle>
          <p {...stylex.props(styles.caption)}>{t('bookings.caption')}</p>
        </div>
        <SegmentedControl
          value={granularity}
          onChange={(next) => onSelectGranularity(next as ClassesGranularity)}
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
              { label: t('stats.total'), value: count.format(total), swatch: 'up' },
              { label: t('stats.average'), value: average.toFixed(1) },
              {
                label: t('stats.best'),
                value: `${count.format(best.value)} · ${formatBucket(locale, best.label)}`,
              },
            ]}
          />
          <ColumnChart
            data={data}
            integer
            ariaLabel={t('bookings.chartAria')}
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('bookings.title')}
            meanLabel={t('stats.average')}
          />
        </>
      ) : (
        <EmptyState>{t('bookings.empty')}</EmptyState>
      )}
    </Card>
  );
}
