import { resolveStockLevel, type AdminProductRow, type StockLevel } from '@fit/types';
import { Badge, type Tone } from '@/components/ui';

export type { StockLevel };

/** The badge label + tone each stock level wears on a catalog card. */
const STOCK_STYLES: Record<StockLevel, { label: string; tone: Tone }> = {
  untracked: { label: 'Untracked', tone: 'ink' },
  out: { label: 'Out of stock', tone: 'danger' },
  low: { label: 'Low stock', tone: 'warning' },
  in: { label: 'In stock', tone: 'success' },
};

/**
 * Classify a roster row's stock. Delegates to `resolveStockLevel` in `@fit/types`
 * — the same function the API's KPI totals and low-stock report run — so a product
 * can never read "low" on its card while counting as healthy in the tile above it.
 * The product's own `lowStockThreshold` wins when it has set one; otherwise the
 * shared default applies.
 */
export function stockLevel(
  row: Pick<AdminProductRow, 'lowestStock' | 'lowStockThreshold'>,
): StockLevel {
  return resolveStockLevel(row);
}

/**
 * The stock badge a catalog card wears. Matches the formacore shop artboard: a tone
 * dot of green / amber / red for in / low / out, a muted pill when stock is
 * untracked. The low + in states carry the on-hand count so staff can see how deep
 * the shortfall is without opening the product.
 */
export function StockBadge({
  row,
}: {
  row: Pick<AdminProductRow, 'lowestStock' | 'totalStock' | 'lowStockThreshold'>;
}) {
  const level = stockLevel(row);
  const { label, tone } = STOCK_STYLES[level];
  const suffix = level === 'low' || level === 'in' ? ` · ${row.totalStock}` : '';
  return (
    <Badge tone={tone}>
      {label}
      {suffix}
    </Badge>
  );
}
