// @fit/types — public shop contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the member-facing shop the mobile app
// browses (T6.7): the `GET /products` listing of a gym's purchasable retail
// items, and the cart-based `POST /orders` checkout that turns the chosen
// products + variants into a pending order. The API validates the inbound
// query/body with these Zod schemas and the mobile client reuses the inferred
// types, so the shop cards / checkout and the controller can never drift on the
// wire format.
//
// A product mirrors the admin model (`products-admin.ts`) but as a slimmed,
// public projection: a base price in the currency's MINOR units (cents/tetri) so
// no float rounding crosses the wire, a single primary `imageUrl`, and a flat
// list of purchasable variants (only the in-stock ones, each with the price the
// buyer actually pays). The order *response* shapes are shared with the package
// purchase wizard — see {@link createOrderResponseSchema} / {@link orderSummarySchema}
// in `orders.ts` — because a confirmed order looks the same however it was built.

import { z } from 'zod';
import { orderCustomerSchema } from './orders';

/** The most distinct line items a single cart checkout may carry (keeps the body bounded). */
export const MAX_CART_ITEMS = 50;

/** The most units of one line a cart may hold. */
export const MAX_CART_LINE_QUANTITY = 99;

/**
 * One purchasable variant of a product as the shop needs it — a public
 * projection of the admin {@link ProductVariant}. `priceAmount` is the resolved
 * price the buyer pays for this variant in the product's currency MINOR units
 * (the API folds the variant override / base price into one number, so the card
 * never has to). `available` is whether the variant can currently be added to a
 * cart (in stock); an out-of-stock variant is still listed but its option is
 * disabled, so the buyer sees what exists rather than a silently shorter list.
 */
export const productVariantSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceAmount: z.number().int().nonnegative(),
  available: z.boolean(),
});

/** A single public product variant — {@link productVariantSummarySchema}. */
export type ProductVariantSummary = z.infer<typeof productVariantSummarySchema>;

/**
 * One product as the shop's browse + detail screens need it — a summary, never
 * the full admin row. `priceAmount` is the base price in the currency's MINOR
 * units; the client formats it with `Intl.NumberFormat` against `currency` (ISO
 * 4217). `imageUrl` is the primary (first) gallery image, or `null` when the
 * product has no images (the card renders a placeholder). `variants` is the flat
 * list of purchasable options — empty when the product is sold as-is (the buyer
 * adds the product itself at its base price).
 */
export const productSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  imageUrl: z.string().url().nullable(),
  variants: z.array(productVariantSummarySchema),
});

/** A single product summary — {@link productSummarySchema}. */
export type ProductSummary = z.infer<typeof productSummarySchema>;

/**
 * Query for `GET /products`. `gymId` scopes the listing to one tenant (the
 * mobile app resolves it from the session's gym claim). An unknown gym returns
 * an empty list rather than a 404, which the shop renders as its empty state.
 */
export const listProductsQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Validated `GET /products` query — {@link listProductsQuerySchema}. */
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

/**
 * Successful `GET /products` response — every active product available for the
 * gym, in display order. An empty array is a normal result (a gym with no shop
 * products configured yet), which the shop renders as its empty state.
 */
export interface ListProductsResponse {
  products: ProductSummary[];
}

/**
 * One line of a cart checkout. `productId` is the product being bought;
 * `variantId` names the chosen variant, or is omitted when the product has no
 * variants (bought at its base price). `quantity` is how many units of that
 * exact line, a positive integer capped so a fat-fingered stepper can't submit a
 * runaway order. The API re-prices every line from `productId` + `variantId`
 * server-side, so the client never sends money — only what was chosen.
 */
export const shopOrderItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(MAX_CART_LINE_QUANTITY),
});

/** One validated cart line — {@link shopOrderItemSchema}. */
export type ShopOrderItem = z.infer<typeof shopOrderItemSchema>;

/**
 * Body for the cart-based checkout (`POST /orders`). `gymId` scopes the order to
 * one tenant; `items` is the cart, at least one line and capped at
 * {@link MAX_CART_ITEMS} distinct lines. `customer` carries guest contact
 * details when the buyer is not signed in — omitted for a member checkout, where
 * the API derives the buyer from the bearer session (the mobile shop always runs
 * signed-in, but the field keeps the contract symmetric with the package
 * wizard's guest checkout). The API re-prices the cart and returns the created
 * order id plus the stub payment redirect, exactly like the package checkout.
 */
export const createShopOrderSchema = z.object({
  gymId: z.string().min(1),
  items: z.array(shopOrderItemSchema).min(1).max(MAX_CART_ITEMS),
  customer: orderCustomerSchema.optional(),
});

/** Validated cart-checkout body — {@link createShopOrderSchema}. */
export type CreateShopOrderInput = z.infer<typeof createShopOrderSchema>;
