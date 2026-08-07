'use client';

// The window's best-selling lines, ranked.
//
// Rows are `OrderItem.label`s snapshotted at sale time, so a renamed plan does
// not rewrite past sales — the label is what was actually rung up. Discount and
// promo lines (negative amounts) never appear: they are adjustments, not products.

import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { NumberFormatter } from '@fit/i18n';
import { Card } from '@astryxdesign/core/Card';
import type { SalesTopSeller } from '@fit/types';
import { EmptyState } from '../overview/format';

const styles = stylex.create({
  card: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    letterSpacing: '-0.005em',
    color: 'var(--color-text-primary)',
  },
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

  return (
    <Card variant="default" padding={0} xstyle={styles.card}>
      <h2 {...stylex.props(styles.title)}>{t('topSellers.title')}</h2>
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
