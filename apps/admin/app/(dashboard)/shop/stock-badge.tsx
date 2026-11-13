'use client';

import { useLocale, useTranslations } from 'next-intl';
import { createNumberFormat } from '@fit/i18n';
import { resolveStockLevel, type AdminProductRow, type StockLevel } from '@fit/types';
import { Badge, type BadgeTone } from '@fit/ui-kit';

export type { StockLevel };

/** The badge tone each stock level wears on a catalog card. */
const STOCK_TONES: Record<StockLevel, BadgeTone> = {
  untracked: 'neutral',
  out: 'danger',
  low: 'pending',
  in: 'positive',
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
 *
 * The count is ALWAYS the gym-wide roll-up — `AdminProductRow` has no per-branch
 * figure and the catalogue endpoint takes no branch. `branchName`, when the console
 * is scoped to a branch, does not change the number: it appends the scope to the
 * badge's accessible name, so a card read on its own — by a screen reader, or
 * hovered away from the page's scope line — cannot be taken for that branch's shelf.
 * Suppressing the badge under a filter was the alternative and is worse: it hides a
 * true fact to avoid a misreading a label fixes.
 */
export function StockBadge({
  row,
  branchName = null,
}: {
  row: Pick<AdminProductRow, 'lowestStock' | 'totalStock' | 'lowStockThreshold'>;
  /** The console's active branch, or `null` in "All locations" mode. */
  branchName?: string | null;
}) {
  const t = useTranslations('admin.shop.stockBadge');
  const locale = useLocale();
  const level = stockLevel(row);
  const label = t(level);
  const tone = STOCK_TONES[level];
  const counted = level === 'low' || level === 'in';
  const countText = counted ? createNumberFormat(locale).format(row.totalStock) : '';
  const badgeText = counted ? t('withCount', { label, count: countText }) : label;
  const badge = <Badge tone={tone} label={badgeText} />;

  if (branchName === null) {
    return badge;
  }
  const scope = counted
    ? t('titleCounted', { label, count: countText, branch: branchName })
    : t('titleUncounted', { label, branch: branchName });
  return (
    <span title={scope} aria-label={scope}>
      {badge}
    </span>
  );
}
