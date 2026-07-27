// @fit/admin — the POS cart store (T7.2).
//
// A deliberately in-memory Zustand store: a POS sale is an ephemeral session, so
// a full page reload SHOULD discard the cart (there is no `persist` middleware —
// see the task constraints). The store lives at module scope, which in the Next
// client bundle means "one cart per browser tab", reset on reload.
//
// Money is modelled the way the rest of the platform models it — every amount is
// an integer in the currency's MINOR units (cents/tetri) so no float rounding
// ever crosses a boundary. Discounts are entered and stored as **percentages**:
// a line's percentage comes off its own gross, and the single cart percentage then
// comes off what remains. Storing the percentage rather than a fixed amount means a
// discount survives a quantity change; the minor-unit figures are derived.

import type { PaymentMethod } from '@fit/types';
import { create } from 'zustand';

/** One line in the POS cart — a product added one-or-more times, with its own discount. */
export interface CartItem {
  /**
   * The line key — a catalogue product's id, or a membership plan's id when this line
   * is a membership. Either way an item appears at most once (quantity carries the
   * count), so the id is what identifies the line.
   */
  productId: string;
  /**
   * Set when this line is a **membership** rather than a product: the subscription
   * plan being sold. The sale sends it to the API, which enrols the attached member
   * on that plan. Absent on an ordinary product line.
   */
  planId?: string;
  /** Display name captured at add-time so the cart renders without a re-fetch. */
  name: string;
  /** Unit price in the currency's minor units, captured at add-time. */
  unitPrice: number;
  /** ISO-4217 currency code for {@link unitPrice} (the cart assumes one currency). */
  currency: string;
  /** How many of this product are in the cart (≥ 1). */
  qty: number;
  /**
   * Percentage (0–100) knocked off this line's gross. Stored as a percentage rather
   * than a fixed amount so it survives a quantity change — "10% off" stays 10% off
   * whether the operator rings up one or six.
   */
  lineDiscountPct: number;
}

/** The minimal product shape {@link PosCartState.addItem} needs to open a line. */
export interface AddItemInput {
  productId: string;
  name: string;
  unitPrice: number;
  currency: string;
  /** Set to sell a membership on this line — see {@link CartItem.planId}. */
  planId?: string;
}

/** The POS cart's state and the actions that mutate it (the T7.2 contract surface). */
export interface PosCartState {
  /** The lines in add order; a product is present at most once (qty carries the count). */
  items: CartItem[];
  /** The member this sale is attached to, or `undefined` for a walk-in sale. */
  memberId?: string;
  /**
   * The branch the sale is being rung up at, or `undefined` when the gym has no
   * branches configured. Recorded on the order so takings split per location.
   */
  locationId?: string;
  /** Percentage (0–100) knocked off the post-line-discount subtotal. */
  cartDiscountPct: number;
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
  /** Set a product line's discount percentage (clamped to `[0, 100]`). */
  setLineDiscount: (productId: string, percent: number) => void;
  /** Set the cart-level discount percentage (clamped to `[0, 100]`). */
  setCartDiscount: (percent: number) => void;
  /** Attach the sale to a member, or pass `undefined` to return to walk-in mode. */
  setMember: (memberId: string | undefined) => void;
  /** Choose the branch the sale is attributed to. */
  setLocation: (locationId: string | undefined) => void;
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

/** The minor-unit amount a line's percentage discount comes to, rounded to the cent. */
export function lineDiscountAmount(item: CartItem): number {
  return Math.round((lineGross(item) * clampPercent(item.lineDiscountPct)) / 100);
}

/** A line's net after its own discount, floored at zero. */
export function lineTotal(item: CartItem): number {
  return Math.max(0, lineGross(item) - lineDiscountAmount(item));
}

/** Sum of every line's gross (`unitPrice * qty`), before any discount. */
export function selectSubtotal(state: Pick<PosCartState, 'items'>): number {
  return state.items.reduce((sum, item) => sum + lineGross(item), 0);
}

/**
 * Every discount applied: the sum of the line discounts plus the cart discount.
 * Never reports more than the subtotal, so the total can't go negative.
 */
export function selectDiscountTotal(
  state: Pick<PosCartState, 'items' | 'cartDiscountPct'>,
): number {
  const lineDiscounts = state.items.reduce((sum, item) => sum + lineDiscountAmount(item), 0);
  const subtotal = selectSubtotal(state);
  // The cart percentage applies to what's left after the line discounts, so the two
  // compose instead of double-counting the same money.
  const afterLines = Math.max(0, subtotal - lineDiscounts);
  const cartDiscount = Math.round((afterLines * clampPercent(state.cartDiscountPct)) / 100);
  return Math.min(subtotal, lineDiscounts + cartDiscount);
}

/** What the customer pays: `subtotal - discountTotal`, floored at zero. */
export function selectTotal(state: Pick<PosCartState, 'items' | 'cartDiscountPct'>): number {
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
  state: Pick<PosCartState, 'items' | 'cartDiscountPct' | 'cashTendered'>,
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
  locationId: undefined,
  cartDiscountPct: 0,
  paymentMethod: null,
  cashTendered: 0,

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((item) => item.productId === product.productId);
      if (existing) {
        // A membership can't be bought twice on one sale — enrolment refuses a member
        // who already holds a live subscription — so its quantity stays at one.
        if (product.planId) {
          return state;
        }
        return {
          items: state.items.map((item) =>
            item.productId === product.productId ? { ...item, qty: item.qty + 1 } : item,
          ),
        };
      }
      // One membership per sale, for the same reason: adding a second replaces the
      // first rather than queueing an enrolment that is bound to fail.
      const withoutOtherMembership = product.planId
        ? state.items.filter((item) => !item.planId)
        : state.items;
      return {
        items: [
          ...withoutOtherMembership,
          {
            productId: product.productId,
            ...(product.planId ? { planId: product.planId } : {}),
            name: product.name,
            unitPrice: product.unitPrice,
            currency: product.currency,
            qty: 1,
            lineDiscountPct: 0,
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
        items: state.items.map((item) => (item.productId === productId ? { ...item, qty } : item)),
      };
    }),

  setLineDiscount: (productId, percent) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.productId === productId ? { ...item, lineDiscountPct: clampPercent(percent) } : item,
      ),
    })),

  setCartDiscount: (percent) => set(() => ({ cartDiscountPct: clampPercent(percent) })),

  setLocation: (locationId) => set(() => ({ locationId })),

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

  // `locationId` is deliberately NOT reset: the branch is a property of the till,
  // not of the sale, so the next customer is rung up at the same place.
  clear: () =>
    set({
      items: [],
      memberId: undefined,
      cartDiscountPct: 0,
      paymentMethod: null,
      cashTendered: 0,
    }),
}));

/** Coerce a typed percentage into `[0, 100]`; NaN / negatives become zero. */
function clampPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }
  return Math.min(100, percent);
}
