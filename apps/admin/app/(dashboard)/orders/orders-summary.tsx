import type { OrderRosterSummary } from '@fit/types';
import { Card, Icon, type IconName } from '@/components/ui';
import { formatMoney } from './format';

/** One summary tile's static config — icon, label, and accent tone. */
type Tile = {
  key: keyof OrderRosterSummary | 'net';
  label: string;
  icon: IconName;
  /** Tailwind text-colour class for the tile's icon, matching the formacore tiles. */
  tone: string;
  value: string;
};

/**
 * The orders roster summary tiles (T4.3) — four at-a-glance totals for the whole
 * filtered set (not just the visible page), matching the formacore orders artboard
 * KPI row: the order count, gross takings, the amount refunded, and the net kept
 * after refunds. Money formats in the roster's own currency. Server-rendered from
 * the `GET /orders` response `summary`, so it always agrees with the table below.
 */
export function OrdersSummary({ summary }: { summary: OrderRosterSummary }) {
  const { orderCount, grossTotal, refundedTotal, netTotal, currency } = summary;

  const tiles: Tile[] = [
    {
      key: 'orderCount',
      label: 'Orders',
      icon: 'bag',
      tone: 'text-brand-500 dark:text-brand-300',
      value: orderCount.toLocaleString(),
    },
    {
      key: 'grossTotal',
      label: 'Gross revenue',
      icon: 'card',
      tone: 'text-success-600 dark:text-success-300',
      value: formatMoney(grossTotal, currency),
    },
    {
      key: 'refundedTotal',
      label: 'Refunded',
      icon: 'arrowLeft',
      tone: 'text-danger-600 dark:text-danger-300',
      value: formatMoney(refundedTotal, currency),
    },
    {
      key: 'net',
      label: 'Net revenue',
      icon: 'chart',
      tone: 'text-accent-600 dark:text-accent-300',
      value: formatMoney(netTotal, currency),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.key} glow className="p-4 sm:p-5">
          <Icon name={tile.icon} className={`h-5 w-5 ${tile.tone}`} />
          <div className="mt-3 font-display text-2xl font-extrabold tracking-tight tabular-nums text-ink-900 dark:text-white">
            {tile.value}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
            {tile.label}
          </div>
        </Card>
      ))}
    </div>
  );
}
