// @fit/mobile — the shop cart (T6.7): an in-memory, app-wide line-item store.
//
// The Shop tab browses products and adds them to a cart that the cart screen
// reviews and checks out. The cart is plain React state held at the provider so
// every surface (the browse header badge, the product detail "Add", the cart
// screen) reads and mutates one source of truth. It is intentionally NOT
// persisted yet — a fresh launch starts with an empty cart, matching the app's
// current "no local persistence" stance (locale, gym scope). Persistence can
// layer on later without changing this API.
//
// A line is keyed by product + variant, so adding the same variant twice bumps
// its quantity rather than creating a duplicate row. Prices are carried in the
// currency's MINOR units (cents/tetri) exactly as they cross the wire, so the
// subtotal is integer math with no float rounding.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ProductSummary, ProductVariantSummary, ShopOrderItem } from '@fit/types';

/** One reviewable line in the cart — a product (+ optional variant) and how many. */
export interface CartLine {
  /** Stable key for this product+variant combination (the React list key). */
  key: string;
  productId: string;
  productName: string;
  /** The chosen variant id, or `undefined` when the product is sold as-is. */
  variantId?: string;
  /** The chosen variant's label, or `undefined` for a variant-less product. */
  variantName?: string;
  /** The unit price the buyer pays, in `currency`'s MINOR units. */
  unitAmount: number;
  /** ISO-4217 currency code the line is priced in. */
  currency: string;
  /** Primary product image, or `null` (the line renders a placeholder). */
  imageUrl: string | null;
  /** How many units of this exact line. */
  quantity: number;
}

/** The cart context value — the lines plus the mutators the screens call. */
export interface CartContextValue {
  /** Every line currently in the cart, in insertion order. */
  lines: CartLine[];
  /** Total number of units across all lines (the header badge count). */
  count: number;
  /** Sum of `unitAmount * quantity` across all lines, in minor units. */
  subtotal: number;
  /** The cart's currency (the first line's), or `null` when the cart is empty. */
  currency: string | null;
  /**
   * Add a product (+ optional variant) to the cart. Adding a combination already
   * present bumps its quantity instead of duplicating the row.
   */
  add: (product: ProductSummary, variant?: ProductVariantSummary, quantity?: number) => void;
  /** Set a line's quantity; a quantity of 0 (or less) removes it. */
  setQuantity: (key: string, quantity: number) => void;
  /** Remove a line outright. */
  remove: (key: string) => void;
  /** Empty the cart (called after a successful checkout). */
  clear: () => void;
  /** Project the cart into the `POST /orders` body's `items`. */
  toOrderItems: () => ShopOrderItem[];
}

/** Build the stable line key for a product + (optional) variant combination. */
function lineKey(productId: string, variantId?: string): string {
  return `${productId}::${variantId ?? ''}`;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Holds the cart state and provides {@link useCart} to the tree. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback(
    (product: ProductSummary, variant?: ProductVariantSummary, quantity = 1) => {
      if (quantity <= 0) return;
      const key = lineKey(product.id, variant?.id);
      const unitAmount = variant ? variant.priceAmount : product.priceAmount;

      setLines((prev) => {
        const existing = prev.find((line) => line.key === key);
        if (existing) {
          return prev.map((line) =>
            line.key === key ? { ...line, quantity: line.quantity + quantity } : line,
          );
        }
        return [
          ...prev,
          {
            key,
            productId: product.id,
            productName: product.name,
            variantId: variant?.id,
            variantName: variant?.name,
            unitAmount,
            currency: product.currency,
            imageUrl: product.imageUrl,
            quantity,
          },
        ];
      });
    },
    [],
  );

  const setQuantity = useCallback((key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((line) => line.key !== key)
        : prev.map((line) => (line.key === key ? { ...line, quantity } : line)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const subtotal = lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
    return {
      lines,
      count,
      subtotal,
      currency: lines[0]?.currency ?? null,
      add,
      setQuantity,
      remove,
      clear,
      toOrderItems: () =>
        lines.map((line) => ({
          productId: line.productId,
          ...(line.variantId ? { variantId: line.variantId } : {}),
          quantity: line.quantity,
        })),
    };
  }, [lines, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Read the shop cart. Throws if used outside {@link CartProvider}. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a <CartProvider>.');
  return ctx;
}
