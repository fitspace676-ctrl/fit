'use client';

import { useEffect, useState } from 'react';
import { formatPrice } from '@/app/(dashboard)/products/format-price';
import { Btn, Icon } from '@/components/ui';
import {
  lineTotal,
  selectDiscountTotal,
  selectSubtotal,
  selectTotal,
  usePosCart,
} from '@/stores/pos-cart-store';
import { PosIcon } from './pos-icons';

/** The cart's working currency — the first line's currency, or USD when empty. */
function useCartCurrency(): string {
  return usePosCart((state) => state.items[0]?.currency ?? 'USD');
}

/**
 * The cart-level discount presets (the design's pill row). Each pill applies its
 * rate to the live subtotal and writes the resulting absolute amount into the
 * store's `cartDiscount`, so the recorded sale still carries a plain minor-unit
 * discount — the preset is only how the operator picks it.
 */
const DISCOUNTS: ReadonlyArray<{ label: string; rate: number }> = [
  { label: 'None', rate: 0 },
  { label: 'Staff −10%', rate: 0.1 },
  { label: 'Member −15%', rate: 0.15 },
  { label: 'Promo −20%', rate: 0.2 },
];

/**
 * The POS cart (the body of the right-column card, below the member row).
 * Renders each line with a category-style icon tile, a quantity stepper, the
 * line total, and a remove control; below the lines sit the discount preset
 * pills, the live subtotal / discount / total summary, and the charge button.
 * Every value is read from the in-memory Zustand store with a selector so a
 * single line edit doesn't repaint the whole list.
 */
export function PosCart({ onCharge, onClear }: { onCharge: () => void; onClear: () => void }) {
  const items = usePosCart((state) => state.items);
  const currency = useCartCurrency();
  const setQty = usePosCart((state) => state.setQty);
  const removeItem = usePosCart((state) => state.removeItem);

  return (
    <>
      {/* Line items */}
      <div className="max-h-[330px] overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <div className="relative mx-auto grid h-12 w-12 place-items-center text-ink-300">
              <span aria-hidden className="absolute inset-0 bg-brand-500/20 blur-2xl" />
              <Icon name="bag" className="relative h-10 w-10" sw={1.7} />
            </div>
            <p className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">Cart is empty</p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              Tap a product to start a sale.
            </p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.productId}
              className="flex items-center gap-3 rounded-card p-2 transition hover:bg-ink-50 dark:hover:bg-white/[0.03]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-brand-400/25 to-brand-600/10 text-brand-500 dark:text-brand-300">
                <Icon name="bag" className="h-5 w-5" sw={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                  {item.name}
                </p>
                <p className="font-mono text-xs text-ink-500 dark:text-ink-400">
                  {formatPrice(item.unitPrice, item.currency)}
                </p>
              </div>
              <div className="flex items-center rounded-btn bg-ink-50 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:ring-white/10">
                <button
                  type="button"
                  onClick={() => setQty(item.productId, Math.max(1, item.qty - 1))}
                  aria-label={`Decrease ${item.name} quantity`}
                  className="grid h-7 w-7 place-items-center rounded-l-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Icon name="minus" className="h-3.5 w-3.5" sw={2.4} />
                </button>
                <span className="w-7 text-center font-mono text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                  {item.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(item.productId, item.qty + 1)}
                  aria-label={`Increase ${item.name} quantity`}
                  className="grid h-7 w-7 place-items-center rounded-r-btn text-ink-500 transition hover:bg-ink-100 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <Icon name="plus" className="h-3.5 w-3.5" sw={2.4} />
                </button>
              </div>
              <span className="w-16 text-right font-mono text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                {formatPrice(lineTotal(item), item.currency)}
              </span>
              <button
                type="button"
                onClick={() => removeItem(item.productId)}
                aria-label={`Remove ${item.name}`}
                className="grid h-7 w-7 place-items-center rounded-btn text-ink-400 transition hover:bg-danger-500/10 hover:text-danger-600 dark:text-ink-500 dark:hover:bg-danger-500/15 dark:hover:text-danger-300"
              >
                <Icon name="trash" className="h-4 w-4" sw={2} />
              </button>
            </div>
          ))
        )}
      </div>

      <CartSummary currency={currency} onCharge={onCharge} onClear={onClear} />
    </>
  );
}

/** The discount presets + subtotal / discount / total + charge, pinned to the cart's foot. */
function CartSummary({
  currency,
  onCharge,
  onClear,
}: {
  currency: string;
  onCharge: () => void;
  onClear: () => void;
}) {
  const subtotal = usePosCart(selectSubtotal);
  const discountTotal = usePosCart(selectDiscountTotal);
  const total = usePosCart(selectTotal);
  const isEmpty = usePosCart((state) => state.items.length === 0);
  const setCartDiscount = usePosCart((state) => state.setCartDiscount);

  const [discIdx, setDiscIdx] = useState(0);
  const preset = DISCOUNTS[discIdx] ?? DISCOUNTS[0]!;

  // Presets are rates over a moving subtotal, but the store carries an absolute
  // amount — keep the two in step as lines change under the selected pill.
  useEffect(() => {
    setCartDiscount(Math.round(subtotal * preset.rate));
  }, [subtotal, preset.rate, setCartDiscount]);

  // A cleared sale (Esc, "New sale") resets the store; drop the pill with it so
  // the next sale never inherits the previous customer's discount.
  useEffect(() => {
    if (isEmpty) {
      setDiscIdx(0);
    }
  }, [isEmpty]);

  return (
    <div className="mt-auto space-y-3 border-t border-ink-200 bg-ink-50 p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex flex-wrap items-center gap-2">
        <PosIcon name="percent" className="h-4 w-4 text-ink-500 dark:text-ink-400" sw={2} />
        {DISCOUNTS.map((discount, index) => (
          <button
            key={discount.label}
            type="button"
            onClick={() => setDiscIdx(index)}
            disabled={isEmpty}
            className={`h-7 rounded-pill px-2.5 text-[11px] font-semibold transition disabled:opacity-40 ${
              discIdx === index
                ? 'bg-brand-500/15 text-brand-700 ring-1 ring-inset ring-brand-500/40 dark:bg-brand-500/20 dark:text-brand-200 dark:ring-brand-400/40'
                : 'bg-white text-ink-600 ring-1 ring-inset ring-ink-200 dark:bg-white/[0.04] dark:text-ink-300 dark:ring-white/10'
            }`}
          >
            {discount.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500 dark:text-ink-400">Subtotal</span>
          <span className="font-mono tabular-nums text-ink-900 dark:text-white">
            {formatPrice(subtotal, currency)}
          </span>
        </div>
        {discountTotal > 0 ? (
          <div className="flex items-center justify-between text-sm text-success-700 dark:text-success-300">
            <span>Discount · {preset.label}</span>
            <span className="font-mono tabular-nums">−{formatPrice(discountTotal, currency)}</span>
          </div>
        ) : null}
        <div className="mt-1 flex items-center justify-between border-t border-ink-200 pt-2 dark:border-white/10">
          <span className="text-sm font-semibold text-ink-900 dark:text-white">
            Total{' '}
            <span className="text-[11px] font-normal text-ink-400 dark:text-ink-500">
              · VAT incl.
            </span>
          </span>
          <span className="font-display text-2xl font-extrabold tabular-nums text-ink-900 dark:text-white">
            {formatPrice(total, currency)}
          </span>
        </div>
      </div>

      <Btn
        v="primary"
        size="lg"
        onClick={onCharge}
        disabled={isEmpty || total <= 0}
        className="w-full"
      >
        <PosIcon name="cash" className="h-4 w-4" sw={2.1} />
        <span className="flex-1 text-center">Charge {formatPrice(total, currency)}</span>
      </Btn>
      {!isEmpty ? (
        <button
          type="button"
          onClick={onClear}
          className="w-full text-center text-xs font-semibold text-ink-400 transition hover:text-danger-600 dark:text-ink-500 dark:hover:text-danger-300"
        >
          Clear cart · Esc
        </button>
      ) : null}
    </div>
  );
}
