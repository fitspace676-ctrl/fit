import type { ProductRosterSummary } from '@fit/types';
import { Card, Icon, type IconName } from '@/components/ui';

/** One summary tile's static config — icon, label, accent tone, and value. */
type Tile = {
  key: string;
  label: string;
  icon: IconName;
  /** Tailwind text-colour class for the tile's icon, matching the formacore tiles. */
  tone: string;
  value: string;
};

/**
 * The product catalog summary tiles (T4.5) — four at-a-glance counts for the whole
 * filtered set (not just the visible page), matching the formacore shop artboard's
 * KPI row: how many products match, how many are active, and the low-stock /
 * out-of-stock alert counts that surface a thinning catalog. Server-rendered from
 * the `GET /admin/products` response `summary`, so the tiles always agree with the
 * grid below.
 */
export function ProductsSummary({ summary }: { summary: ProductRosterSummary }) {
  const { productCount, activeCount, lowStockCount, outOfStockCount } = summary;

  const tiles: Tile[] = [
    {
      key: 'products',
      label: 'Products',
      icon: 'bag',
      tone: 'text-brand-500 dark:text-brand-300',
      value: productCount.toLocaleString(),
    },
    {
      key: 'active',
      label: 'Active',
      icon: 'check',
      tone: 'text-success-600 dark:text-success-300',
      value: activeCount.toLocaleString(),
    },
    {
      key: 'low',
      label: 'Low stock',
      icon: 'flame',
      tone: 'text-warning-600 dark:text-warning-300',
      value: lowStockCount.toLocaleString(),
    },
    {
      key: 'out',
      label: 'Out of stock',
      icon: 'info',
      tone: 'text-danger-600 dark:text-danger-300',
      value: outOfStockCount.toLocaleString(),
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
