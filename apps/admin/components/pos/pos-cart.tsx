'use client';

import { formatPrice, inputToMinor, minorToInput } from '@/app/products/format-price';
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Cart{itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
        </h2>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-card px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            Clear (Esc)
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Tap a product to start a sale.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.productId}
                className="flex flex-col gap-2 rounded-card border border-slate-200 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatPrice(item.unitPrice, item.currency)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    aria-label={`Remove ${item.name}`}
                    className="shrink-0 rounded-card px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-card border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setQty(item.productId, item.qty - 1)}
                      aria-label={`Decrease ${item.name} quantity`}
                      className="px-3 py-1 text-lg leading-none text-slate-600 hover:bg-slate-100"
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
                      className="w-12 border-x border-slate-200 py-1 text-center text-sm text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setQty(item.productId, item.qty + 1)}
                      aria-label={`Increase ${item.name} quantity`}
                      className="px-3 py-1 text-lg leading-none text-slate-600 hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>

                  <label className="flex items-center gap-1 text-xs text-slate-500">
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
                      className="w-20 rounded-card border border-slate-200 px-2 py-1 text-right text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </label>

                  <span className="ml-auto text-sm font-semibold text-slate-900">
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
    <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
      <label className="flex items-center justify-between gap-2 text-sm text-slate-600">
        <span>Cart discount</span>
        <input
          type="number"
          min={0}
          step="0.01"
          defaultValue={cartDiscount > 0 ? minorToInput(cartDiscount) : ''}
          onChange={(event) => setCartDiscount(inputToMinor(event.target.value) ?? 0)}
          placeholder="0.00"
          aria-label="Cart-level discount"
          className="w-24 rounded-card border border-slate-200 px-2 py-1 text-right text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
        />
      </label>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Subtotal</span>
        <span>{formatPrice(subtotal, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>Discounts</span>
        <span>−{formatPrice(discountTotal, currency)}</span>
      </div>
      <div className="flex items-center justify-between text-lg font-bold text-slate-900">
        <span>Total</span>
        <span>{formatPrice(total, currency)}</span>
      </div>

      <button
        type="button"
        onClick={onCharge}
        disabled={total <= 0}
        className="mt-1 rounded-card bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Charge {formatPrice(total, currency)}
      </button>
    </div>
  );
}
