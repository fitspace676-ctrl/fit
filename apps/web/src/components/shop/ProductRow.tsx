import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { CartView, ProductSummary } from '@fit/types';
import { formatMoney } from '@/lib/shop';
import { QtyControl } from './QtyControl';

// FormaCore redesign — one catalogue product, as the shop artboard draws it.
//
// It replaces a square photo card in a four-up grid. The grid was a storefront
// pattern borrowed from shops that sell on imagery; this one sells five or six
// SKUs a member already knows by name — protein, a tee, bands, a towel. In that
// catalogue a big photo tile is mostly empty space, and four columns of it
// pushed the price and the add button down where they had to be hunted for.
//
// The artboard's answer is a horizontal row: a small square thumb, the name and
// its meta, the price, and the add control — all on one baseline, so scanning
// down the list compares like against like. The whole row is one flat block on
// the canvas; no shadow, no border, no hover lift.
//
// The thumb is deliberately NEUTRAL. Lime is the direction's single chromatic
// voice and it marks what the member acts on — never merchandise. A product
// without an image gets its initial set as a large mono glyph rather than a
// generic bag outline: it is a distinguishable mark per product, so a list of
// imageless items still reads as a list of different things.

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--fc-tile-hover)',
    },
    padding: '1rem',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  thumb: {
    position: 'relative',
    display: 'grid',
    height: '4.5rem',
    width: '4.5rem',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  img: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  // The product's initial as the placeholder — a mark per product rather than
  // one repeated bag outline.
  initial: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.875rem',
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
  },
  body: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
    flexDirection: 'column',
    gap: '0.25rem',
  },
  // The row's focal point, at the portal's row-title step — the same as a
  // booking card or a class row. At 15px/600 it sat level with its own meta
  // line, so a column of products had nothing to scan down.
  name: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.0625rem',
    fontWeight: 800,
    lineHeight: 1.25,
    letterSpacing: '-0.01em',
    color: 'var(--color-text-primary)',
  },
  meta: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  // Money is mono and tabular everywhere in the portal, so a column of prices
  // lines up on the decimal.
  //
  // INK, NOT LIME. The price was `--color-text-accent`, which put a second lime
  // on every row beside the lime add button — and the accent is supposed to mark
  // what the member ACTS on. A price is not an action; it is the fact the action
  // is about. With the price in ink the plus is the only lime in the row, which
  // is what makes it findable at a glance down a list.
  price: {
    marginTop: '0.375rem',
    marginBottom: 0,
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  soldOut: {
    marginTop: '0.375rem',
    marginBottom: 0,
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
  },
});

export interface ProductRowProps {
  product: ProductSummary;
  /** Units of this product already in the cart, summed across its variants. */
  qty: number;
  /** Hand the fresh cart up after an add / step, so the panel re-renders. */
  onCart: (cart: CartView) => void;
}

/**
 * One product in the shop list: thumb, name, variant meta, price, and the add /
 * quantity control. When a variant prices below the base the row shows a "from
 * <lowest>" so the buyer sees the entry price. A product whose every variant is
 * out of stock is still listed — flagged, without an add control — so the buyer
 * sees what exists rather than a silently shorter catalogue.
 */
export function ProductRow({ product, qty, onCart }: ProductRowProps) {
  const t = useTranslations('shop');
  const locale = useLocale();

  // Show "from <lowest>" only when a variant prices below the base — otherwise
  // the base price is the single, honest number.
  const variantPrices = product.variants.map((variant) => variant.priceAmount);
  const lowest = variantPrices.length > 0 ? Math.min(...variantPrices, product.priceAmount) : null;
  const showFrom = lowest !== null && lowest < product.priceAmount;
  const price = formatMoney(showFrom ? lowest : product.priceAmount, product.currency, locale);

  // A product with no variants is bought at its base price and is always
  // orderable; one with variants is orderable while any of them is in stock.
  const soldOut =
    product.variants.length > 0 && product.variants.every((variant) => !variant.available);

  return (
    <article {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.thumb)}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" {...stylex.props(styles.img)} />
        ) : (
          <span aria-hidden {...stylex.props(styles.initial)}>
            {product.name.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div {...stylex.props(styles.body)}>
        <h3 {...stylex.props(styles.name)}>{product.name}</h3>
        <p {...stylex.props(styles.meta)}>
          {product.variants.length > 1
            ? t('browse.variantCount', { count: product.variants.length })
            : t('browse.oneVariant')}
        </p>
        {soldOut ? (
          <p {...stylex.props(styles.soldOut)}>{t('detail.outOfStock')}</p>
        ) : (
          <p {...stylex.props(styles.price)}>
            {showFrom ? t('browse.fromPrice', { price }) : price}
          </p>
        )}
      </div>

      {soldOut ? null : <QtyControl product={product} qty={qty} onCart={onCart} />}
    </article>
  );
}
