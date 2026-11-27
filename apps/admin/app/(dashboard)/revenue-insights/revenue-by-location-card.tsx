'use client';

// Where the takings came from, for a gym that has more than one branch.
//
// The view renders this only when the API sends an ARRAY. A single-location gym
// gets `null` — not an empty list — because the question does not apply to it, and
// an empty chart would be a different, wrong answer.
//
// Only the till/shop stream is attributable: a subscription invoice names no
// location, and inventing one would be a fabricated figure. The caption says that
// rather than letting these bars silently fail to add up to the KPI tile.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { RevenueLocationSlice } from '@fit/types';
import { EmptyState } from '../overview/format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', padding: '1.25rem' },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    columnGap: '0.625rem',
    rowGap: '0.375rem',
    alignItems: 'baseline',
  },
  name: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  value: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  share: {
    minWidth: '2.75rem',
    textAlign: 'end',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  // Each branch's share of the whole, so the split reads at a glance.
  track: {
    display: 'block',
    gridColumn: '1 / -1',
    height: '0.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    overflow: 'hidden',
  },
  fill: {
    display: 'block',
    height: '100%',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--chart-series-1)',
  },
  head: { marginBottom: '1rem' },
  caption: {
    margin: 0,
    marginTop: '0.125rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export function RevenueByLocationCard({
  slices,
  money,
}: {
  slices: RevenueLocationSlice[];
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.revenue');
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const pct = (value: number) => (total === 0 ? 0 : Math.round((value / total) * 100));

  return (
    <Card padding="none" xstyle={styles.card}>
      <div {...stylex.props(styles.head)}>
        <CardTitle icon="pin">{t('byLocation.title')}</CardTitle>
        <p {...stylex.props(styles.caption)}>{t('byLocation.caption')}</p>
      </div>
      {total === 0 ? (
        <EmptyState>{t('byLocation.empty')}</EmptyState>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {slices.map((slice) => (
            <li key={slice.location} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.name)} title={slice.location}>
                {slice.location}
              </span>
              {/* Money is carried in MINOR units; the card shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(slice.value / 100)}</span>
              <span {...stylex.props(styles.share)}>{pct(slice.value)}%</span>
              <span aria-hidden {...stylex.props(styles.track)}>
                <span
                  {...stylex.props(styles.fill)}
                  data-grow="x"
                  style={{ width: `${Math.max(2, (slice.value / total) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
