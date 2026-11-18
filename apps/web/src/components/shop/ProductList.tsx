import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { CartView, ProductSummary } from '@fit/types';
import { ProductRow } from './ProductRow';

// FormaCore redesign — the catalogue as a single column of rows.
//
// It replaces a two-to-four column card grid. With the cart now holding the
// right-hand column there is no width for four cards, and the artboard does not
// want them anyway: a stack of rows lets the eye run straight down the names and
// the prices, which is how a short catalogue of known goods is actually read.
// The section head carries the product count as a mono numeral — the direction's
// habit of stating the size of a list before you scroll it.

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  count: {
    margin: 0,
    flexShrink: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
});

export interface ProductListProps {
  products: ProductSummary[];
  cart: CartView;
  onCart: (cart: CartView) => void;
}

/**
 * The gym's catalogue as a stack of product rows, headed by the product count.
 * Each row can ask how many units of a given line (one variant, or the base
 * purchase) the cart already holds, so its control shows a stepper for the
 * variant the member has picked rather than a total across all of them.
 */
export function ProductList({ products, cart, onCart }: ProductListProps) {
  const t = useTranslations('shop');

  /** Units of one cart line (one variant of a product, or its base purchase). */
  const unitsOf = (variantRef: string) =>
    cart.items.reduce((sum, item) => (item.variantId === variantRef ? sum + item.qty : sum), 0);

  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.heading)}>{t('grid.label')}</h2>
        <p {...stylex.props(styles.count)}>{products.length}</p>
      </div>

      <ul aria-label={t('grid.label')} {...stylex.props(styles.list)}>
        {products.map((product) => (
          <li key={product.id}>
            <ProductRow
              product={product}
              unitsOf={unitsOf}
              onCart={onCart}
              memberDiscountPercent={cart.memberDiscountPercent}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
