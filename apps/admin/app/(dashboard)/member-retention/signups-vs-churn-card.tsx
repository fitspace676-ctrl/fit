'use client';

// Joins against memberships that ended, over the tab's window.
//
// `DualAreaChart` scales both series to a SHARED maximum, which is the whole
// point here: a month with 40 joins and 3 cancellations must LOOK like that. Two
// independently-scaled series would draw them the same height.
//
// Churn is dated by a subscription's terminal instant — `canceledAt` for a
// cancellation, `updatedAt` for an expiry — not by when its period would have run
// out.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { SignupsChurnPoint } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import { createNumberFormat } from '@fit/i18n';
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

export function SignupsVsChurnCard({ points }: { points: SignupsChurnPoint[] }) {
  const t = useTranslations('admin.dashboard.members');
  const locale = useLocale();
  const count = createNumberFormat(locale);

  const data: ColumnDatum[] = points.map((point) => ({
    label: point.label,
    value: point.signups,
    negative: point.churned,
  }));
  const hasData = data.some((point) => point.value !== 0 || point.negative !== 0);
  const signups = points.reduce((sum, point) => sum + point.signups, 0);
  const churned = points.reduce((sum, point) => sum + point.churned, 0);
  const net = signups - churned;

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="arrowUp">{t('signupsVsChurn.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('signupsVsChurn.caption')}</p>
      </div>

      {hasData ? (
        <>
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('signupsVsChurn.signups'), value: count.format(signups), swatch: 'up' },
              { label: t('signupsVsChurn.churned'), value: count.format(churned), swatch: 'down' },
              {
                label: t('signupsVsChurn.net'),
                value: `${net > 0 ? '+' : ''}${count.format(net)}`,
                tone: net > 0 ? 'good' : net < 0 ? 'bad' : undefined,
              },
            ]}
          />
          <ColumnChart
            data={data}
            integer
            ariaLabel={t('signupsVsChurn.chartAria')}
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('signupsVsChurn.signups')}
            negativeName={t('signupsVsChurn.churned')}
          />
        </>
      ) : (
        <EmptyState>{t('signupsVsChurn.empty')}</EmptyState>
      )}
    </Card>
  );
}
