'use client';

import { useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { MAX_CART_LINE_QUANTITY, type CartView } from '@fit/types';
import { formatMoney } from '@/lib/shop';
import { Link } from '@/src/i18n/navigation';
import { controlSize, Icon, useToast } from '@/src/components/ui';
import { removeCartItemAction, updateCartItemAction } from '@/app/actions/cart';

// FormaCore redesign — the cart, kept on screen beside the catalogue.
//
// On mobile the artboard hides it behind a bag button and opens it as a sheet,
// because a phone has one column to spend. A desktop has two, and hiding the
// cart there costs the thing the shop is actually for: seeing the running total
// while you decide. So the sheet becomes a sticky right-hand column — same
// content, same order (lines, then the subtotal set as a big mono numeral, then
// the action), simply never dismissed.
//
// It stops at the cart and does NOT check out. Completing an order needs a
// pickup location and a promo field, and cramming those into a 320px column
// would either shrink them to unusable or turn the panel into a second copy of
// `/member/cart` that has to be kept in step with the first. The panel's job is
// the running answer to "what am I buying and what does it cost"; the CTA hands
// that off to the page that already owns the rest.

const styles = stylex.create({
  // Sticky under the header at desktop widths; in the single-column layout the
  // parent puts it first, where a plain block is correct.
  panel: {
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'sticky',
    },
    top: '5.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    borderRadius: 'var(--radius-container)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  title: {
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
  // The lines scroll inside the panel rather than growing it past the viewport,
  // so the subtotal and the CTA stay reachable however full the cart is.
  lines: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    maxHeight: {
      default: null,
      '@media (min-width: 1024px)': 'min(46vh, 26rem)',
    },
    overflowY: {
      default: null,
      '@media (min-width: 1024px)': 'auto',
    },
  },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  thumb: {
    display: 'grid',
    height: '3rem',
    width: '3rem',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: 'var(--radius-inner)',
    backgroundColor: 'var(--color-background-muted)',
  },
  img: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  initial: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.125rem',
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
  },
  lineBody: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
    flexDirection: 'column',
    gap: '0.125rem',
  },
  // Two lines, then clamp. Ellipsising at one line left "Whey Protein 1kg ·…"
  // — the product named, the variant eaten, in a column narrow enough that most
  // names hit it. Wrapping costs a few pixels of height and keeps the line
  // identifiable, which is the whole point of listing it.
  lineName: {
    margin: 0,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.8125rem',
    fontWeight: 600,
    lineHeight: 1.3,
    color: 'var(--color-text-primary)',
  },
  lineUnit: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  lineGone: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    // `--color-danger` is not one of this theme's tokens — the categorical red
    // is `--color-text-red`. An undefined var here would silently inherit the
    // primary ink and the flag would read as ordinary meta.
    color: 'var(--color-text-red)',
  },
  stepper: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.125rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-background-muted)',
    padding: '0.1875rem',
  },
  step: {
    display: 'grid',
    height: '1.75rem',
    width: '1.75rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    borderWidth: 0,
    backgroundColor: { default: 'transparent', ':hover': 'var(--color-overlay-hover)' },
    color: { default: 'var(--color-text-secondary)', ':hover': 'var(--color-text-primary)' },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
  },
  qty: {
    minWidth: '1.25rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.8125rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  stepGlyph: {
    height: '0.875rem',
    width: '0.875rem',
  },
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  // The subtotal, set as the direction's signature giant mono numeral. The rule
  // above it is the panel's only divider — money is the one thing here that
  // earns a hard separation from the list.
  totals: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1.125rem',
  },
  totalLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  totalValue: {
    marginTop: '0.375rem',
    marginBottom: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.625rem',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.03em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  cta: {
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'var(--radius-element)',
    backgroundColor: {
      default: 'var(--color-accent)',
      ':hover': 'var(--color-accent-hover)',
    },
    color: 'var(--color-on-accent)',
    textDecoration: 'none',
  },
  // Empty state — the panel keeps its footprint so the layout does not jump the
  // moment the first item lands.
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    paddingBlock: '2rem',
    textAlign: 'center',
  },
  emptyIcon: {
    height: '1.75rem',
    width: '1.75rem',
    color: 'var(--color-text-secondary)',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
});

export interface CartPanelProps {
  cart: CartView;
  onCart: (cart: CartView) => void;
}

/**
 * The shop's cart, as a column beside the catalogue: every line with its unit
 * price and a quantity stepper, the running subtotal, and the hand-off to
 * `/member/cart` where the pickup location, promo code and payment live. Lines
 * mutate through the same server actions as the catalogue rows and re-render off
 * the fresh cart each one returns.
 */
export function CartPanel({ cart, onCart }: CartPanelProps) {
  const t = useTranslations('shop.cart');
  const tm = useTranslations('member.cart');
  const locale = useLocale();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const units = cart.items.reduce((sum, item) => sum + item.qty, 0);

  function run(mutate: () => Promise<Awaited<ReturnType<typeof updateCartItemAction>>>) {
    startTransition(async () => {
      const res = await mutate();
      if (res.ok) {
        onCart(res.cart);
        return;
      }
      toast(tm('errUpdate'), { tone: 'danger', icon: 'x' });
    });
  }

  return (
    <aside {...stylex.props(styles.panel)} aria-label={t('title')}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t('title')}</h2>
        {units > 0 ? (
          <p {...stylex.props(styles.count)}>{t('itemCount', { count: units })}</p>
        ) : null}
      </div>

      {cart.items.length === 0 ? (
        <div {...stylex.props(styles.empty)}>
          <Icon name="bag" sw={1.8} {...stylex.props(styles.emptyIcon)} />
          <p {...stylex.props(styles.emptyTitle)}>{t('empty.title')}</p>
          <p {...stylex.props(styles.emptyHint)}>{t('empty.subtitle')}</p>
        </div>
      ) : (
        <>
          <ul {...stylex.props(styles.lines)}>
            {cart.items.map((item) => (
              <li key={item.variantId} {...stylex.props(styles.line)}>
                <div {...stylex.props(styles.thumb)}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" {...stylex.props(styles.img)} />
                  ) : (
                    <span aria-hidden {...stylex.props(styles.initial)}>
                      {item.productName.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div {...stylex.props(styles.lineBody)}>
                  <p {...stylex.props(styles.lineName)}>
                    {item.variantName
                      ? `${item.productName} · ${item.variantName}`
                      : item.productName}
                  </p>
                  {/* An out-of-stock line stays visible so the buyer sees it —
                      it is dropped at checkout, not silently here. */}
                  {item.available ? (
                    <p {...stylex.props(styles.lineUnit)}>
                      {t('eachPrice', {
                        price: formatMoney(item.unitPrice, item.currency, locale),
                      })}
                    </p>
                  ) : (
                    <p {...stylex.props(styles.lineGone)}>{tm('outOfStock')}</p>
                  )}
                </div>

                <div {...stylex.props(styles.stepper)}>
                  <button
                    type="button"
                    aria-label={item.qty === 1 ? t('remove') : t('decrease')}
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        item.qty === 1
                          ? removeCartItemAction(item.variantId)
                          : updateCartItemAction(item.variantId, item.qty - 1),
                      )
                    }
                    {...stylex.props(styles.step, pending && styles.disabled)}
                  >
                    <Icon
                      name={item.qty === 1 ? 'trash' : 'minus'}
                      sw={2}
                      {...stylex.props(styles.stepGlyph)}
                    />
                  </button>

                  <span {...stylex.props(styles.qty)}>{item.qty}</span>

                  <button
                    type="button"
                    aria-label={t('increase')}
                    disabled={pending || item.qty >= MAX_CART_LINE_QUANTITY}
                    onClick={() => run(() => updateCartItemAction(item.variantId, item.qty + 1))}
                    {...stylex.props(
                      styles.step,
                      (pending || item.qty >= MAX_CART_LINE_QUANTITY) && styles.disabled,
                    )}
                  >
                    <Icon name="plus" sw={2} {...stylex.props(styles.stepGlyph)} />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div {...stylex.props(styles.totals)}>
            <div>
              <p {...stylex.props(styles.totalLabel)}>{t('subtotal')}</p>
              <p {...stylex.props(styles.totalValue)}>
                {formatMoney(cart.total, cart.currency, locale)}
              </p>
            </div>
          </div>

          <Link
            href="/member/cart"
            {...stylex.props(styles.cta, controlSize.page, controlSize.full)}
          >
            {t('checkout')}
          </Link>
        </>
      )}
    </aside>
  );
}
