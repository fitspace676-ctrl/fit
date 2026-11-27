'use client';

// The monthly value of the paid subscription base, over the tab's window.
//
// "Paid" excludes trials (not yet charged), past-due (charged, not collected) and
// frozen (paused) plans. A yearly plan is divided by twelve so one line can carry
// both intervals.
//
// The note under the chart is not decoration: there is no status history in the
// schema, so earlier buckets are reconstructed from today's rows. Stating that on
// the card is cheaper than an owner discovering it from a number that will not
// reconcile with their books.
//
// No control of its own — the trend card above owns the granularity, because it
// scopes the whole tab.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { ReportSeriesPoint } from '@fit/types';
import { LevelChart, type LevelDatum } from '../level-chart';
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

export function RecurringRevenueCard({
  points,
  current,
  money,
}: {
  points: ReportSeriesPoint[];
  /** MRR right now, for the caption. */
  current: number;
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const locale = useLocale();

  // Money is carried in MINOR units; the chart plots major units. MRR is a
  // level, so it is read against its own range, start to end.
  const data: LevelDatum[] = points.map((point) => ({
    label: point.label,
    value: point.value / 100,
  }));
  const hasData = data.some((point) => point.value !== 0);
  const start = data[0]?.value ?? 0;
  const end = data[data.length - 1]?.value ?? 0;
  const change = end - start;
  const changePct = start > 0 ? (change / start) * 100 : null;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="retry">{t('mrr.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>
          {t('mrr.caption', { total: money.format(current / 100) })}
        </p>
      </div>

      {hasData ? (
        <>
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('mrr.start'), value: money.format(start) },
              { label: t('mrr.end'), value: money.format(end), swatch: 'up' },
              {
                label: t('mrr.change'),
                value: `${change > 0 ? '+' : ''}${money.format(change)}${
                  changePct === null ? '' : ` (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%)`
                }`,
                tone: change > 0 ? 'good' : change < 0 ? 'bad' : undefined,
              },
            ]}
          />
          <LevelChart
            data={data}
            ariaLabel={t('mrr.chartAria')}
            formatValue={(value) => money.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('mrr.point')}
          />
          <p {...stylex.props(styles.caption)}>{t('mrr.note')}</p>
        </>
      ) : (
        <EmptyState>{t('mrr.empty')}</EmptyState>
      )}
    </Card>
  );
}
