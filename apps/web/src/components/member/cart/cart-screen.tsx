'use client';

import { useState, useTransition } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { CartView, LocationSummary } from '@fit/types';
import { Icon, useToast } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { formatMoney } from '@/lib/shop';
import { checkoutCartAction, removeCartItemAction, updateCartItemAction } from '@/app/actions/cart';

// Astryx migration (T11.15): the shop cart + checkout is rebuilt on Astryx
// `Card` / `Button` / `IconButton` / `Badge` / `Selector` / `TextInput` over the
// Fit brand theme tokens, with the quantity stepper, payment-method picker and
// totals authored in compiled StyleX (`var(--color-*)` / `var(--font-family-*)`)
// — no Tailwind utilities. Cart state, the stub-payment checkout server action
// and the totals are unchanged.

const styles = stylex.create({
  // Confirmed-order panel
  successCard: {
    marginInline: 'auto',
    maxWidth: '36rem',
    padding: '2rem',
    textAlign: 'center',
  },
  successIcon: {
    marginInline: 'auto',
    display: 'grid',
    height: '4rem',
    width: '4rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'color-mix(in srgb, var(--color-success) 15%, transparent)',
    color: 'var(--color-success)',
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
  emptyCard: {
    display: 'grid',
    placeItems: 'center',
    gap: '0.75rem',
    paddingBlock: '3.5rem',
    textAlign: 'center',
  },
  emptyIcon: {
    height: '2.5rem',
    width: '2.5rem',
    color: 'var(--color-text-disabled)',
  },
  emptyTitle: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  emptyHint: {
    margin: 0,
    maxWidth: '20rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  // Page
  title: {
    marginTop: 0,
    marginBottom: '1.5rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
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
  itemEmoji: {
    fontSize: '1.5rem',
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
  payList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  payOption: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingInline: '0.875rem',
    paddingBlock: '0.625rem',
    textAlign: 'left',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color',
    transitionDuration: '150ms',
  },
  payIdle: {
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-tint-hover)',
    },
  },
  payActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
  },
  payIcon: {
    height: '1rem',
    width: '1rem',
    color: 'var(--color-text-secondary)',
  },
  payLabel: {
    flex: 1,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  payCheck: {
    height: '1rem',
    width: '1rem',
    color: 'var(--color-text-accent)',
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
    color: 'var(--color-success)',
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
  totalValue: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.25rem',
    fontWeight: 800,
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

type Pay = 'card' | 'apple' | 'desk';

/** The shop cart + checkout screen: editable line items, an order summary with a
 * pickup location + promo, and a checkout that places the order. */
export function CartScreen({ initialCart, locations }: CartScreenProps) {
  const t = useTranslations('member.cart');
  const locale = useLocale();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartView>(initialCart);
  const [pending, startTransition] = useTransition();
  const [pay, setPay] = useState<Pay>('desk');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
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
      toast(t('pickLocation'), { tone: 'warning', icon: 'info' });
      return;
    }
    startTransition(async () => {
      const res = await checkoutCartAction(locationId, promo || undefined);
      if (res.ok) {
        setOrderId(res.orderId);
        setCart({ items: [], subtotal: 0, discount: 0, total: 0, currency: cart.currency });
      } else {
        toast(res.code === 'PRICE_CHANGED' ? t('errPrice') : t('errCheckout'), {
          tone: 'danger',
          icon: 'x',
        });
      }
    });
  }

  if (orderId) {
    return (
      <Card variant="default" padding={0} xstyle={styles.successCard}>
        <span {...stylex.props(styles.successIcon)}>
          <Icon name="check" {...stylex.props(styles.successGlyph)} sw={2.4} />
        </span>
        <h1 {...stylex.props(styles.successTitle)}>{t('confirmed')}</h1>
        <p {...stylex.props(styles.successLine)}>
          {t('orderNo')} <span {...stylex.props(styles.orderNo)}>{orderId}</span>
        </p>
        <p {...stylex.props(styles.successLine)}>{t('collectHint')}</p>
        <Button
          as={Link}
          href="/member/shop"
          variant="primary"
          size="md"
          label={t('continueShopping')}
          xstyle={styles.successCta}
        />
      </Card>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div {...stylex.props(styles.emptyWrap)}>
        <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
        <Card variant="default" padding={0} xstyle={styles.emptyCard}>
          <Icon name="bag" {...stylex.props(styles.emptyIcon)} />
          <p {...stylex.props(styles.emptyTitle)}>{t('empty')}</p>
          <p {...stylex.props(styles.emptyHint)}>{t('emptyHint')}</p>
          <Button
            as={Link}
            href="/member/shop"
            variant="primary"
            size="md"
            icon={<Icon name="bag" />}
            label={t('browseShop')}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 {...stylex.props(styles.title)}>{t('title')}</h1>
      <div {...stylex.props(styles.layout)}>
        {/* Items */}
        <div {...stylex.props(styles.items)}>
          {cart.items.map((item) => (
            <Card key={item.variantId} variant="default" padding={0} xstyle={styles.itemCard}>
              <div {...stylex.props(styles.itemThumb)}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" {...stylex.props(styles.itemImg)} />
                ) : (
                  <span {...stylex.props(styles.itemEmoji)}>🛍️</span>
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
                        <Badge variant="error" label={t('outOfStock')} />
                      </span>
                    )}
                  </div>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label={t('remove')}
                    icon={<Icon name="trash" />}
                    isDisabled={pending}
                    onClick={() => setQty(item.variantId, 0)}
                  />
                </div>
                <div {...stylex.props(styles.itemBottomRow)}>
                  <div {...stylex.props(styles.stepper)}>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label={t('decrease')}
                      icon={<Icon name="minus" />}
                      isDisabled={pending}
                      onClick={() => setQty(item.variantId, item.qty - 1)}
                    />
                    <span {...stylex.props(styles.qty)}>{item.qty}</span>
                    <IconButton
                      variant="ghost"
                      size="sm"
                      label={t('increase')}
                      icon={<Icon name="plus" />}
                      isDisabled={pending}
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
        <Card variant="default" padding={0} xstyle={styles.summaryCard}>
          <h2 {...stylex.props(styles.summaryTitle)}>{t('summary')}</h2>

          {/* Pickup location */}
          {locations.length > 0 && (
            <Selector
              label={t('pickup')}
              value={locationId}
              onChange={(value) => setLocationId(value)}
              options={locations.map((l) => ({ value: l.id, label: l.name }))}
            />
          )}

          {/* Payment method (cosmetic) */}
          <div {...stylex.props(styles.payList)}>
            {(
              [
                { k: 'desk', icon: 'pin' as const, label: t('payDesk') },
                { k: 'card', icon: 'card' as const, label: t('payCard') },
                { k: 'apple', icon: 'apple' as const, label: t('payApple') },
              ] as const
            ).map((m) => (
              <button
                key={m.k}
                type="button"
                aria-pressed={pay === m.k}
                onClick={() => setPay(m.k)}
                {...stylex.props(styles.payOption, pay === m.k ? styles.payActive : styles.payIdle)}
              >
                <Icon name={m.icon} {...stylex.props(styles.payIcon)} />
                <span {...stylex.props(styles.payLabel)}>{m.label}</span>
                {pay === m.k && <Icon name="check" {...stylex.props(styles.payCheck)} />}
              </button>
            ))}
          </div>

          {/* Promo */}
          <TextInput
            type="text"
            label={t('promo')}
            isLabelHidden
            value={promo}
            placeholder={t('promo')}
            onChange={(value) => setPromo(value)}
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

          <Button
            variant="primary"
            size="lg"
            icon={<Icon name="bag" />}
            label={pending ? t('placing') : `${t('placeOrder')} · ${money(cart.total)}`}
            isLoading={pending}
            isDisabled={pending || cart.items.length === 0}
            onClick={checkout}
            xstyle={styles.checkout}
          />
          <p {...stylex.props(styles.secure)}>{t('securePayment')}</p>
        </Card>
      </div>
    </div>
  );
}
