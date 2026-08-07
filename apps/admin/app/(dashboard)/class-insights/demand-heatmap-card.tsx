'use client';

// When demand actually lands, by weekday and hour.
//
// Built from CLASS START TIMES, not check-ins: a check-in heatmap describes
// building traffic — every member who came for the floor — and
// `/reports/attendance` already draws exactly that. Two surfaces showing the same
// picture under different titles is worse than one.
//
// The grid is UTC, and the caption says so. Every bucket in this dashboard is,
// because `report-window.util` is; a gym-local grid is a timezone change across
// all of Reports rather than a fix belonging to this card.
//
// Weekday names come from i18n here rather than from the API, so the contract
// stays locale-free — the Reports drill-down puts English labels on the wire and
// this deliberately does not copy that.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import { HEATMAP_COLS } from '@fit/types';
import { Heatmap } from '../charts';
import { EmptyState } from '../overview/format';

/** Row order, Monday first — the same order the API fills its rows in. */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

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
});

export function DemandHeatmapCard({ cells }: { cells: number[][] }) {
  const t = useTranslations('admin.dashboard.classes');
  const hasData = cells.some((row) => row.some((value) => value > 0));

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('heatmap.title')}</h2>
        <p {...stylex.props(styles.caption)}>{t('heatmap.caption')}</p>
      </div>

      {hasData ? (
        <Heatmap
          rowLabels={WEEKDAY_KEYS.map((key) => t(`heatmap.weekday.${key}`))}
          colLabels={Array.from({ length: HEATMAP_COLS }, (_, hour) => String(hour))}
          cells={cells}
          ariaLabel={t('heatmap.chartAria')}
        />
      ) : (
        <EmptyState>{t('heatmap.empty')}</EmptyState>
      )}
    </Card>
  );
}
