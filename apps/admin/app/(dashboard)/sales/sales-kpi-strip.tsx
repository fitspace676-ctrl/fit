'use client';

// The Sales tab's four numbers, in one container — `overview/metric-strip.tsx`'s
// treatment, at four cells instead of nine.
//
// The hairlines are the 1px grid gap showing the container's border colour
// through, with each cell painting over it with the surface colour. That is
// correct at every column count, unlike per-cell borders reset on `:first-child`.
//
// The caption is load-bearing, not decoration: it states the window, the filter,
// and that these are captured payments only. Without it "Net sales" reads as the
// gym's total revenue, which it is not — subscription renewals bill through
// `Invoice` and never raise a payment.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { SalesGranularity, SalesKpis, SalesProductType } from '@fit/types';

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
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
  },
  value: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  hint: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  caption: {
    margin: 0,
    paddingInline: '0.25rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** The tiles, in reading order. `hint` marks the one that needs a qualifier. */
const TILES = [
  { key: 'grossSales', hint: false },
  { key: 'netSales', hint: false },
  { key: 'refunded', hint: true },
  { key: 'avgSale', hint: false },
] as const satisfies readonly { key: keyof SalesKpis; hint: boolean }[];

export function SalesKpiStrip({
  kpis,
  granularity,
  productType,
  money,
}: {
  kpis: SalesKpis;
  granularity: SalesGranularity;
  productType: SalesProductType;
  money: Intl.NumberFormat;
}) {
  const t = useTranslations('admin.dashboard.sales');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile) => (
            <div key={tile.key} {...stylex.props(styles.cell)}>
              <span {...stylex.props(styles.label)}>{t(`kpi.${tile.key}`)}</span>
              {/* Money is carried in MINOR units; the strip shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(kpis[tile.key] / 100)}</span>
              {tile.hint ? <span {...stylex.props(styles.hint)}>{t('refundedHint')}</span> : null}
            </div>
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', {
          window: t(`window.${granularity}`),
          productType: t(`productType.${productType}`),
        })}
      </p>
    </div>
  );
}
