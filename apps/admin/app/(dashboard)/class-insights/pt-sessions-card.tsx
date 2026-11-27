'use client';

// One-to-one sessions over the tab's window.
//
// A different business from the timetable beside it — no capacity, no seats, no
// attendance to mark — which is why it is a bare count and sits in the rail
// rather than competing with the class trends for the main column.
//
// Cancelled sessions are excluded at the database, not here.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import type { ReportSeriesPoint } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import { formatBucket } from '../format';
import { CardTitle } from '../card-title';
import { createNumberFormat } from '@fit/i18n';

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

export function PtSessionsCard({ points }: { points: ReportSeriesPoint[] }) {
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
        <CardTitle icon="dumbbell">{t('pt.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('pt.caption')}</p>
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
            ariaLabel={t('pt.chartAria')}
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('pt.title')}
            meanLabel={t('stats.average')}
          />
        </>
      ) : (
        <EmptyState>{t('pt.empty')}</EmptyState>
      )}
    </Card>
  );
}
