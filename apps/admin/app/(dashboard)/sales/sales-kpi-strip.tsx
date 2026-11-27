'use client';

// The Sales tab's three numbers, in one container - `overview/metric-strip.tsx`'s
// treatment, at three cells instead of nine. Gross sales used to lead the strip;
// the owner had it removed (2026-09-02) - net sales is the figure the tab is about.
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
import type { NumberFormatter } from '@fit/i18n';
import type { SalesGranularity, SalesKpis, SalesProductType } from '@fit/types';
import { KpiTile } from '../kpi-tile';
import type { IconName } from '@/components/ui';

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
      default: 'repeat(1, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(3, minmax(0, 1fr))',
    },
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '0.875rem 1rem',
    backgroundColor: 'var(--color-background-surface)',
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
  { key: 'netSales', hint: false, icon: 'card' },
  { key: 'refunded', hint: true, icon: 'retry' },
  { key: 'avgSale', hint: false, icon: 'tag' },
] as const satisfies readonly {
  key: keyof SalesKpis;
  hint: boolean;
  icon: IconName;
}[];

export function SalesKpiStrip({
  kpis,
  granularity,
  windowLabel,
  productType,
  money,
}: {
  kpis: SalesKpis;
  granularity: SalesGranularity;
  /** The window the response covers, named by the view; falls back to the rolling label. */
  windowLabel?: string;
  productType: SalesProductType;
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.sales');

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile, i) => (
            <KpiTile
              key={tile.key}
              hero={i === 0}
              icon={tile.icon}
              label={t(`kpi.${tile.key}`)}
              // Money is carried in MINOR units; the strip shows major units.
              value={money.format(kpis[tile.key] / 100)}
              hint={tile.hint ? t('refundedHint') : undefined}
            />
          ))}
        </div>
      </div>
      <p {...stylex.props(styles.caption)}>
        {t('kpiCaption', {
          window: windowLabel ?? t(`window.${granularity}`),
          productType: t(`productType.${productType}`),
        })}
      </p>
    </div>
  );
}
