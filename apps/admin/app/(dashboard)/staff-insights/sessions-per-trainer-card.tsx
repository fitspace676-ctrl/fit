'use client';

// Who delivered what.
//
// The bars rank by total sessions, but a session count alone flattens two very
// different weeks: twelve half-hour PT slots and twelve ninety-minute classes are
// not the same job. So each row repeats underneath with its class/PT split and the
// hours behind it.
//
// Capped at eight rows, and the caption says so rather than letting a ninth
// trainer vanish silently.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { TOP_TRAINERS } from '@fit/types';
import type { TrainerDelivery } from '@fit/types';
import { BarChart, type BarDatum } from '../charts';

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

export function SessionsPerTrainerCard({ trainers }: { trainers: TrainerDelivery[] }) {
  const t = useTranslations('admin.dashboard.staff');
  const data: BarDatum[] = trainers.map((trainer) => ({
    label: trainer.name,
    value: trainer.sessions,
  }));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('perTrainer.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('perTrainer.caption', { count: TOP_TRAINERS })}</p>
      </div>

      <BarChart data={data} emptyLabel={t('perTrainer.empty')} />

      <ul {...stylex.props(styles.rows)}>
        {trainers.map((trainer) => (
          <li key={trainer.name} {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.rowName)}>{trainer.name}</span>
            <span {...stylex.props(styles.rowMeta)}>
              {t('perTrainer.row', {
                classes: trainer.classes,
                pt: trainer.pt,
                hours: trainer.hours,
              })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
