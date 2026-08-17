'use client';

// Total active members over time, and the tab's granularity control.
//
// The control lives here but its state is lifted to `MembersView`: it scopes the
// whole tab. Scoping it to this card alone would leave the KPI strip describing
// one window and this chart another.
//
// "Active" means a subscription in `LIVE_SUBSCRIPTION_STATUSES`, which INCLUDES
// frozen: a paused membership is still a membership and still resumes. That is a
// different set from the one the at-risk list uses, and the difference is
// deliberate — see the service.
//
// The x-axis shows the first and last bucket only. Thirty `YYYY-MM-DD` labels in a
// 640-unit viewBox is an unreadable smear.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type MembersGranularity, type ReportSeriesPoint } from '@fit/types';
import { AreaChart, type AreaPoint } from '../charts';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
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

export function ActiveMembersCard({
  points,
  granularity,
  current,
  onSelectGranularity,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: MembersGranularity;
  /** The live member count right now, for the caption. */
  current: number;
  onSelectGranularity: (next: MembersGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <h2 {...stylex.props(styles.title)}>{t('active.title')}</h2>
          <p {...stylex.props(styles.caption)}>
            {t('active.caption', {
              window: t(`window.${granularity}`),
              total: createNumberFormat(locale).format(current),
            })}
          </p>
        </div>
        <SegmentedControl
          value={granularity}
          onChange={(next) => onSelectGranularity(next as MembersGranularity)}
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
          <AreaChart data={data} ariaLabel={t('active.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
        </>
      ) : (
        <EmptyState>{t('active.empty')}</EmptyState>
      )}
    </Card>
  );
}
