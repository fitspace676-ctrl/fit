// @fit/admin — the POS cart store (T7.2).
//
// A deliberately in-memory Zustand store: a POS sale is an ephemeral session, so
// a full page reload SHOULD discard the cart (there is no `persist` middleware —
// see the task constraints). The store lives at module scope, which in the Next
// client bundle means "one cart per browser tab", reset on reload.
//
// Money is modelled the way the rest of the platform models it — every amount is
// an integer in the currency's MINOR units (cents/tetri) so no float rounding
// ever crosses a boundary. Discounts are absolute minor-unit amounts (not
// percentages): a `lineDiscount` is subtracted from one line's gross, and the
// single `cartDiscount` is subtracted from the post-line-discount subtotal.

import type { PaymentMethod } from '@fit/types';
import { create } from 'zustand';

/** One line in the POS cart — a product added one-or-more times, with its own discount. */
export interface CartItem {
  /** The catalogue product's id (the line key — a product appears at most once). */
  productId: string;
  /** Display name captured at add-time so the cart renders without a re-fetch. */
  name: string;
  /** Unit price in the currency's minor units, captured at add-time. */
  unitPrice: number;
  /** ISO-4217 currency code for {@link unitPrice} (the cart assumes one currency). */
  currency: string;
  /** How many of this product are in the cart (≥ 1). */
  qty: number;
  /** Absolute minor-unit discount applied to this line's gross (`unitPrice * qty`). */
  lineDiscount: number;
}

/** The minimal product shape {@link PosCartState.addItem} needs to open a line. */
export interface AddItemInput {
  productId: string;
  name: string;
  unitPrice: number;
  currency: string;
}

/** The POS cart's state and the actions that mutate it (the T7.2 contract surface). */
export interface PosCartState {
  /** The lines in add order; a product is present at most once (qty carries the count). */
  items: CartItem[];
  /** The member this sale is attached to, or `undefined` for a walk-in sale. */
  memberId?: string;
  /** Absolute minor-unit discount applied to the whole cart after line discounts. */
  cartDiscount: number;
  /** The settlement method chosen at checkout, or `null` until one is picked (T7.3). */
  paymentMethod: PaymentMethod | null;
  /**
   * For a `cash` sale, the amount the customer handed over, in minor units. Drives
   * the live change-due figure ({@link selectChangeDue}); irrelevant for `card` /
   * `member_account`, where it stays `0`.
   */
  cashTendered: number;

  /** Add a product — increments the qty of an existing line, or opens a new one. */
  addItem: (product: AddItemInput) => void;
  /** Remove a product's line entirely. */
  removeItem: (productId: string) => void;
  /** Set a product line's quantity; a qty ≤ 0 removes the line. */
  setQty: (productId: string, qty: number) => void;
  /** Set a product line's absolute discount (clamped to `[0, line gross]`). */
  setLineDiscount: (productId: string, amount: number) => void;
  /** Set the cart-level absolute discount (clamped to `[0, post-line subtotal]`). */
  setCartDiscount: (amount: number) => void;
  /** Attach the sale to a member, or pass `undefined` to return to walk-in mode. */
  setMember: (memberId: string | undefined) => void;
  /** Choose the settlement method (`null` clears the choice); resets cash tendered. */
  setPaymentMethod: (method: PaymentMethod | null) => void;
  /** Set the cash amount handed over (minor units; negative / NaN coerced to zero). */
  setCashTendered: (amount: number) => void;
  /** Reset the cart to its empty initial state (items, member, discount, payment). */
  clear: () => void;
}

/** A line's gross before its own discount: `unitPrice * qty`. */
export function lineGross(item: CartItem): number {
  return item.unitPrice * item.qty;
}

/** A line's net after its own discount, floored at zero. */
export function lineTotal(item: CartItem): number {
  return Math.max(0, lineGross(item) - item.lineDiscount);
}

/** Sum of every line's gross (`unitPrice * qty`), before any discount. */
export function selectSubtotal(state: Pick<PosCartState, 'items'>): number {
  return state.items.reduce((sum, item) => sum + lineGross(item), 0);
}

/**
 * Every discount applied: the sum of the line discounts plus the cart discount.
 * Never reports more than the subtotal, so the total can't go negative.
 */
export function selectDiscountTotal(state: Pick<PosCartState, 'items' | 'cartDiscount'>): number {
  const lineDiscounts = state.items.reduce(
    (sum, item) => sum + Math.min(item.lineDiscount, lineGross(item)),
    0,
  );
  const subtotal = selectSubtotal(state);
  return Math.min(subtotal, lineDiscounts + state.cartDiscount);
}

/** What the customer pays: `subtotal - discountTotal`, floored at zero. */
export function selectTotal(state: Pick<PosCartState, 'items' | 'cartDiscount'>): number {
  return Math.max(0, selectSubtotal(state) - selectDiscountTotal(state));
}

/** Total number of physical items across all lines (for the "N items" badge). */
export function selectItemCount(state: Pick<PosCartState, 'items'>): number {
  return state.items.reduce((sum, item) => sum + item.qty, 0);
}

/**
 * Change owed back on a cash sale: `cashTendered - total`, floored at zero (a
 * short payment owes no change, it just isn't enough yet). Always zero for non-cash
 * methods because their `cashTendered` stays at zero.
 */
export function selectChangeDue(
  state: Pick<PosCartState, 'items' | 'cartDiscount' | 'cashTendered'>,
): number {
  return Math.max(0, state.cashTendered - selectTotal(state));
}

/**
 * The POS cart store. In-memory only by design (no `persist`): a reload clears
 * the sale, matching how an ephemeral POS session behaves. Components subscribe
 * with selectors (`usePosCart((s) => s.items)`) so a line edit doesn't repaint
 * the whole board.
 */
export const usePosCart = create<PosCartState>((set) => ({
  items: [],
  memberId: undefined,
  cartDiscount: 0,
  paymentMethod: null,
  cashTendered: 0,

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((item) => item.productId === product.productId);
      if (existing) {
        return {
          items: state.items.map((item) =>
            item.productId === product.productId ? { ...item, qty: item.qty + 1 } : item,
          ),
        };
      }
      return {
        items: [
          ...state.items,
          {
            productId: product.productId,
            name: product.name,
            unitPrice: product.unitPrice,
            currency: product.currency,
            qty: 1,
            lineDiscount: 0,
          },
        ],
      };
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),

  setQty: (productId, qty) =>
    set((state) => {
      if (qty <= 0) {
        return { items: state.items.filter((item) => item.productId !== productId) };
      }
      return {
        items: state.items.map((item) =>
          item.productId === productId
            ? { ...item, qty, lineDiscount: Math.min(item.lineDiscount, item.unitPrice * qty) }
            : item,
        ),
      };
    }),

  setLineDiscount: (productId, amount) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.productId === productId
          ? { ...item, lineDiscount: clampDiscount(amount, lineGross(item)) }
          : item,
      ),
    })),

  setCartDiscount: (amount) =>
    set((state) => ({ cartDiscount: clampDiscount(amount, selectSubtotal(state)) })),

  setMember: (memberId) =>
    set((state) => ({
      memberId,
      // A walk-in can't charge to a member account — drop the choice if the
      // member is detached after it was picked.
      paymentMethod:
        memberId === undefined && state.paymentMethod === 'member_account'
          ? null
          : state.paymentMethod,
    })),

  setPaymentMethod: (method) =>
    // Switching method always resets the tendered amount: it is only meaningful
    // for cash, and a stale value must never leak into another method's change.
    set({ paymentMethod: method, cashTendered: 0 }),

  setCashTendered: (amount) =>
    set({ cashTendered: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 0 }),

  clear: () =>
    set({
      items: [],
      memberId: undefined,
      cartDiscount: 0,
      paymentMethod: null,
      cashTendered: 0,
    }),
}));

/** Clamp a discount to `[0, max]`, treating a `NaN` / negative input as zero. */
function clampDiscount(amount: number, max: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.min(Math.round(amount), max);
}
