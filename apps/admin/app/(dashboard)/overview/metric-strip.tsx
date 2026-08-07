'use client';

// The overview's nine numbers, in one container instead of nine cards.
//
// Two tiers, and the line between them is the data's own: exactly four metrics
// carry a period-over-period delta (`DashboardKpi`), and five are standing counts
// with no baseline. Tier one gets the larger numeral and the delta chip; tier two
// is smaller and muted, and shows a static hint where a trend would be a lie.
//
// That is a different split from the one this replaces, which had
// `revenueThisMonth` — a full KPI — sitting in the secondary row with the plain
// counts purely because of where it landed in the layout.

import { useMemo } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import type { DashboardKpi, DashboardOverviewResponse } from '@fit/types';

const styles = stylex.create({
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-container)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-surface)',
  },
  tier: {
    display: 'grid',
    // The hairlines are the 1px grid gap showing the container's border color
    // through, with each cell painting over it with the surface color. That is
    // correct at every column count and every row-start, unlike a per-cell
    // left border reset on `:first-child`, which only zeroes the very first
    // cell of the whole tier — every other row-start still drew a stray border
    // flush against the container edge.
    gap: '1px',
    backgroundColor: 'var(--color-border)',
  },
  tierOne: {
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  tierTwo: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 768px)': 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(5, minmax(0, 1fr))',
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
  // A delta is a footnote to the numeral above it. `alignSelf: start` is what
  // keeps it that size in a stretch-aligned grid cell.
  delta: {
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-full)',
    paddingInline: '0.4375rem',
    paddingBlock: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  deltaUp: {
    color: 'var(--color-text-green)',
    backgroundColor: 'var(--color-background-green)',
  },
  deltaDown: {
    color: 'var(--color-text-red)',
    backgroundColor: 'var(--color-background-red)',
  },
  // The unit rides at two thirds of the numeral and in secondary ink, so `GEL`
  // stops competing with the figure it qualifies.
  unit: {
    fontSize: '0.66em',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
  valueLarge: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  valueSmall: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  foot: {
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  // Tier two holds five cells, which never fills a grid: 2 columns leaves one
  // gap in the last row, 3 columns leaves one in the second. Because the
  // hairline technique paints the tier container in the border color and lets
  // each cell paint over it, an unfilled grid area shows through as a solid
  // border-colored block instead of empty space. A sixth, hidden cell tiles
  // exactly at both 2 and 3 columns; it is hidden again from 1024px up, where
  // the tier is 5 columns and already tiles without it. Do not delete this —
  // it looks like dead markup, but it is load-bearing below 1024px.
  filler: {
    display: {
      default: 'block',
      '@media (min-width: 1024px)': 'none',
    },
  },
});

/** How many standing counts the second tier holds. */
const SECONDARY_TILES = 5;

/**
 * Filler cells needed below 1024px, DERIVED rather than assumed.
 *
 * The hairlines are the 1px grid gap showing the container's border colour
 * through, with each cell painting over it — which means an UNFILLED grid area
 * shows as a solid block of border colour rather than as empty space. Below
 * 1024px the tier is 2 then 3 columns, so the cell count has to be divisible by
 * both, and five is divisible by neither.
 *
 * This used to be a single hand-placed `<div>`, correct only for exactly five
 * tiles. A sixth would have tiled by accident; a seventh would have shown the
 * block again, silently, and only at some widths.
 *
 * From 1024px up the tier is 5 columns and the fillers are hidden — that
 * breakpoint still assumes {@link SECONDARY_TILES} is 5, which is what the
 * strip's test pins.
 */
const FILLERS = (6 - (SECONDARY_TILES % 6)) % 6;

export function MetricStrip({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();

  const money = useMemo(
    () =>
      createNumberFormat(locale, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency, locale],
  );
  const count = useMemo(() => createNumberFormat(locale), [locale]);

  return (
    <div role="group" aria-label={t('metrics.aria')} {...stylex.props(styles.strip)}>
      <div {...stylex.props(styles.tier, styles.tierOne)}>
        <KpiCell
          label={t('kpi.revenue')}
          value={money.parts(data.kpis.todaysRevenue.value / 100)}
          kpi={data.kpis.todaysRevenue}
        />
        <KpiCell
          label={t('kpi.checkIns')}
          value={count.parts(data.kpis.checkInsToday.value)}
          kpi={data.kpis.checkInsToday}
        />
        <KpiCell
          label={t('kpi.newMembers')}
          value={count.parts(data.kpis.newMembers7d.value)}
          kpi={data.kpis.newMembers7d}
        />
        <KpiCell
          label={t('secondaryKpi.revenueThisMonth')}
          value={money.parts(data.secondaryKpis.revenueThisMonth.value / 100)}
          kpi={data.secondaryKpis.revenueThisMonth}
        />
      </div>

      <div {...stylex.props(styles.tier, styles.tierTwo)}>
        {[
          { key: 'activeMembers', value: data.secondaryKpis.activeMembers },
          { key: 'overduePayments', value: data.secondaryKpis.overduePayments },
          { key: 'classes', value: data.secondaryKpis.classesToday },
          { key: 'expiringSoon', value: data.secondaryKpis.expiringSoon, hint: true },
          { key: 'renewalsDue', value: data.secondaryKpis.renewalsDue, hint: true },
        ].map((tile) => (
          <CountCell
            key={tile.key}
            label={t(`secondaryKpi.${tile.key}`)}
            value={count.format(tile.value)}
            hint={tile.hint ? t(`secondaryKpi.${tile.key}Hint`) : undefined}
          />
        ))}
        {Array.from({ length: FILLERS }, (_, i) => (
          <div
            key={`filler-${i}`}
            aria-hidden="true"
            {...stylex.props(styles.cell, styles.filler)}
          />
        ))}
      </div>
    </div>
  );
}

/** A tier-one cell: the larger numeral plus its period-over-period delta. */
function KpiCell({
  label,
  value,
  kpi,
}: {
  label: string;
  value: { digits: string; unit: string; unitFirst: boolean };
  kpi: DashboardKpi;
}) {
  return (
    <div {...stylex.props(styles.cell)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.valueLarge)}>
        {value.unitFirst && value.unit ? (
          <span {...stylex.props(styles.unit)}>{value.unit} </span>
        ) : null}
        {value.digits}
        {!value.unitFirst && value.unit ? (
          <span {...stylex.props(styles.unit)}> {value.unit}</span>
        ) : null}
      </span>
      <DeltaChip kpi={kpi} />
    </div>
  );
}

/** A tier-two cell: a standing count, with an optional descriptive hint. */
function CountCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div {...stylex.props(styles.cell)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.valueSmall)}>{value}</span>
      {hint ? <span {...stylex.props(styles.foot)}>{hint}</span> : null}
    </div>
  );
}

/**
 * The period-over-period delta.
 *
 * A chip sized to its own content, NOT the Astryx `Badge` this used to use: in a
 * stretch-aligned grid cell that badge grew to the full column, so a single-digit
 * percentage arrived as a full-width block of alarm colour. A delta is a footnote
 * to the number above it, and it should occupy a footnote's worth of the tile.
 *
 * `deltaPct === null` means the comparison window has no data — said plainly
 * rather than shown as a 0% change, which would read as "flat".
 *
 * The arrow rides with the colour deliberately: status colour alone is not an
 * encoding a colourblind reader can use.
 */
function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  const t = useTranslations('admin.dashboard');
  if (kpi.deltaPct === null) {
    return <span {...stylex.props(styles.foot)}>{t('kpi.noPriorData')}</span>;
  }
  const good = kpi.deltaPct >= 0;
  return (
    <span {...stylex.props(styles.delta, good ? styles.deltaUp : styles.deltaDown)}>
      <span aria-hidden="true">{good ? '▲' : '▼'}</span>
      {Math.abs(kpi.deltaPct)}%
    </span>
  );
}
