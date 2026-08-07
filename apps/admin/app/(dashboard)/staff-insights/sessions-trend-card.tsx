'use client';

// Sessions delivered over the tab's window, split by what was delivered.
//
// Both series are work done, so the secondary is drawn in the NEUTRAL tone: a
// trainer base that has shifted from group classes to one-to-one has not
// developed a problem, it has changed shape, and the error tone would say
// otherwise.
//
// A class with no trainer assigned is in NEITHER series — somebody taught it and
// this tab does not know who. The gaps card counts those rather than guessing.
//
// The control lives here but its state is lifted to `RevenueView`: it scopes the
// whole tab. Scoping it to this card alone would leave the KPI strip describing one
// window and this chart another.

import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type SessionsPoint, type StaffGranularity } from '@fit/types';
import { DualAreaChart, SeriesSwatch, type DualPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { createNumberFormat } from '@fit/i18n';
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

export function SessionsTrendCard({
  points,
  granularity,
  onSelectGranularity,
  disabled,
}: {
  points: SessionsPoint[];
  granularity: StaffGranularity;
  onSelectGranularity: (next: StaffGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.staff');
  const locale = useLocale();
  const count = createNumberFormat(locale);

  const data: DualPoint[] = points.map((point) => ({
    label: point.label,
    primary: point.classes,
    secondary: point.pt,
  }));
  const hasData = data.some((point) => point.primary !== 0 || point.secondary !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('sessions.title')}</h2>
          <p {...stylex.props(styles.caption)}>{t('sessions.caption')}</p>
        </div>
        <SegmentedControl
          value={granularity}
          onChange={(next) => onSelectGranularity(next as StaffGranularity)}
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
            ariaLabel={t('sessions.chartAria')}
            secondaryTone="neutral"
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            primaryLabel={t('sessions.classes')}
            secondaryLabel={t('sessions.pt')}
          />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesSwatch tone="primary" />
              {t('sessions.classes')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesSwatch tone="neutral" />
              {t('sessions.pt')}
            </span>
          </div>
        </>
      ) : (
        <EmptyState>{t('sessions.empty')}</EmptyState>
      )}
    </Card>
  );
}
