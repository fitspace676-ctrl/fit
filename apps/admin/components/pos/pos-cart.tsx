'use client';

import { formatPrice, inputToMinor, minorToInput } from '@/app/(dashboard)/products/format-price';
import { Btn } from '@/components/ui';
import {
  lineTotal,
  selectDiscountTotal,
  selectItemCount,
  selectSubtotal,
  selectTotal,
  usePosCart,
} from '@/stores/pos-cart-store';

/** The cart's working currency — the first line's currency, or USD when empty. */
function useCartCurrency(): string {
  return usePosCart((state) => state.items[0]?.currency ?? 'USD');
}

/**
 * The POS cart (right column, below the member lookup). Renders each line with a
 * quantity stepper, a per-line discount field, and a remove control; below the
 * lines sit a cart-level discount field and the live subtotal / discount / total
 * summary. Every value is read from the in-memory Zustand store with a selector so
 * a single line edit doesn't repaint the whole list.
 */
export function PosCart({ onCharge }: { onCharge: () => void }) {
  const items = usePosCart((state) => state.items);
  const currency = useCartCurrency();
  const itemCount = usePosCart(selectItemCount);
  const setQty = usePosCart((state) => state.setQty);
  const removeItem = usePosCart((state) => state.removeItem);
  const setLineDiscount = usePosCart((state) => state.setLineDiscount);
  const clear = usePosCart((state) => state.clear);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Cart{itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
        </h2>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-btn px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-700 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-ink-200"
          >
            Clear (Esc)
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">Tap a product to start a sale.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.productId}
                className="flex flex-col gap-2 rounded-card border border-ink-200 p-3 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900 dark:text-white">
                      {item.name}
                    </p>
                    <p className="text-xs text-ink-500 dark:text-ink-400">
                      {formatPrice(item.unitPrice, item.currency)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    aria-label={`Remove ${item.name}`}
                    className="shrink-0 rounded-btn px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-danger-600 dark:text-ink-400 dark:hover:bg-white/10 dark:hover:text-danger-400"
                  >
                    Remove
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-btn border border-ink-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setQty(item.productId, item.qty - 1)}
                      aria-label={`Decrease ${item.name} quantity`}
                      className="px-3 py-1 text-lg leading-none text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/10"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={item.qty}
                      onChange={(event) =>
                        setQty(item.productId, Math.trunc(Number(event.target.value)))
                      }
                      aria-label={`${item.name} quantity`}
                      className="w-12 border-x border-ink-200 bg-transparent py-1 text-center text-sm text-ink-900 focus:outline-none dark:border-white/10 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setQty(item.productId, item.qty + 1)}
                      aria-label={`Increase ${item.name} quantity`}
                      className="px-3 py-1 text-lg leading-none text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>

                  <label className="flex items-center gap-1 text-xs text-ink-500 dark:text-ink-400">
                    Disc.
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={item.lineDiscount > 0 ? minorToInput(item.lineDiscount) : ''}
                      onChange={(event) =>
                        setLineDiscount(item.productId, inputToMinor(event.target.value) ?? 0)
                      }
                      placeholder="0.00"
                      aria-label={`${item.name} line discount`}
                      className="w-20 rounded-field border border-ink-200 bg-white px-2 py-1 text-right text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    />
                  </label>

                  <span className="ml-auto font-mono text-sm font-semibold text-ink-900 dark:text-white">
                    {formatPrice(lineTotal(item), item.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CartSummary currency={currency} onCharge={onCharge} />
    </div>
  );
}

/** The discount field + subtotal / discount / total totals pinned to the cart's foot. */
function CartSummary({ currency, onCharge }: { currency: string; onCharge: () => void }) {
  const subtotal = usePosCart(selectSubtotal);
  const discountTotal = usePosCart(selectDiscountTotal);
  const total = usePosCart(selectTotal);
  const cartDiscount = usePosCart((state) => state.cartDiscount);
  const setCartDiscount = usePosCart((state) => state.setCartDiscount);

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-ink-100 pt-3 dark:border-white/10">
      <label className="flex items-center justify-between gap-2 text-sm text-ink-600 dark:text-ink-300">
        <span>Cart discount</span>
        <input
          type="number"
          min={0}
          step="0.01"
          defaultValue={cartDiscount > 0 ? minorToInput(cartDiscount) : ''}
          onChange={(event) => setCartDiscount(inputToMinor(event.target.value) ?? 0)}
          placeholder="0.00"
          aria-label="Cart-level discount"
          className="w-24 rounded-field border border-ink-200 bg-white px-2 py-1 text-right text-sm text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </label>

      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span>Subtotal</span>
        <span className="font-mono tabular-nums">{formatPrice(subtotal, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span>Discounts</span>
        <span className="font-mono tabular-nums">−{formatPrice(discountTotal, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-lg font-bold text-ink-900 dark:text-white">
        <span>Total</span>
        <span className="font-mono tabular-nums">{formatPrice(total, currency)}</span>
      </div>

      <Btn v="primary" size="lg" onClick={onCharge} disabled={total <= 0} className="mt-1 w-full">
        Charge {formatPrice(total, currency)}
      </Btn>
    </div>
  );
}
