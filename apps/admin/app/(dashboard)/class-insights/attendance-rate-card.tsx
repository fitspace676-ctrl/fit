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
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  head: { marginBottom: '1rem' },
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

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  // A series that is null the whole way through has nothing to draw a gap AGAINST.
  const hasData = data.some((point) => point.value !== null);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('attendance.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('attendance.caption')}</p>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('attendance.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <p {...stylex.props(styles.caption)}>{t('attendance.gapNote')}</p>
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
