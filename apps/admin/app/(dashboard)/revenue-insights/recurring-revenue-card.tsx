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

  const data: AreaPoint[] = points.map((point) => ({ label: point.label, value: point.value }));
  const hasData = data.some((point) => point.value !== 0);
  const first = points[0]?.label;
  const last = points[points.length - 1]?.label;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('mrr.title')}</h2>
        <p {...stylex.props(styles.caption)}>
          {t('mrr.caption', { total: money.format(current / 100) })}
        </p>
      </div>

      {hasData ? (
        <>
          <AreaChart data={data} ariaLabel={t('mrr.chartAria')} />
          <div {...stylex.props(styles.axisRow)}>
            <span>{first ? formatBucket(locale, first) : null}</span>
            <span>{last ? formatBucket(locale, last) : null}</span>
          </div>
          <p {...stylex.props(styles.caption)}>{t('mrr.note')}</p>
        </>
      ) : (
        <EmptyState>{t('mrr.empty')}</EmptyState>
      )}
    </Card>
  );
}
