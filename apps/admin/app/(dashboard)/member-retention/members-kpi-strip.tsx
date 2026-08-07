'use client';

// The Members tab's four numbers, in one container — `sales/sales-kpi-strip.tsx`'s
// treatment, and deliberately identical to it so the two tabs read as one
// dashboard.
//
// Three tiles are counts and one is money, which is the only thing to get right
// here: `avgLtv` arrives in MINOR units and divides by 100; the counts do not.
//
// The caption carries the qualifier LTV needs. "Avg LTV" beside three live counts
// reads as a forward-looking number; it is not — it is the money actually taken
// per member so far, and the caption says so.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import { createNumberFormat, defaultLocale } from '@fit/i18n';
import type { NumberFormatter } from '@fit/i18n';
import type { DashboardMembersResponse, MembersGranularity, MembersKpis } from '@fit/types';
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
  // Reserves the band the sparkline occupies, so the numeral never sits on the
  // curve. Only the tiles that HAVE a series get it — an unconditional pad would
  // leave the others looking short of something.
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

/** The tiles, in reading order. `money` marks the one carried in MINOR units. */
const TILES = [
  { key: 'activeMembers', money: false },
  { key: 'newSignups', money: false },
  { key: 'churned', money: false },
  { key: 'avgLtv', money: true },
] as const satisfies readonly { key: keyof MembersKpis; money: boolean }[];

/**
 * The series behind each tile — where one honestly exists.
 *
 * `avgLtv` gets none. It is money taken per member over the member's whole life,
 * averaged across the base; the payload carries no per-bucket history of it, and
 * nothing else here is a stand-in. A borrowed curve under a number is worse than
 * no curve.
 */
function tileSeries(key: keyof MembersKpis, data: DashboardMembersResponse) {
  switch (key) {
    case 'activeMembers':
      return data.activeOverTime.map((p) => p.value);
    case 'newSignups':
      return data.signupsVsChurn.map((p) => p.signups);
    case 'churned':
      return data.signupsVsChurn.map((p) => p.churned);
    default:
      return null;
  }
}

export function MembersKpiStrip({
  data,
  granularity,
  money,
}: {
  data: DashboardMembersResponse;
  granularity: MembersGranularity;
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.members');
  const kpis = data.kpis;

  return (
    <div {...stylex.props(styles.wrap)}>
      <div {...stylex.props(styles.strip)}>
        <div {...stylex.props(styles.grid)}>
          {TILES.map((tile) => {
            const series = tileSeries(tile.key, data);
            return (
              <div key={tile.key} {...stylex.props(styles.cell, series && styles.cellSparked)}>
                <span {...stylex.props(styles.label)}>{t(`kpi.${tile.key}`)}</span>
                <span {...stylex.props(styles.value)}>
                  {tile.money
                    ? // Money is carried in MINOR units; the strip shows major units.
                      money.format(kpis[tile.key] / 100)
                    : createNumberFormat(defaultLocale).format(kpis[tile.key])}
                </span>
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
