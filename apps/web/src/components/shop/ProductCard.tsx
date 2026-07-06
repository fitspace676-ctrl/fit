import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Card } from '@astryxdesign/core/Card';
import type { ProductSummary } from '@fit/types';
import { formatMoney } from '@/lib/shop';
import { Icon } from '@/src/components/ui';
import { AddToCartButton } from './AddToCartButton';

// Astryx migration (T11.15): the shop product card is rebuilt on the Astryx
// `Card` over the Fit brand theme tokens, with the thumbnail / copy / price row
// authored in compiled StyleX (`var(--color-*)` / `var(--font-family-*)`) — no
// Tailwind utilities. The "from <lowest>" pricing logic is unchanged.

const styles = stylex.create({
  card: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1rem',
  },
  thumb: {
    aspectRatio: '1 / 1',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    display: 'grid',
    placeItems: 'center',
  },
  img: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    color: 'var(--color-text-disabled)',
  },
  placeholderIcon: {
    height: '2.5rem',
    width: '2.5rem',
  },
  body: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '0.25rem',
  },
  name: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  description: {
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  footer: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  price: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
});

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
    <Card variant="default" padding={0} xstyle={styles.card}>
      <div {...stylex.props(styles.thumb)}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" {...stylex.props(styles.img)} />
        ) : (
          <span aria-hidden {...stylex.props(styles.placeholder)}>
            <Icon name="bag" {...stylex.props(styles.placeholderIcon)} sw={1.8} />
          </span>
        )}
      </div>

      <div {...stylex.props(styles.body)}>
        <h2 {...stylex.props(styles.name)}>{product.name}</h2>
        {product.description && <p {...stylex.props(styles.description)}>{product.description}</p>}
      </div>

      <div {...stylex.props(styles.footer)}>
        <p {...stylex.props(styles.price)}>{showFrom ? t('browse.fromPrice', { price }) : price}</p>
        <AddToCartButton product={product} />
      </div>
    </Card>
  );
}
