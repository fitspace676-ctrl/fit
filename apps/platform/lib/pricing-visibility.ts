/**
 * Whether the marketing site prints its plan **prices**.
 *
 * Off, the plans themselves are still on show everywhere — the homepage grid,
 * `/pricing`, the `Pricing` nav / footer / dock links, the comparison table and
 * the badges are all exactly as they were. What disappears is every figure: the
 * per-tier amount, the `₾`, the `/mo` and the "prices in lari" note. Visitors who
 * want a figure use the card's "Book a demo" / "Request a call" buttons.
 *
 * Nothing was deleted to hide the numbers — the amounts still live in `tiers`
 * (`components/marketing/pricing-cards.tsx`). Flip this back to `true` and every
 * price returns exactly as it was; no other edit is needed.
 */
export const SHOW_PUBLIC_PRICING = false;
