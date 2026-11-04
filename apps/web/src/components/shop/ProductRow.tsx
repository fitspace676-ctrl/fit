'use client';

import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { encodeVariantRef, type CartView, type ProductSummary } from '@fit/types';
import { Button } from '@/src/components/ui/kit';
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
  options: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  unavailable: {
    textDecoration: 'line-through',
  },
  hint: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
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
  cart: CartView;
  /** Hand the fresh cart up after an add / step, so the panel re-renders. */
  onCart: (cart: CartView) => void;
}

/** A product's selected option determines its price and exact cart line. */
export function ProductRow({ product, cart, onCart }: ProductRowProps) {
  const t = useTranslations('shop');
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasVariants = product.variants.length > 0;
  const selected = product.variants.find((variant) => variant.id === selectedId);
  const soldOut = hasVariants && product.variants.every((variant) => !variant.available);
  const variantId = hasVariants
    ? selected
      ? encodeVariantRef(product.id, Number(selected.id))
      : null
    : encodeVariantRef(product.id, null);
  const qty = cart.items.find((item) => item.variantId === variantId)?.qty ?? 0;
  const buyable = !hasVariants || selected?.available === true;
  const prices = product.variants.map((variant) => variant.priceAmount);
  const amount = selected?.priceAmount ?? (hasVariants ? Math.min(...prices) : product.priceAmount);
  const showFrom = !selected && hasVariants && Math.min(...prices) !== Math.max(...prices);
  const price = formatMoney(amount, product.currency, locale);

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
        {hasVariants ? (
          <div role="group" aria-label={t('detail.options')} {...stylex.props(styles.options)}>
            {product.variants.map((variant) => (
              <Button
                key={variant.id}
                size="inline"
                variant={selectedId === variant.id ? 'primary' : 'secondary'}
                label={variant.name}
                aria-pressed={selectedId === variant.id}
                aria-label={
                  variant.available ? variant.name : `${variant.name}: ${t('detail.outOfStock')}`
                }
                title={variant.available ? variant.name : t('detail.outOfStock')}
                disabled={!variant.available}
                xstyle={!variant.available ? styles.unavailable : undefined}
                onClick={() => setSelectedId(variant.id)}
              />
            ))}
          </div>
        ) : null}
        {hasVariants && !selected && !soldOut ? (
          <p {...stylex.props(styles.hint)}>{t('detail.chooseOption')}</p>
        ) : null}
        {soldOut || selected?.available === false ? (
          <p {...stylex.props(styles.soldOut)}>{t('detail.outOfStock')}</p>
        ) : (
          <p {...stylex.props(styles.price)}>
            {showFrom ? t('browse.fromPrice', { price }) : price}
          </p>
        )}
      </div>

      {soldOut ? null : (
        <QtyControl variantId={variantId} disabled={!buyable} qty={qty} onCart={onCart} />
      )}
    </article>
  );
}
