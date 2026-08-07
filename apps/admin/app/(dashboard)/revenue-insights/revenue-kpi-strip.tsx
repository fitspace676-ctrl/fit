'use client';

// The Revenue tab's four numbers, in one container — the Members tab's treatment,
// and deliberately identical to it so the three tabs read as one dashboard.
//
// ALL FOUR are money, so all four divide by 100 on the way out. What differs is
// the period they describe, and the caption is where that is stated: total revenue
// and per-member are windowed, while recurring and outstanding are current. A strip
// that let those be read as one window would be quietly wrong twice.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { DashboardRevenueResponse, RevenueGranularity, RevenueKpis } from '@fit/types';
import { Sparkline } from '../charts';

const styles = stylex.create({
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-surface)',
  },
  grid: {
    display: 'grid',
    gap: '1px',
    backgroundColor: 'var(--color-border)',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  cell: {
    // `relative` anchors the sparkline, which is absolutely positioned against
    // this box and bleeds off its bottom edge.
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'var(--color-background-surface)',
  },
  // Reserves the band the sparkline occupies, so the numeral never sits on top
  // of the curve. Only the tiles that HAVE a series get it — an unconditional
  // pad would leave the other tiles looking short of something.
  cellSparked: {
    paddingBottom: '2.25rem',
  },
  label: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)' },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  caption: {
    margin: 0,
    paddingInline: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The tiles, in reading order. Every one is money, in MINOR units. */
const TILES = [
  'totalRevenue',
  'mrr',
  'revenuePerMember',
  'outstandingTotal',
] as const satisfies readonly (keyof RevenueKpis)[];

/**
 * The series behind each tile — where one honestly exists.
 *
 * Two of the four have none, and they get no sparkline rather than a borrowed
 * one. `revenuePerMember` is a windowed average with no per-bucket history in
 * the payload, and `outstandingTotal` is a snapshot of what is owed right now —
 * a debt has no trend, it has an age. Drawing either against `revenueOverTime`
 * would put a curve under a number that curve does not describe.
 */
function tileSeries(key: (typeof TILES)[number], data: DashboardRevenueResponse) {
  switch (key) {
    // The tile IS this series' sum over the window, stream split re-joined.
    case 'totalRevenue':
      return data.revenueOverTime.map((p) => p.recurring + p.oneOff);
    // The tile IS this series' last point.
    case 'mrr':
      return data.mrrOverTime.map((p) => p.value);
    default:
      return null;
  }
}

export function RevenueKpiStrip({
  data,
  granularity,
  money,
}: {
  data: DashboardRevenueResponse;
  granularity: RevenueGranularity;
  money: NumberFormatter;
}) {
  const kpis = data.kpis;
  const t = useTranslations('admin.dashboard.revenue');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((key) => {
            const series = tileSeries(key, data);
            return (
              <div key={key} {...stylex.props(styles.cell, series && styles.cellSparked)}>
                <span {...stylex.props(styles.label)}>{t(`kpi.${key}`)}</span>
                {/* Money is carried in MINOR units; the strip shows major units. */}
                <span {...stylex.props(styles.value)}>{money.format(kpis[key] / 100)}</span>
                {series && <Sparkline values={series} />}
              </div>
            );
          })}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', { window: t(`window.${granularity}`) })}
      </p>
    </div>
  );
}
