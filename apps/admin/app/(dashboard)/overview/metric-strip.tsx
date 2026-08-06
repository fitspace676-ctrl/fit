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
import { Badge } from '@astryxdesign/core/Badge';
import type { DashboardKpi, DashboardOverviewResponse } from '@fit/types';

const styles = stylex.create({
  strip: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    borderRadius: 'var(--radius-outer)',
    overflow: 'hidden',
    backgroundColor: 'var(--color-surface)',
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
    backgroundColor: 'var(--color-surface)',
  },
  label: {
    fontSize: '0.75rem',
    fontWeight: 500,
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

export function MetricStrip({ data }: { data: DashboardOverviewResponse }) {
  const t = useTranslations('admin.dashboard');
  const locale = useLocale();

  const money = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data.currency,
        maximumFractionDigits: 0,
      }),
    [data.currency, locale],
  );
  const count = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <div role="group" aria-label={t('metrics.aria')} {...stylex.props(styles.strip)}>
      <div {...stylex.props(styles.tier, styles.tierOne)}>
        <KpiCell
          label={t('kpi.revenue')}
          value={money.format(data.kpis.todaysRevenue.value / 100)}
          kpi={data.kpis.todaysRevenue}
        />
        <KpiCell
          label={t('kpi.checkIns')}
          value={count.format(data.kpis.checkInsToday.value)}
          kpi={data.kpis.checkInsToday}
        />
        <KpiCell
          label={t('kpi.newMembers')}
          value={count.format(data.kpis.newMembers7d.value)}
          kpi={data.kpis.newMembers7d}
        />
        <KpiCell
          label={t('secondaryKpi.revenueThisMonth')}
          value={money.format(data.secondaryKpis.revenueThisMonth.value / 100)}
          kpi={data.secondaryKpis.revenueThisMonth}
        />
      </div>

      <div {...stylex.props(styles.tier, styles.tierTwo)}>
        <CountCell
          label={t('secondaryKpi.activeMembers')}
          value={count.format(data.secondaryKpis.activeMembers)}
        />
        <CountCell
          label={t('secondaryKpi.overduePayments')}
          value={count.format(data.secondaryKpis.overduePayments)}
        />
        <CountCell
          label={t('secondaryKpi.classes')}
          value={count.format(data.secondaryKpis.classesToday)}
        />
        <CountCell
          label={t('secondaryKpi.expiringSoon')}
          value={count.format(data.secondaryKpis.expiringSoon)}
          hint={t('secondaryKpi.expiringSoonHint')}
        />
        <CountCell
          label={t('secondaryKpi.renewalsDue')}
          value={count.format(data.secondaryKpis.renewalsDue)}
          hint={t('secondaryKpi.renewalsDueHint')}
        />
        <div aria-hidden="true" {...stylex.props(styles.cell, styles.filler)} />
      </div>
    </div>
  );
}

/** A tier-one cell: the larger numeral plus its period-over-period delta. */
function KpiCell({ label, value, kpi }: { label: string; value: string; kpi: DashboardKpi }) {
  return (
    <div {...stylex.props(styles.cell)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <span {...stylex.props(styles.valueLarge)}>{value}</span>
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
 * The delta badge, moved here verbatim from the KPI cards this strip replaces.
 * `deltaPct === null` means the comparison window has no data — said plainly
 * rather than shown as a 0% change, which would read as "flat".
 */
function DeltaChip({ kpi }: { kpi: DashboardKpi }) {
  const t = useTranslations('admin.dashboard');
  if (kpi.deltaPct === null) {
    return <span {...stylex.props(styles.foot)}>{t('kpi.noPriorData')}</span>;
  }
  const good = kpi.deltaPct >= 0;
  return (
    <Badge
      variant={good ? 'success' : 'error'}
      label={`${good ? '▲' : '▼'} ${Math.abs(kpi.deltaPct)}%`}
    />
  );
}
