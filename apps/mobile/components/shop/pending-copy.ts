// ===========================================================================
// TODO(i18n) — COPY THE CATALOGUES DO NOT CARRY. THIS FILE IS A DEBT.
// ===========================================================================
//
// Same shape, and the same reasoning, as `components/auth/pending-copy.ts`:
// plan §6 names states that have no copy behind them, the instruction for this
// stage was to build them STRUCTURALLY and mark them rather than author
// Georgian, and putting them in one module means closing the gap is a delete
// plus four `t()` calls rather than a hunt through four screens.
//
// The offline advisory is NOT duplicated here — `components/auth/notices.tsx`
// already owns it and already carries its own `TODO(i18n)`; the shop imports
// that component so there is one placeholder sentence in the app rather than
// two that can drift.
//
// WHAT IS OWED, and why the catalogue cannot answer it today:
//
//   | key                                   | English placeholder                                   |
//   |---------------------------------------|-------------------------------------------------------|
//   | `member.shop.cart.promoAtCheckout`    | Promo codes are applied at checkout.                  |
//   | `member.shop.cart.priceChangedBody`   | These prices changed while you were shopping. …       |
//   | `member.shop.cart.priceWas`           | was {price}                                           |
//   | `member.shop.cart.outOfStockBody`     | These items sold out and were removed from your cart. |
//   | `member.shop.cart.loadError`          | We couldn't load your cart. …                         |
//
// The first exists because **`CartView.discount` is always 0**
// (`packages/types/src/cart.ts`: "always `0` until a code is applied at
// checkout — the cart stores none"). The promo code travels in the
// `POST /cart/checkout` body, so the cart screen cannot show a discounted
// total; if it tried, the number would change under the member at the last
// step. It has to say so instead, and no key says it.
//
// The other three are the two documented checkout REJECTIONS — `409
// PRICE_CHANGED` and `422 OUT_OF_STOCK`. `member.cart.errPrice` ("Prices
// changed - review your cart") and `member.cart.outOfStock` ("Out of stock")
// exist and are used as the two headlines; what is missing is the sentence
// under each, and the "was X" label beside a new price. Both branches are
// rendered and both are tested — only these four sentences are English.
//
// The fifth was found by the feedback-and-recoverability audit. `GET /cart`
// failing is NOT the same as an empty cart, and every sentence the catalogues
// carry about the cart is about a WRITE — `errAdd`, `errUpdate`, `errCheckout`.
// There is no sentence for a cart that would not LOAD, and without one the
// badge simply disappears and the row's stepper reverts to "+", which posts a
// duplicate line for something already in the cart. See `hooks/queries/useCart.ts`.
//
// DELETE THIS FILE when the keys land.

/** The five sentences the shop renders untranslated. English-only, on purpose. */
export const SHOP_PENDING_COPY = {
  /** TODO(i18n) `member.shop.cart.promoAtCheckout` */
  promoAtCheckout: 'Promo codes are applied at checkout.',
  /** TODO(i18n) `member.shop.cart.priceChangedBody` */
  priceChangedBody:
    'These prices changed while you were shopping. Confirm the new total to place your order.',
  /** TODO(i18n) `member.shop.cart.outOfStockBody` */
  outOfStockBody: 'These items sold out and were removed from your cart.',
  /** TODO(i18n) `member.shop.cart.loadError` */
  cartLoadError: "We couldn't load your cart, so the counts here may be wrong.",
} as const;

/**
 * "was 89,00 ₾" — the previous unit price, beside the new one.
 *
 * TODO(i18n) `member.shop.cart.priceWas`, as `t('…', { price })`. Written as a
 * function taking the ALREADY-FORMATTED price so the replacement is a one-line
 * swap and the money formatting stays where it belongs.
 */
export function pendingPriceWas(price: string): string {
  return `was ${price}`;
}
