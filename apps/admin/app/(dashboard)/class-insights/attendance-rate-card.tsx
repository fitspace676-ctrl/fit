'use client';

// How many of the booked seats turned up.
//
// The denominator is the MARKED bookings alone — attended plus no-show. An
// unmarked booking on a past class is not a no-show, it is a class nobody wrote
// up, and counting it either way would make this rate a measure of staff
// diligence rather than member behaviour.
//
// Which is why the coverage line under the chart is not decoration: it says how
// much of the window was ever marked, so the rate above it can be read with the
// confidence it has actually earned. A gym marking nothing sees 0% coverage
// rather than a confident number built on three bookings.
//
// `AreaChart` draws a gap for a null bucket rather than a line through zero — the
// same treatment the Members tab's retention trend gets, for the same reason.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { ClassesRatePoint } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function AttendanceRateCard({
  points,
  coverage,
}: {
  points: ClassesRatePoint[];
  /** Share of finished bookings that were marked; `null` — nothing has finished. */
  coverage: number | null;
}) {
  const t = useTranslations('admin.dashboard.classes');
  const locale = useLocale();

  const data: ColumnDatum[] = points.map((point) => ({ label: point.label, value: point.value }));
  // A series that is null the whole way through has nothing to draw a gap AGAINST.
  const hasData = data.some((point) => point.value !== null);
  const rates = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  const latest = rates[rates.length - 1] ?? 0;
  const average = rates.length > 0 ? rates.reduce((sum, v) => sum + v, 0) / rates.length : 0;
  const lowest = rates.length > 0 ? Math.min(...rates) : 0;
  const pct = (value: number) => `${value.toFixed(1)}%`;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="check">{t('attendance.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('attendance.caption')}</p>
      </div>

      {hasData ? (
        <>
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('stats.latest'), value: pct(latest), swatch: 'up' },
              { label: t('stats.average'), value: pct(average) },
              { label: t('stats.lowest'), value: pct(lowest) },
            ]}
          />
          <ColumnChart
            data={data}
            maxValue={100}
            ariaLabel={t('attendance.chartAria')}
            formatValue={(value) => `${Math.round(value)}%`}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('attendance.title')}
            noDataLabel={t('noValue')}
          />
          {data.length > 1 ? (
            <p {...stylex.props(styles.caption)}>{t('attendance.gapNote')}</p>
          ) : null}
        </>
      ) : (
        <EmptyState>{t('attendance.empty')}</EmptyState>
      )}

      {/*
        Rendered whether or not there is a chart: a tab with nothing marked is
        exactly the case where the reader most needs to be told why.
      */}
      <p {...stylex.props(styles.caption)}>
        {coverage === null
          ? t('attendance.coverageUnknown')
          : t('attendance.coverage', { coverage })}
      </p>
    </Card>
  );
}
