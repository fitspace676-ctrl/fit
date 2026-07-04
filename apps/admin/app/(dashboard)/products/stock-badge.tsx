import { DEFAULT_LOW_STOCK_THRESHOLD, type AdminProductRow } from '@fit/types';
import { Badge, type Tone } from '@/components/ui';

/** A product's derived stock standing, keyed off its most-urgent variant. */
export type StockLevel = 'untracked' | 'out' | 'low' | 'in';

/** The badge label + tone each stock level wears on a catalog card. */
const STOCK_STYLES: Record<StockLevel, { label: string; tone: Tone }> = {
  untracked: { label: 'Untracked', tone: 'ink' },
  out: { label: 'Out of stock', tone: 'danger' },
  low: { label: 'Low stock', tone: 'warning' },
  in: { label: 'In stock', tone: 'success' },
};

/**
 * Classify a roster row's stock from its `lowestStock` (the smallest on-hand count
 * across its variants). A product with no variants (`lowestStock === null`) is
 * untracked; a variant at `0` is out; anything at or below the shared low-stock
 * threshold is low; otherwise it's in stock. Kept in one place so the catalog card
 * and any future surface agree on where the thresholds fall.
 */
export function stockLevel(row: Pick<AdminProductRow, 'lowestStock'>): StockLevel {
  if (row.lowestStock === null) return 'untracked';
  if (row.lowestStock === 0) return 'out';
  if (row.lowestStock <= DEFAULT_LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

/**
 * The stock badge a catalog card wears. Matches the formacore shop artboard: a tone
 * dot of green / amber / red for in / low / out, a muted pill when stock is
 * untracked. The low + out states carry the on-hand count so staff can see how deep
 * the shortfall is without opening the product.
 */
export function StockBadge({ row }: { row: Pick<AdminProductRow, 'lowestStock' | 'totalStock'> }) {
  const level = stockLevel(row);
  const { label, tone } = STOCK_STYLES[level];
  const suffix =
    level === 'low' || level === 'in' ? ` · ${row.totalStock}` : level === 'out' ? '' : '';
  return (
    <Badge tone={tone}>
      {label}
      {suffix}
    </Badge>
  );
}
