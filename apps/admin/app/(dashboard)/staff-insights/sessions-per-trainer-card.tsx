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
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import { TOP_TRAINERS } from '@fit/types';
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
    height: '0.4375rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
  },
  rowMeta: {
    gridColumn: '1 / -1',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  classes: { backgroundColor: 'var(--chart-series-1)' },
  pt: { backgroundColor: 'var(--chart-series-2)' },
  legend: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '0.875rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '0.375rem' },
  swatch: { width: '0.625rem', height: '0.625rem', borderRadius: '3px' },
});

export function SessionsPerTrainerCard({ trainers }: { trainers: TrainerDelivery[] }) {
  const t = useTranslations('admin.dashboard.staff');
  // Every bar against the busiest trainer, split into the two kinds of session.
  const best = Math.max(1, ...trainers.map((trainer) => trainer.sessions));

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="users">{t('perTrainer.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('perTrainer.caption', { count: TOP_TRAINERS })}</p>
      </div>

      {trainers.length === 0 ? (
        <EmptyState>{t('perTrainer.empty')}</EmptyState>
      ) : (
        <>
          <div {...stylex.props(styles.legend)}>
            <span {...stylex.props(styles.legendItem)}>
              <span aria-hidden {...stylex.props(styles.swatch, styles.classes)} />
              {t('sessions.classes')}
            </span>
            <span {...stylex.props(styles.legendItem)}>
              <span aria-hidden {...stylex.props(styles.swatch, styles.pt)} />
              {t('sessions.pt')}
            </span>
          </div>
          <ul {...stylex.props(styles.rows)}>
            {trainers.map((trainer) => (
              <li key={trainer.name} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowName)} title={trainer.name}>
                  {trainer.name}
                </span>
                <span {...stylex.props(styles.rowValue)}>{trainer.sessions}</span>
                <span aria-hidden {...stylex.props(styles.track)}>
                  {trainer.classes > 0 ? (
                    <span
                      {...stylex.props(styles.fill, styles.classes)}
                      data-grow="x"
                      style={{ width: `${(trainer.classes / best) * 100}%` }}
                    />
                  ) : null}
                  {trainer.pt > 0 ? (
                    <span
                      {...stylex.props(styles.fill, styles.pt)}
                      data-grow="x"
                      style={{ width: `${(trainer.pt / best) * 100}%` }}
                    />
                  ) : null}
                </span>
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
        </>
      )}
    </Card>
  );
}
