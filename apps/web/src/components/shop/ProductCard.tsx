import { useLocale, useTranslations } from 'next-intl';
import type { ProductSummary } from '@fit/types';
import { formatMoney } from '@/lib/shop';

export interface ProductCardProps {
  product: ProductSummary;
}

/**
 * One shop product as a card in the listing grid: a square image (or a neutral
 * placeholder when the product has no image), the name, a truncated description,
 * and the price. When a product has variants priced below the base the card
 * shows a "from <lowest>" so the buyer sees the entry price. Purely
 * presentational — the grid owns layout and the fetch lives a level up. Mirrors
 * the mobile `ProductCard` (T6.7) so the two storefronts read identically.
 */
export function ProductCard({ product }: ProductCardProps) {
  const t = useTranslations('shop');
  const locale = useLocale();

  // Show "from <lowest>" only when a variant prices below the base — otherwise
  // the base price is the single, honest number.
  const variantPrices = product.variants.map((variant) => variant.priceAmount);
  const lowest = variantPrices.length > 0 ? Math.min(...variantPrices, product.priceAmount) : null;
  const showFrom = lowest !== null && lowest < product.priceAmount;
  const price = formatMoney(showFrom ? lowest : product.priceAmount, product.currency, locale);

  return (
    <article className="flex h-full flex-col gap-4 rounded-card border border-slate-200 bg-white p-5">
      <div className="aspect-square w-full overflow-hidden rounded-card bg-slate-50">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex h-full w-full items-center justify-center text-4xl text-slate-300"
          >
            🛍️
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="truncate text-base font-semibold text-slate-900">{product.name}</h2>
        {product.description && (
          <p className="line-clamp-2 text-sm text-slate-500">{product.description}</p>
        )}
      </div>

      <p className="mt-auto text-base font-semibold text-brand-600">
        {showFrom ? t('browse.fromPrice', { price }) : price}
      </p>
    </article>
  );
}
