'use client';

import { useState, useTransition } from 'react';
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  SelectField,
} from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import type { CartView, LocationSummary } from '@fit/types';
import { Icon, useToast } from '@/src/components/ui';
import { formatMoney } from '@/lib/shop';
import { checkoutCartAction, removeCartItemAction, updateCartItemAction } from '@/app/actions/cart';

// Astryx migration (T11), now on the portal kit: the shop cart + checkout is rebuilt on the portal kit
// `Card` / `Button` / `IconButton` / `Badge` / `Selector` / `TextInput` over the
// Fit brand theme tokens, with the quantity stepper, payment-method picker and
// totals authored in compiled StyleX (`var(--color-*)` / `var(--font-family-*)`)
// — no Tailwind utilities. Cart state, the checkout server action and the
// totals are unchanged.
//
// THE PAYMENT PICKER WAS FICTION, AND IS GONE. The summary offered three methods
// — Pay at desk, Card, Apple Pay — as a real-looking radio group with a lime
// selected state and a tick. Its own source called it "(cosmetic)": the `pay`
// state was never read, never sent, never stored. `checkoutCartAction` takes a
// location and a promo code and places a pay-on-collection order, full stop. So
// choosing "Apple Pay" and pressing Place order placed a pay-at-the-desk order
// and told you nothing, which is not a styling problem — the screen made a
// promise about money that the system does not keep. The one true method is now
// stated as a fact, the way the membership screen states it.
//
// The rest is a consistency pass with the other member screens:
//   • the head is the portal's (eyebrow · title · subtitle), not a bare `<h1>`;
//   • failures are `Banner`s inside the summary, beside the button that caused
//     them, rather than toasts at the edge of the screen;
//   • the empty cart and the placed order use the kit's `EmptyState` and the
//     lime outcome disc the booking / pause / credits flows use;
//   • money is mono everywhere, and the missing-image placeholder is the
//     product's initial — the shop already draws it that way. This screen had a
//     literal 🛍️ emoji, the only one in the portal.

const styles = stylex.create({
  // Confirmed-order panel
  successCard: {
    marginInline: 'auto',
    maxWidth: '36rem',
    padding: '2rem',
    textAlign: 'center',
  },
  // The lime disc, at page scale — the same mark the booking, pause and credit
  // flows use to say "this happened". It was a 15%-tint circle on
  // `--color-success`, which in FormaCore IS the lime, so it read as a washed
  // version of a colour the portal only ever uses at full strength.
  successIcon: {
    marginInline: 'auto',
    display: 'grid',
    height: '4rem',
    width: '4rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
  },
  successGlyph: {
    height: '2rem',
    width: '2rem',
  },
  successTitle: {
    marginTop: '1rem',
    marginBottom: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
  },
  successLine: {
    marginTop: '0.25rem',
    marginBottom: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  orderNo: {
    fontFamily: 'var(--font-family-code)',
    color: 'var(--color-text-primary)',
  },
  successCta: {
    marginTop: '1.5rem',
  },
  // Empty cart
  emptyWrap: {
    marginInline: 'auto',
    maxWidth: '36rem',
  },
  emptyIcon: {
    height: '2.5rem',
    width: '2.5rem',
    color: 'var(--color-text-disabled)',
  },
  emptyState: {
    paddingBlock: '3.5rem',
  },
  // Page head — the portal's, so the cart is a sibling of the bookings,
  // membership and shop screens rather than a lone `<h1>`.
  header: {
    marginBottom: '1.5rem',
  },
  eyebrow: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    textTransform: 'uppercase',
    letterSpacing: '0.2em',
    color: 'var(--color-text-secondary)',
  },
  title: {
    margin: 0,
    marginTop: '0.25rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    marginTop: '0.375rem',
    maxWidth: '52ch',
    fontSize: '0.9375rem',
    color: 'var(--color-text-secondary)',
  },
  layout: {
    display: 'grid',
    gap: '1.25rem',
    gridTemplateColumns: {
      default: '1fr',
      '@media (min-width: 1024px)': '1.6fr 1fr',
    },
  },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem',
  },
  itemThumb: {
    height: '5rem',
    width: '5rem',
    flexShrink: 0,
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
    display: 'grid',
    placeItems: 'center',
  },
  itemImg: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  // The product's initial as a mono glyph — a distinguishable mark per product,
  // the way `ProductRow` and `CartPanel` already draw a missing image. This was
  // a literal 🛍️ emoji: the same picture on every imageless line, and the only
  // emoji rendered anywhere in the portal.
  itemInitial: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.5rem',
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--color-text-secondary)',
  },
  itemBody: {
    minWidth: 0,
    flex: 1,
  },
  itemTopRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  itemName: {
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  itemVariant: {
    margin: 0,
    marginTop: '0.125rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  outOfStock: {
    marginTop: '0.375rem',
  },
  itemBottomRow: {
    marginTop: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  stepper: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    paddingInline: '0.25rem',
  },
  qty: {
    minWidth: '2rem',
    textAlign: 'center',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  lineTotal: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  // Summary
  summaryCard: {
    height: 'fit-content',
    padding: '1.5rem',
    position: {
      default: 'static',
      '@media (min-width: 1024px)': 'sticky',
    },
    top: '5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  summaryTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  // The one real method, stated rather than chosen — the same treatment the
  // membership screen gives it. Seated on the artboards' inset tile so it reads
  // as a fact of the order, not as a control you failed to notice was disabled.
  payment: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.625rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--fc-tile-border)',
    backgroundColor: 'var(--fc-tile)',
    paddingInline: '0.875rem',
    paddingBlock: '0.75rem',
  },
  paymentIcon: {
    height: '1rem',
    width: '1rem',
    flexShrink: 0,
    color: 'var(--color-text-secondary)',
  },
  paymentText: {
    minWidth: 0,
  },
  paymentLabel: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--color-text-secondary)',
  },
  paymentValue: {
    margin: 0,
    marginTop: '0.125rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  totals: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '1rem',
    fontSize: '0.875rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: 'var(--color-text-secondary)',
  },
  rowValue: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  rowValueDiscount: {
    color: 'var(--color-text-accent)',
  },
  totalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '0.5rem',
  },
  totalLabel: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  // Mono, like the shop panel's subtotal and every other figure in the portal.
  // It was the heading face, so the two totals a buyer sees in one session — the
  // panel's and this one — were set in different families.
  totalValue: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1.375rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  checkout: {
    width: '100%',
  },
  secure: {
    margin: 0,
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

export interface CartScreenProps {
  initialCart: CartView;
  locations: LocationSummary[];
}

/** The shop cart + checkout screen: editable line items, an order summary with a
 * pickup location + promo, and a checkout that places the order. */
export function CartScreen({ initialCart, locations }: CartScreenProps) {
  const t = useTranslations('member.cart');
  const locale = useLocale();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartView>(initialCart);
  const [pending, startTransition] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  // Checkout failures belong beside the button that caused them, not in a toast
  // at the corner of a screen whose summary the buyer is staring at.
  const [error, setError] = useState<string | null>(null);
  const [promo, setPromo] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, cart.currency, locale);

  function setQty(variantId: string, qty: number): void {
    startTransition(async () => {
      const res =
        qty <= 0
          ? await removeCartItemAction(variantId)
          : await updateCartItemAction(variantId, qty);
      if (res.ok) {
        setCart(res.cart);
      } else {
        toast(t('errUpdate'), { tone: 'danger', icon: 'x' });
      }
    });
  }

  function checkout(): void {
    if (!locationId) {
      setError(t('pickLocation'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await checkoutCartAction(locationId, promo || undefined);
      if (res.ok) {
        setOrderId(res.orderId);
        setCart({ items: [], subtotal: 0, discount: 0, total: 0, currency: cart.currency });
      } else {
        setError(res.code === 'PRICE_CHANGED' ? t('errPrice') : t('errCheckout'));
      }
    });
  }

  if (orderId) {
    return (
      <Card padding="none" xstyle={styles.successCard}>
        <span {...stylex.props(styles.successIcon)}>
          <Icon name="check" {...stylex.props(styles.successGlyph)} sw={2.4} />
        </span>
        <h1 {...stylex.props(styles.successTitle)}>{t('confirmed')}</h1>
        <p {...stylex.props(styles.successLine)}>
          {t('orderNo')} <span {...stylex.props(styles.orderNo)}>{orderId}</span>
        </p>
        <p {...stylex.props(styles.successLine)}>{t('collectHint')}</p>
        <ButtonLink
          href="/member/shop"
          variant="primary"
          size="card"
          label={t('continueShopping')}
          xstyle={styles.successCta}
        />
      </Card>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyWrap)}>
        <Head t={t} />
        <Card>
          <EmptyState
            icon={<Icon name="bag" {...stylex.props(styles.emptyIcon)} />}
            title={t('empty')}
            body={t('emptyHint')}
            action={
              <ButtonLink
                href="/member/shop"
                variant="primary"
                size="card"
                icon={<Icon name="bag" />}
                label={t('browseShop')}
              />
            }
            xstyle={styles.emptyState}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Head t={t} />
      <div {...stylex.props(styles.layout)}>
        {/* Items */}
        <div {...stylex.props(styles.items)}>
          {cart.items.map((item) => (
            <Card key={item.variantId} padding="none" xstyle={styles.itemCard}>
              <div {...stylex.props(styles.itemThumb)}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" {...stylex.props(styles.itemImg)} />
                ) : (
                  <span aria-hidden {...stylex.props(styles.itemInitial)}>
                    {item.productName.trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div {...stylex.props(styles.itemBody)}>
                <div {...stylex.props(styles.itemTopRow)}>
                  <div style={{ minWidth: 0 }}>
                    <p {...stylex.props(styles.itemName)}>{item.productName}</p>
                    {item.variantName && (
                      <p {...stylex.props(styles.itemVariant)}>{item.variantName}</p>
                    )}
                    {!item.available && (
                      <span {...stylex.props(styles.outOfStock)}>
                        <Badge tone="danger" label={t('outOfStock')} />
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="inline"
                    label={t('remove')}
                    icon={<Icon name="trash" />}
                    disabled={pending}
                    onClick={() => setQty(item.variantId, 0)}
                  />
                </div>
                <div {...stylex.props(styles.itemBottomRow)}>
                  <div {...stylex.props(styles.stepper)}>
                    <Button
                      variant="ghost"
                      size="inline"
                      label={t('decrease')}
                      icon={<Icon name="minus" />}
                      disabled={pending}
                      onClick={() => setQty(item.variantId, item.qty - 1)}
                    />
                    <span {...stylex.props(styles.qty)}>{item.qty}</span>
                    <Button
                      variant="ghost"
                      size="inline"
                      label={t('increase')}
                      icon={<Icon name="plus" />}
                      disabled={pending}
                      onClick={() => setQty(item.variantId, item.qty + 1)}
                    />
                  </div>
                  <p {...stylex.props(styles.lineTotal)}>{money(item.lineTotal)}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Summary */}
        <Card padding="none" xstyle={styles.summaryCard}>
          <h2 {...stylex.props(styles.summaryTitle)}>{t('summary')}</h2>

          {/* Pickup location */}
          {locations.length > 0 && (
            <SelectField
              label={t('pickup')}
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
            />
          )}

          {/* How this order is paid — stated, not chosen. See the note at the
              top of the file: the three-way picker that stood here was
              decorative, and "Apple Pay" placed a pay-at-desk order. */}
          <div {...stylex.props(styles.payment)}>
            <Icon name="card" {...stylex.props(styles.paymentIcon)} sw={2.2} />
            <div {...stylex.props(styles.paymentText)}>
              <p {...stylex.props(styles.paymentLabel)}>{t('payment')}</p>
              <p {...stylex.props(styles.paymentValue)}>{t('payDesk')}</p>
            </div>
          </div>

          {/* Promo */}
          <Field
            type="text"
            label={t('promo')}
            value={promo}
            placeholder={t('promo')}
            onChange={(event) => setPromo(event.target.value)}
          />

          {/* Totals */}
          <div {...stylex.props(styles.totals)}>
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.rowLabel)}>{t('subtotal')}</span>
              <span {...stylex.props(styles.rowValue)}>{money(cart.subtotal)}</span>
            </div>
            {cart.discount > 0 && (
              <div {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.rowLabel)}>{t('discount')}</span>
                <span {...stylex.props(styles.rowValue, styles.rowValueDiscount)}>
                  −{money(cart.discount)}
                </span>
              </div>
            )}
            <div {...stylex.props(styles.totalRow)}>
              <span {...stylex.props(styles.totalLabel)}>{t('total')}</span>
              <span {...stylex.props(styles.totalValue)}>{money(cart.total)}</span>
            </div>
          </div>

          {error ? <Banner tone="error">{error}</Banner> : null}

          <Button
            variant="primary"
            size="block"
            icon={<Icon name="bag" />}
            label={pending ? t('placing') : `${t('placeOrder')} · ${money(cart.total)}`}
            loading={pending}
            disabled={pending || cart.items.length === 0}
            onClick={checkout}
            xstyle={styles.checkout}
          />
          <p {...stylex.props(styles.secure)}>{t('securePayment')}</p>
        </Card>
      </div>
    </div>
  );
}

/** The portal's page head — eyebrow, title, subtitle — shared by both states. */
function Head({ t }: { t: (key: string) => string }) {
  return (
    <header {...stylex.props(styles.header)}>
      <p {...stylex.props(styles.eyebrow)}>{t('eyebrow')}</p>
      <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
      <p {...stylex.props(styles.subtitle)}>{t('subtitle')}</p>
    </header>
  );
}
