'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { CartView, LocationSummary } from '@fit/types';
import { Badge, Btn, buttonClasses, Card, Icon, useToast } from '@/src/components/ui';
import { Link } from '@/src/i18n/navigation';
import { formatMoney } from '@/lib/shop';
import {
  checkoutCartAction,
  removeCartItemAction,
  updateCartItemAction,
} from '@/app/actions/cart';

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
      const res = qty <= 0
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
      <Card glow className="mx-auto max-w-xl p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-100 text-success-600 dark:bg-success-500/15 dark:text-success-300">
          <Icon name="check" className="h-8 w-8" sw={2.4} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-extrabold text-ink-900 dark:text-white">
          {t('confirmed')}
        </h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {t('orderNo')} <span className="font-mono text-ink-700 dark:text-ink-200">{orderId}</span>
        </p>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t('collectHint')}</p>
        <Link href="/shop" className={buttonClasses('primary', 'md', 'mt-6')}>
          {t('continueShopping')}
        </Link>
      </Card>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <Card className="grid place-items-center gap-3 py-14 text-center">
          <Icon name="bag" className="h-10 w-10 text-ink-300 dark:text-ink-600" />
          <p className="font-display text-lg font-bold text-ink-900 dark:text-white">{t('empty')}</p>
          <Link href="/shop" className={buttonClasses('primary', 'md')}>
            {t('browseShop')}
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
        {t('title')}
      </h1>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Items */}
        <div className="space-y-3">
          {cart.items.map((item) => (
            <Card key={item.variantId} className="flex items-center gap-3 p-3 sm:p-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-field bg-ink-50 dark:bg-white/5">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-2xl">🛍️</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900 dark:text-white">
                      {item.productName}
                    </p>
                    {item.variantName && (
                      <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                        {item.variantName}
                      </p>
                    )}
                    {!item.available && (
                      <span className="mt-1 inline-block">
                        <Badge tone="danger">{t('outOfStock')}</Badge>
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={t('remove')}
                    disabled={pending}
                    onClick={() => setQty(item.variantId, 0)}
                    className="shrink-0 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-600 disabled:opacity-50 dark:hover:bg-danger-500/10"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-pill border border-ink-200 dark:border-white/10">
                    <button
                      type="button"
                      aria-label={t('decrease')}
                      disabled={pending}
                      onClick={() => setQty(item.variantId, item.qty - 1)}
                      className="grid h-8 w-8 place-items-center rounded-l-pill text-ink-600 hover:bg-ink-50 disabled:opacity-50 dark:text-ink-300 dark:hover:bg-white/5"
                    >
                      <Icon name="minus" className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center font-mono text-sm tabular-nums text-ink-900 dark:text-white">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      aria-label={t('increase')}
                      disabled={pending}
                      onClick={() => setQty(item.variantId, item.qty + 1)}
                      className="grid h-8 w-8 place-items-center rounded-r-pill text-ink-600 hover:bg-ink-50 disabled:opacity-50 dark:text-ink-300 dark:hover:bg-white/5"
                    >
                      <Icon name="plus" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="font-mono text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                    {money(item.lineTotal)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Summary */}
        <Card glow className="h-fit p-5 sm:p-6 lg:sticky lg:top-20">
          <h2 className="font-display text-base font-bold text-ink-900 dark:text-white">
            {t('summary')}
          </h2>

          {/* Pickup location */}
          {locations.length > 0 && (
            <label className="mt-4 block">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                {t('pickup')}
              </span>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="h-11 w-full rounded-field border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Payment method (cosmetic) */}
          <div className="mt-4 space-y-2">
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
                onClick={() => setPay(m.k)}
                className={`flex w-full items-center gap-3 rounded-card border px-3.5 py-2.5 text-left text-sm transition ${
                  pay === m.k
                    ? 'border-brand-500 bg-brand-50 dark:border-brand-400/50 dark:bg-brand-500/10'
                    : 'border-ink-200 hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <Icon name={m.icon} className="h-4 w-4 text-ink-500 dark:text-ink-300" />
                <span className="flex-1 font-medium text-ink-900 dark:text-white">{m.label}</span>
                {pay === m.k && <Icon name="check" className="h-4 w-4 text-brand-600 dark:text-brand-300" />}
              </button>
            ))}
          </div>

          {/* Promo */}
          <div className="mt-4 flex gap-2">
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder={t('promo')}
              className="h-10 flex-1 rounded-field border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
          </div>

          {/* Totals */}
          <div className="mt-5 space-y-2 border-t border-ink-100 pt-4 text-sm dark:border-white/10">
            <Row label={t('subtotal')} value={money(cart.subtotal)} />
            {cart.discount > 0 && (
              <Row label={t('discount')} value={`−${money(cart.discount)}`} tone="text-success-600 dark:text-success-300" />
            )}
            <div className="flex items-center justify-between pt-2">
              <span className="font-semibold text-ink-900 dark:text-white">{t('total')}</span>
              <span className="font-display text-xl font-extrabold tabular-nums text-ink-900 dark:text-white">
                {money(cart.total)}
              </span>
            </div>
          </div>

          <Btn
            v="primary"
            className="mt-5 w-full"
            icon="bag"
            disabled={pending || cart.items.length === 0}
            onClick={checkout}
          >
            {pending ? t('placing') : `${t('placeOrder')} · ${money(cart.total)}`}
          </Btn>
          <p className="mt-2 text-center text-xs text-ink-400">{t('securePayment')}</p>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-500 dark:text-ink-400">{label}</span>
      <span className={`font-mono tabular-nums ${tone ?? 'text-ink-800 dark:text-ink-200'}`}>
        {value}
      </span>
    </div>
  );
}
