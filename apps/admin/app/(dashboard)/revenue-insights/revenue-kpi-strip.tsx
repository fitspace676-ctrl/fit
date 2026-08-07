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
import type { RevenueGranularity, RevenueKpis } from '@fit/types';

const styles = stylex.create({
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-outer)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-surface)',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'var(--color-surface)',
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

export function RevenueKpiStrip({
  kpis,
  granularity,
  money,
}: {
  kpis: RevenueKpis;
  granularity: RevenueGranularity;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.revenue');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((key) => (
            <div key={key} {...stylex.props(styles.cell)}>
              <span {...stylex.props(styles.label)}>{t(`kpi.${key}`)}</span>
              {/* Money is carried in MINOR units; the strip shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(kpis[key] / 100)}</span>
            </div>
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', { window: t(`window.${granularity}`) })}
      </p>
    </div>
  );
}
