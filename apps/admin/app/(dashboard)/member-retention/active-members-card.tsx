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

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type MembersGranularity, type ReportSeriesPoint } from '@fit/types';
import { LevelChart, type LevelDatum } from '../level-chart';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
import { createNumberFormat } from '@fit/i18n';
import { CardTitle } from '../card-title';
import { StatRow } from '../stat-row';

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

export function ActiveMembersCard({
  points,
  granularity,
  windowLabel,
  current,
  onSelectGranularity,
  disabled,
}: {
  points: ReportSeriesPoint[];
  granularity: MembersGranularity;
  /** The window the response covers, named by the view; falls back to the rolling label. */
  windowLabel?: string;
  /** The live member count right now, for the caption. */
  current: number;
  onSelectGranularity: (next: MembersGranularity) => void;
  disabled: boolean;
}) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();

  const data: LevelDatum[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const count = createNumberFormat(locale);
  // A headcount is a level, not a flow: the reader wants where it started, where
  // it is, and the difference, before the curve between them.
  const start = points.find((point) => point.value !== null)?.value ?? 0;
  const change = current - start;
  const changePct = start > 0 ? (change / start) * 100 : null;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="users">{t('active.title')}</CardTitle>
          <p {...stylex.props(styles.caption)}>
            {t('active.caption', {
              window: windowLabel ?? t(`window.${granularity}`),
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
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('active.start'), value: count.format(start) },
              { label: t('active.now'), value: count.format(current), swatch: 'up' },
              {
                label: t('active.change'),
                value: `${change > 0 ? '+' : ''}${count.format(change)}${
                  changePct === null ? '' : ` (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%)`
                }`,
                tone: change > 0 ? 'good' : change < 0 ? 'bad' : undefined,
              },
            ]}
          />
          <LevelChart
            data={data}
            integer
            ariaLabel={t('active.chartAria')}
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('active.point')}
          />
        </>
      ) : (
        <EmptyState>{t('active.empty')}</EmptyState>
      )}
    </Card>
  );
}
