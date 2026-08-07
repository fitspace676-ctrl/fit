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
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { TrainerDelivery } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';
import { EmptyState } from '../overview/format';

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
  rows: { display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.75rem' },
  row: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.75rem' },
  rowName: { color: 'var(--color-text-primary)' },
  rowMeta: { fontFamily: 'var(--font-family-code)', color: 'var(--color-text-secondary)' },
});

export function TrainerUtilizationCard({ trainers }: { trainers: TrainerDelivery[] }) {
  const t = useTranslations('admin.dashboard.staff');

  const rated = trainers.filter(
    (trainer): trainer is TrainerDelivery & { utilizationRate: number } =>
      trainer.utilizationRate !== null,
  );
  const excluded = trainers.length - rated.length;
  const data: BarDatum[] = rated.map((trainer) => ({
    label: trainer.name,
    value: trainer.utilizationRate,
  }));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('utilization.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('utilization.caption')}</p>
      </div>

      {rated.length === 0 ? (
        <EmptyState>{t('utilization.empty')}</EmptyState>
      ) : (
        <BarChart data={data} formatValue={(value) => `${value}%`} />
      )}

      {excluded > 0 ? (
        <p {...stylex.props(styles.caption)}>{t('utilization.excluded', { count: excluded })}</p>
      ) : null}
    </Card>
  );
}
