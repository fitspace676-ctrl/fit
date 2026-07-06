import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { ProductSummary } from '@fit/types';
import { ProductCard } from './ProductCard';

// Astryx migration (T11.15): the responsive card grid is authored in compiled
// StyleX (`var(--color-*)` breakpoints) — no Tailwind utilities. The parent
// still supplies the products.

const styles = stylex.create({
  grid: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  item: {
    display: 'flex',
  },
});

export interface ProductsGridProps {
  products: ProductSummary[];
}

/**
 * Responsive card grid for the shop listing: two columns on phones, four on
 * desktop. Stateless — the parent supplies the products.
 */
export function ProductsGrid({ products }: ProductsGridProps) {
  const t = useTranslations('shop');

  return (
    <ul aria-label={t('grid.label')} {...stylex.props(styles.grid)}>
      {products.map((product) => (
        <li key={product.id} {...stylex.props(styles.item)}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
