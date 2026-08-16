'use client';

import { useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import {
  encodeVariantRef,
  MAX_CART_LINE_QUANTITY,
  type CartView,
  type ProductSummary,
} from '@fit/types';
import { Icon, useToast } from '@/src/components/ui';
import { addToCartAction, removeCartItemAction, updateCartItemAction } from '@/app/actions/cart';

// FormaCore redesign — the catalogue's add control, in the artboard's two states.
//
// Not in the cart, it is a single lime circle with a plus: one target, one
// meaning. Once the product is in the cart the control BECOMES the stepper —
// minus, the count as a mono numeral, plus — in place, so the row that added it
// is also the row that adjusts it. That is the whole reason the count lives out
// here rather than only in the panel: the answer to "did that land, and how many
// do I have?" belongs where the click happened.
//
// The lime is on the plus alone. Increment is the action the shop wants; minus
// is its quiet counterpart, and painting both would spend the accent on a pair
// of arrows rather than on a direction.

const styles = stylex.create({
  // The 44px circle — the same footprint as the stepper it turns into, so the
  // row does not reflow when the first unit lands.
  add: {
    display: 'grid',
    height: '2.75rem',
    width: '2.75rem',
    flexShrink: 0,
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'var(--color-accent-hover)',
    },
    color: 'var(--color-on-accent)',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  stepper: {
    display: 'flex',
    height: '2.75rem',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.25rem',
  },
  step: {
    display: 'grid',
    height: '2.25rem',
    width: '2.25rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  stepUp: {
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'var(--color-accent-hover)',
    },
    color: { default: 'var(--color-on-accent)', ':hover': 'var(--color-on-accent)' },
  },
  count: {
    minWidth: '1.5rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.9375rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  glyph: {
    height: '1.0625rem',
    width: '1.0625rem',
  },
});

export interface QtyControlProps {
  product: ProductSummary;
  /** Units of this product currently in the cart. */
  qty: number;
  onCart: (cart: CartView) => void;
}

/**
 * Add-to-cart for a catalogue row: a lime plus while the product is not in the
 * cart, a quantity stepper once it is. Adds the first variant (or the base
 * purchase when the product has none) and hands the fresh cart the server action
 * returns straight up, so the panel and this count move together without a
 * round-trip through the router.
 */
export function QtyControl({ product, qty, onCart }: QtyControlProps) {
  const t = useTranslations('member.cart');
  const tc = useTranslations('shop.cart');
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const variantId =
    product.variants.length > 0
      ? encodeVariantRef(product.id, 0)
      : encodeVariantRef(product.id, null);

  /** Run a cart mutation, surfacing the fresh cart or a tagged failure. */
  function run(mutate: () => Promise<Awaited<ReturnType<typeof addToCartAction>>>, fail: string) {
    startTransition(async () => {
      const res = await mutate();
      if (res.ok) {
        onCart(res.cart);
        return;
      }
      toast(res.code === 'UNAUTHENTICATED' ? t('signInToAdd') : fail, {
        tone: 'danger',
        icon: 'x',
      });
    });
  }

  if (qty === 0) {
    return (
      <button
        type="button"
        aria-label={t('add')}
        disabled={pending}
        onClick={() => run(() => addToCartAction(variantId, 1), t('errAdd'))}
        {...stylex.props(styles.add, pending && styles.disabled)}
      >
        <Icon name="plus" sw={2.2} {...stylex.props(styles.glyph)} />
      </button>
    );
  }

  const atMax = qty >= MAX_CART_LINE_QUANTITY;

  return (
    <div {...stylex.props(styles.stepper)}>
      <button
        type="button"
        aria-label={qty === 1 ? tc('remove') : tc('decrease')}
        disabled={pending}
        onClick={() =>
          run(
            // `PATCH … { qty: 0 }` is rejected by design — dropping the last
            // unit is the dedicated DELETE, not a quantity of nothing.
            () =>
              qty === 1
                ? removeCartItemAction(variantId)
                : updateCartItemAction(variantId, qty - 1),
            t('errUpdate'),
          )
        }
        {...stylex.props(styles.step, pending && styles.disabled)}
      >
        <Icon name="minus" sw={2.2} {...stylex.props(styles.glyph)} />
      </button>

      <span {...stylex.props(styles.count)}>{qty}</span>

      <button
        type="button"
        aria-label={tc('increase')}
        disabled={pending || atMax}
        onClick={() => run(() => updateCartItemAction(variantId, qty + 1), t('errUpdate'))}
        {...stylex.props(styles.step, styles.stepUp, (pending || atMax) && styles.disabled)}
      >
        <Icon name="plus" sw={2.2} {...stylex.props(styles.glyph)} />
      </button>
    </div>
  );
}
