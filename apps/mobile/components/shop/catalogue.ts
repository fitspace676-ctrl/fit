// @fit/mobile — reading the product catalogue and the cart, without React.
//
// Pure functions over `ProductSummary` / `CartView`, so the shop's arithmetic —
// which variant a "+" adds, whether a product is sold out, how many units are
// in the cart — is testable and, more importantly, is stated ONCE. The deleted
// app derived "is this in the cart" in three places with three answers.
//
// ===========================================================================
// THE VARIANT REFERENCE IS NOT THE VARIANT ID.
//
// `ProductVariantSummary.id` is the variant's INDEX IN THE PRODUCT'S JSON
// ARRAY, stringified — `apps/api/src/products/products.service.ts` builds it as
// `String(index)`, because variants carry no persistent id of their own. The
// cart addresses a line by `encodeVariantRef(productId, variantIndex)`, i.e.
// `"<productId>:<index>"`, or `"<productId>:base"` for a product bought at its
// base price with no variant chosen.
//
// So `variantRef` is the ONLY place those two representations meet, and it goes
// through `@fit/types`' encoder rather than a template literal — the wire
// format is that function, not this file.
// ===========================================================================
//
// WHAT THE PUBLIC LISTING DOES NOT CARRY, and therefore what the shop cannot
// show: a stock COUNT. `GET /products` projects each variant down to a boolean
// `available` and the product itself to no availability at all, so the
// artboard's "· მარაგში 4" low-stock tail has no data behind it and is not
// drawn. See the report for this stage.

import {
  encodeVariantRef,
  type CartItemDetail,
  type CartView,
  type ProductSummary,
} from '@fit/types';

import { FALLBACK_CURRENCY } from './money';

/**
 * The cart reference for one variant of a product.
 *
 * `variantId` is `ProductVariantSummary.id` (a stringified index) or `null` for
 * the base, no-variant purchase.
 */
export function variantRef(productId: string, variantId: string | null): string {
  return encodeVariantRef(productId, variantId === null ? null : Number(variantId));
}

/**
 * The single reference this product adds as, or `null` when the buyer has to
 * choose first.
 *
 * The rule, and it is the whole reason the shop list can carry a stepper at
 * all: a product with no variants is one line (`:base`); a product with exactly
 * one purchasable variant is also one line, because there is nothing to pick;
 * a product with two or more is ambiguous, so its "+" opens the detail screen
 * instead of guessing which option the member wanted.
 */
export function singleVariantRef(product: ProductSummary): string | null {
  if (product.variants.length === 0) return variantRef(product.id, null);
  if (product.variants.length === 1) {
    const only = product.variants[0];
    return only === undefined ? null : variantRef(product.id, only.id);
  }
  return null;
}

/**
 * The lowest price a buyer can pay for this product, in minor units.
 *
 * Variant prices are already resolved server-side (the variant's override, else
 * the product's base), so this is a plain minimum over whatever exists.
 */
export function lowestPrice(product: ProductSummary): number {
  if (product.variants.length === 0) return product.priceAmount;
  return product.variants.reduce(
    (lowest, variant) => Math.min(lowest, variant.priceAmount),
    Number.POSITIVE_INFINITY,
  );
}

/**
 * Whether the price shown is a floor rather than the price.
 *
 * The artboard writes `89,00 ₾-დან` ("from 89,00 ₾") when a product has more
 * than one variant — and only then, because with one variant there is no range
 * to be the bottom of.
 */
export function hasPriceRange(product: ProductSummary): boolean {
  return product.variants.length > 1;
}

/**
 * Can anything on this product be bought right now?
 *
 * A product with variants is sold out when NONE of them is available. A product
 * with no variants carries no availability flag on the public listing at all —
 * `ProductSummary` has no `available` field — so it is treated as buyable and
 * the server is left to answer `422 INSUFFICIENT_STOCK` if it is not. Guessing
 * "unavailable" from missing data would hide a sellable product.
 */
export function isSoldOut(product: ProductSummary): boolean {
  return product.variants.length > 0 && product.variants.every((variant) => !variant.available);
}

/** The cart line for a variant reference, or `undefined`. */
export function lineFor(cart: CartView, ref: string): CartItemDetail | undefined {
  return cart.items.find((item) => item.variantId === ref);
}

/** Units of one variant reference already in the cart. `0` when it is not. */
export function qtyOf(cart: CartView, ref: string | null): number {
  if (ref === null) return 0;
  return lineFor(cart, ref)?.qty ?? 0;
}

/** Total units across every line — the header badge and the mini-cart count. */
export function cartCount(cart: CartView): number {
  return cart.items.reduce((total, item) => total + item.qty, 0);
}

/**
 * The currency this gym's shop sells in, from the product listing.
 *
 * `useCart(currency)` needs one on its first render and the cart cannot supply
 * it — an empty cart has no line to read it off, and the gym's currency is not
 * a JWT claim. A gym sells in exactly one currency, so the first product
 * answers for all of them; before the listing lands, {@link FALLBACK_CURRENCY}
 * stands in, and it is only ever visible as the unit on a `0` total.
 */
export function listCurrency(products: readonly ProductSummary[] | undefined): string {
  return products?.[0]?.currency ?? FALLBACK_CURRENCY;
}

/**
 * The monogram drawn on a product's thumbnail plate.
 *
 * Upper-cased ONLY for the Latin script. Georgian Mkhedruli has an upper case
 * in Unicode 11+ (Mtavruli), so `'ა'.toUpperCase()` really does return `'Ა'` —
 * a letterform Georgian uses for emphasis and headings, never for an initial,
 * and one that reads as shouting on a product card. Leaving it alone is the
 * correct behaviour in the app's primary language, which is exactly the class
 * of bug an English-speaking reviewer never sees.
 */
export function productInitial(name: string): string | undefined {
  const first = [...name.trim()][0];
  if (first === undefined) return undefined;
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

/**
 * Client-side search, per the artboard's own field.
 *
 * Case-insensitive over the name and the description. Deliberately NOT sent to
 * the server: `GET /products` takes `gymId` and nothing else (see
 * `listProductsQuerySchema`), a gym's catalogue is tens of rows, and the whole
 * list is already in the cache — so filtering locally is instant and needs no
 * endpoint that does not exist.
 */
export function matchesQuery(product: ProductSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    product.name.toLowerCase().includes(needle) ||
    product.description.toLowerCase().includes(needle)
  );
}
