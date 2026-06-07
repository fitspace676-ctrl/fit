// @fit/types — server-side cart + checkout contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the member-facing online shop's
// persistent cart (T7.7): the `GET /cart` view, the add / update / remove line
// writes, and the `POST /cart/checkout` that turns a cart into a pending order.
// The API validates inbound bodies with these Zod schemas and the web / mobile
// shop reuse the inferred types, so the storefront and the controller can never
// drift on the wire format.
//
// A cart line is addressed by a **variant reference** — a single opaque string
// the storefront passes back to mutate or remove the line. Product variants have
// no persistent id of their own (they live as a JSON array on the product, see
// `products-admin.ts`), so the reference is the composite
// `"<productId>:<variantIndex>"`, or `"<productId>:base"` for a product sold
// as-is (no variant chosen). {@link encodeVariantRef} / {@link decodeVariantRef}
// are the single source of truth for that encoding, shared by the API and the
// clients so neither hand-rolls the format.
//
// Money is carried in the currency's MINOR units (cents/tetri) as integers, like
// every other price in the system, so no float rounding crosses the wire.

import { z } from 'zod';
import { MAX_CART_LINE_QUANTITY } from './products';

/** The sentinel variant-index segment for a product bought at its base price. */
export const BASE_VARIANT_SEGMENT = 'base';

/**
 * Encode a cart line's variant reference from a product id and the chosen
 * variant's position in the product's variant array (or `null` for the base,
 * no-variant purchase). The inverse of {@link decodeVariantRef}; the two are the
 * only place the `"<productId>:<segment>"` wire format is defined.
 */
export function encodeVariantRef(productId: string, variantIndex: number | null): string {
  return `${productId}:${variantIndex === null ? BASE_VARIANT_SEGMENT : variantIndex}`;
}

/**
 * Decode a variant reference back to its `productId` and `variantIndex` (`null`
 * for a base purchase), or `null` when the string is not a well-formed reference
 * (no separator, empty product id, or a non-integer / negative index) — the
 * caller treats a `null` as an unknown line (a `404`). Product ids are cuids
 * (no `:`), so the single separator is unambiguous.
 */
export function decodeVariantRef(
  ref: string,
): { productId: string; variantIndex: number | null } | null {
  const separator = ref.indexOf(':');
  if (separator <= 0 || separator === ref.length - 1) {
    return null;
  }
  const productId = ref.slice(0, separator);
  const segment = ref.slice(separator + 1);
  if (segment === BASE_VARIANT_SEGMENT) {
    return { productId, variantIndex: null };
  }
  if (!/^\d+$/.test(segment)) {
    return null;
  }
  return { productId, variantIndex: Number(segment) };
}

/**
 * Body for `POST /cart/items` — add a line to the cart (or bump an existing
 * line's quantity). `variantId` is the {@link encodeVariantRef} reference for the
 * product + chosen variant; `qty` is the units to add, a positive integer capped
 * at {@link MAX_CART_LINE_QUANTITY} so a fat-fingered stepper can't submit a
 * runaway line. The API re-prices server-side, so the client never sends money.
 */
export const addCartItemSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(MAX_CART_LINE_QUANTITY),
});

/** Validated `POST /cart/items` body — {@link addCartItemSchema}. */
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

/**
 * Body for `PATCH /cart/items/:variantId` — set a line's absolute quantity.
 * `qty` is the new unit count (a positive integer); removing a line is the
 * dedicated `DELETE /cart/items/:variantId`, not a `qty: 0`.
 */
export const updateCartItemSchema = z.object({
  qty: z.number().int().min(1).max(MAX_CART_LINE_QUANTITY),
});

/** Validated `PATCH /cart/items/:variantId` body — {@link updateCartItemSchema}. */
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/** How a checkout order is fulfilled — collected at the gym or delivered. */
export const fulfillmentSchema = z.enum(['PICKUP', 'DELIVERY']);

/** A checkout's fulfilment method — {@link fulfillmentSchema}. */
export type Fulfillment = z.infer<typeof fulfillmentSchema>;

/**
 * Body for `POST /cart/checkout`. `promoCode` is an optional discount code,
 * validated the same way the subscription flow validates it (T8.7). `fulfillment`
 * chooses pickup vs delivery: a `PICKUP` names the `locationId` to collect from,
 * a `DELIVERY` carries the `deliveryAddress` — each required for its mode and
 * rejected (a `400`) when missing. The cart itself is read from the caller's
 * session / cookie, never the body, so a buyer can only ever check out their own
 * cart.
 */
export const cartCheckoutSchema = z
  .object({
    promoCode: z.string().trim().min(1).max(64).optional(),
    fulfillment: fulfillmentSchema,
    locationId: z.string().min(1).optional(),
    deliveryAddress: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillment === 'PICKUP' && !value.locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['locationId'],
        message: 'A pickup order must name a location',
      });
    }
    if (value.fulfillment === 'DELIVERY' && !value.deliveryAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'A delivery order must carry a delivery address',
      });
    }
  });

/** Validated `POST /cart/checkout` body — {@link cartCheckoutSchema}. */
export type CartCheckoutInput = z.infer<typeof cartCheckoutSchema>;

/**
 * One line of the cart as the shop renders it. `variantId` is the
 * {@link encodeVariantRef} reference the client passes back to update / remove
 * the line. `productName` / `variantName` label it (the latter `null` for a base
 * purchase); `imageUrl` is the product's primary image or `null`. `unitPrice` is
 * the **current** per-unit price (re-priced live from the product, never the
 * cached value), `lineTotal` is `unitPrice × qty`, and `available` is whether the
 * line is currently in stock — an out-of-stock line is still shown (so the buyer
 * sees it) but flagged, and is removed at checkout. All money is in `currency`'s
 * MINOR units.
 */
export const cartItemDetailSchema = z.object({
  variantId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string(),
  variantName: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  unitPrice: z.number().int().nonnegative(),
  qty: z.number().int().min(1),
  lineTotal: z.number().int().nonnegative(),
  currency: z.string().length(3),
  available: z.boolean(),
});

/** One cart line — {@link cartItemDetailSchema}. */
export type CartItemDetail = z.infer<typeof cartItemDetailSchema>;

/**
 * The cart view returned by `GET /cart` and by every mutation (so the client
 * always gets the fresh cart back). `items` are the lines in stable insertion
 * order; `subtotal` is the sum of every line total at current prices; `discount`
 * is any applied promo discount (always `0` until a code is applied at checkout —
 * the cart stores none); `total` is `subtotal − discount`. `currency` is the
 * shop's currency (the gym sells in one currency). An empty cart is a normal
 * result the storefront renders as its empty state.
 */
export const cartViewSchema = z.object({
  items: z.array(cartItemDetailSchema),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

/** The cart view — {@link cartViewSchema}. */
export type CartView = z.infer<typeof cartViewSchema>;

/** Successful `GET /cart` / mutation response — the cart wrapped under `cart`. */
export interface CartResponse {
  cart: CartView;
}

/** Successful `POST /cart/checkout` response (`201 Created`) — the created order id. */
export interface CartCheckoutResponse {
  orderId: string;
}

/**
 * One entry of a `409 PRICE_CHANGED` checkout response — the variant whose price
 * moved and its new per-unit price (MINOR units) for the buyer to confirm before
 * retrying. The cart's stored price is refreshed to this value, so an immediate
 * retry of the same checkout succeeds.
 */
export interface CartPriceChange {
  variantId: string;
  priceAmount: number;
}

/**
 * `409 Conflict` body when one or more line prices drifted since they were last
 * added / confirmed — the checkout is rejected for re-confirmation, never
 * silently charged at the new price.
 */
export interface CartPriceChangedError {
  code: 'PRICE_CHANGED';
  newPrices: CartPriceChange[];
}

/**
 * `422 Unprocessable Entity` body when one or more lines can no longer be
 * fulfilled (out of stock) at checkout — those lines are removed from the cart
 * and their variant references returned so the buyer is told what dropped.
 */
export interface CartOutOfStockError {
  code: 'OUT_OF_STOCK';
  removedItems: string[];
}

/**
 * `422 Unprocessable Entity` body when an add / update would exceed the variant's
 * on-hand stock — the line is left unchanged.
 */
export interface CartInsufficientStockError {
  code: 'INSUFFICIENT_STOCK';
}
