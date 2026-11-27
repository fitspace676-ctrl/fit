'use client';

// Delivered hours against the hours each trainer said they were available.
//
// Trainers with no availability set are ABSENT from the chart rather than shown
// at 0%: the missing figure is a configuration gap, and drawing it as an empty bar
// blames the trainer for the gym's unfilled form. The caption counts them, and the
// gaps card names them again beside every other exclusion on the tab.
//
// A bar can exceed 100%. That is not a bug to clamp — it is a trainer working
// beyond the hours they stated, which is exactly what an owner needs to see.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { TrainerDelivery } from '@fit/types';
import { EmptyState } from '../overview/format';
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
  rows: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '0.75rem',
    rowGap: '0.3125rem',
    alignItems: 'baseline',
  },
  rowName: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  track: {
    display: 'flex',
    gap: '2px',
    gridColumn: '1 / -1',
    position: 'relative',
    height: '0.4375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
  },
  rate: {
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
  },
  // The scale every row shares: a rate is read against 100%, not against the
  // busiest trainer, or a 27% week would draw as a full bar.
  scale: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.625rem',
    color: 'var(--color-text-secondary)',
  },
});

export function TrainerUtilizationCard({ trainers }: { trainers: TrainerDelivery[] }) {
  const t = useTranslations('admin.dashboard.staff');

  const rated = trainers.filter(
    (trainer): trainer is TrainerDelivery & { utilizationRate: number } =>
      trainer.utilizationRate !== null,
  );
  const excluded = trainers.length - rated.length;
  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="target">{t('utilization.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('utilization.caption')}</p>
      </div>

      {rated.length === 0 ? (
        <EmptyState>{t('utilization.empty')}</EmptyState>
      ) : (
        <>
          <div aria-hidden {...stylex.props(styles.scale)}>
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <ul {...stylex.props(styles.rows)}>
            {rated.map((trainer) => (
              <li key={trainer.name} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowName)} title={trainer.name}>
                  {trainer.name}
                </span>
                <span {...stylex.props(styles.rowValue)}>{trainer.utilizationRate}%</span>
                <span aria-hidden {...stylex.props(styles.track)}>
                  <span
                    {...stylex.props(styles.fill, styles.rate)}
                    data-grow="x"
                    style={{ width: `${Math.min(100, Math.max(1, trainer.utilizationRate))}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {excluded > 0 ? (
        <p {...stylex.props(styles.caption)}>{t('utilization.excluded', { count: excluded })}</p>
      ) : null}
    </Card>
  );
}
