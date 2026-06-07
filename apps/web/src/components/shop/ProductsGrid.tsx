import { useTranslations } from 'next-intl';
import type { ProductSummary } from '@fit/types';
import { ProductCard } from './ProductCard';

export interface ProductsGridProps {
  products: ProductSummary[];
}

/**
 * Responsive card grid for the shop listing: one column on phones, two on
 * tablets, three on desktop. Stateless — the parent supplies the products.
 */
export function ProductsGrid({ products }: ProductsGridProps) {
  const t = useTranslations('shop');

  return (
    <ul
      aria-label={t('grid.label')}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {products.map((product) => (
        <li key={product.id} className="flex">
          <div className="w-full">
            <ProductCard product={product} />
          </div>
        </li>
      ))}
    </ul>
  );
}
