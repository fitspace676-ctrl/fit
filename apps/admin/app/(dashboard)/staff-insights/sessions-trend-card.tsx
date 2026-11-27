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
import { Card } from '@fit/ui-kit';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SALES_GRANULARITIES, type SessionsPoint, type StaffGranularity } from '@fit/types';
import { ColumnChart, type ColumnDatum } from '../column-chart';
import { StatRow } from '../stat-row';
import { EmptyState } from '../overview/format';
import { createNumberFormat } from '@fit/i18n';
import { formatBucket } from '../format';
import { CardTitle } from '../card-title';

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

  // Group classes are each column's base and PT sits on top, so a column's
  // height is every session delivered in that bucket.
  const data: ColumnDatum[] = points.map((point) => ({
    label: point.label,
    value: point.classes,
    stack: point.pt,
  }));
  const hasData = data.some((point) => point.value !== 0 || point.stack !== 0);
  const classes = points.reduce((sum, point) => sum + point.classes, 0);
  const pt = points.reduce((sum, point) => sum + point.pt, 0);

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <div>
          <CardTitle icon="chart">{t('sessions.title')}</CardTitle>
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
          <StatRow
            hidden={data.length <= 1}
            stats={[
              { label: t('sessions.classes'), value: count.format(classes), swatch: 'up' },
              { label: t('sessions.pt'), value: count.format(pt), swatch: 'stack' },
              { label: t('sessions.total'), value: count.format(classes + pt) },
            ]}
          />
          <ColumnChart
            data={data}
            integer
            ariaLabel={t('sessions.chartAria')}
            formatValue={(value) => count.format(value)}
            formatLabel={(label) => formatBucket(locale, label)}
            valueName={t('sessions.classes')}
            stackName={t('sessions.pt')}
            totalName={t('sessions.total')}
          />
        </>
      ) : (
        <EmptyState>{t('sessions.empty')}</EmptyState>
      )}
    </Card>
  );
}
