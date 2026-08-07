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
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type ClassesGranularity, type ReportSeriesPoint } from '@fit/types';
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

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('bookings.title')}</h2>
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
          <AreaChart data={data} ariaLabel={t('bookings.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('bookings.empty')}</EmptyState>
      )}
    </Card>
  );
}
