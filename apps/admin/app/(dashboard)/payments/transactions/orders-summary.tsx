import * as stylex from '@stylexjs/stylex';
import type { OrderRosterSummary } from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { Icon, type IconName } from '@/components/ui';
import { formatMoney } from './format';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
    gap: '1rem',
  },
  tile: {
    padding: {
      default: '1rem',
      '@media (min-width: 640px)': '1.25rem',
    },
  },
  icon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  iconAccent: {
    color: 'var(--color-text-accent)',
  },
  iconSuccess: {
    color: 'var(--color-success)',
  },
  iconError: {
    color: 'var(--color-error)',
  },
  value: {
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  label: {
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
});

/** One summary tile's static config — icon, label, and accent tone. */
type Tile = {
  key: keyof OrderRosterSummary | 'net';
  label: string;
  icon: IconName;
  /** StyleX colour style for the tile's icon, on the brand tokens. */
  tone: stylex.StyleXStyles;
  value: string;
};

/**
 * The orders roster summary tiles (T4.3, rebuilt on Astryx + StyleX in T11.22) —
 * four at-a-glance totals for the whole filtered set (not just the visible page):
 * the order count, gross takings, the amount refunded, and the net kept after
 * refunds. Money formats in the roster's own currency. Server-rendered from the
 * `GET /orders` response `summary`, so it always agrees with the table below.
 */
export function OrdersSummary({ summary }: { summary: OrderRosterSummary }) {
  const { orderCount, grossTotal, refundedTotal, netTotal, currency } = summary;

  const tiles: Tile[] = [
    {
      key: 'orderCount',
      label: 'Orders',
      icon: 'bag',
      tone: styles.iconAccent,
      value: orderCount.toLocaleString(),
    },
    {
      key: 'grossTotal',
      label: 'Gross revenue',
      icon: 'card',
      tone: styles.iconSuccess,
      value: formatMoney(grossTotal, currency),
    },
    {
      key: 'refundedTotal',
      label: 'Refunded',
      icon: 'arrowLeft',
      tone: styles.iconError,
      value: formatMoney(refundedTotal, currency),
    },
    {
      key: 'net',
      label: 'Net revenue',
      icon: 'chart',
      tone: styles.iconAccent,
      value: formatMoney(netTotal, currency),
    },
  ];

  return (
    <div {...stylex.props(styles.grid)}>
      {tiles.map((tile) => (
        <Card key={tile.key} variant="default" padding={0} xstyle={styles.tile}>
          <Icon name={tile.icon} {...stylex.props(styles.icon, tile.tone)} />
          <div {...stylex.props(styles.value)}>{tile.value}</div>
          <div {...stylex.props(styles.label)}>{tile.label}</div>
        </Card>
      ))}
    </div>
  );
}
