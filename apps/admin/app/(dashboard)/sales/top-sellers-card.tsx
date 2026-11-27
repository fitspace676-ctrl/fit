'use client';

// The window's best-selling lines, ranked.
//
// Rows are `OrderItem.label`s snapshotted at sale time, so a renamed plan does
// not rewrite past sales — the label is what was actually rung up. Discount and
// promo lines (negative amounts) never appear: they are adjustments, not products.

import * as stylex from '@stylexjs/stylex';
import { Card } from '@fit/ui-kit';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import type { SalesTopSeller } from '@fit/types';
import { EmptyState } from '../overview/format';
import { CardTitle } from '../card-title';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.625rem', margin: 0, padding: 0 },
  row: {
    display: 'grid',
    gridTemplateColumns: '1.25rem minmax(0, 1fr) auto',
    alignItems: 'baseline',
    gap: '0.625rem',
  },
  rank: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-disabled)',
  },
  name: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    color: 'var(--color-text-primary)',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  orders: {
    display: 'block',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  // Each seller's takings against the best seller's, so the ranking has a shape.
  track: {
    display: 'block',
    marginTop: '0.375rem',
    height: '0.3125rem',
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
  value: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
});

export function TopSellersCard({
  rows,
  money,
}: {
  rows: SalesTopSeller[];
  money: NumberFormatter;
}) {
  const t = useTranslations('admin.dashboard.sales');
  const best = Math.max(1, ...rows.map((row) => row.value));

  return (
    <Card padding="none" xstyle={styles.card}>
      <CardTitle icon="star">{t('topSellers.title')}</CardTitle>
      {rows.length === 0 ? (
        <EmptyState>{t('topSellers.empty')}</EmptyState>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {rows.map((row, index) => (
            <li key={row.label} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rank)}>{index + 1}</span>
              <span>
                <span {...stylex.props(styles.name)} title={row.label}>
                  {row.label}
                </span>
                <span {...stylex.props(styles.orders)}>
                  {t('topSellers.orders', { count: row.orders })}
                </span>
                <span aria-hidden {...stylex.props(styles.track)}>
                  <span
                    {...stylex.props(styles.fill)}
                    data-grow="x"
                    style={{ width: `${Math.max(2, (row.value / best) * 100)}%` }}
                  />
                </span>
              </span>
              {/* Money is carried in MINOR units; the list shows major units. */}
              <span {...stylex.props(styles.value)}>{money.format(row.value / 100)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
