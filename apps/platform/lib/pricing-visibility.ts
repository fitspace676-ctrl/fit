/**
 * Whether the marketing site publishes its plan prices.
 *
 * Off: the homepage price grid, the `Pricing` nav / footer / dock links and the
 * "See pricing" CTAs are replaced by a **Request pricing** button that opens the
 * lead form, and `/pricing` redirects to the homepage instead of 404-ing.
 *
 * Nothing was deleted to hide them — `components/marketing/pricing-cards.tsx` and
 * `components/marketing/pricing-page.tsx` are intact and still imported, just
 * behind this flag. Flip it back to `true` and every price returns exactly as it
 * was; no other edit is needed.
 */
export const SHOW_PUBLIC_PRICING = false;
