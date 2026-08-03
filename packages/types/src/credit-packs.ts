// @fit/types — credit pack / class pass contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the credit-pack flow (T8.5): the
// `POST /credit-packs/purchase` call a member makes to buy a class pass, and the
// `GET /members/me/credit-packs` listing the member dashboard / mobile profile
// render to show the credits they have left. The API validates the inbound body
// with `purchaseCreditPackSchema` and the member clients reuse the inferred
// types, so the dashboard and the controller can never drift on the wire format.
//
// A credit pack is minted from a finite-`sessionCount` {@link PackageSummary}
// catalogue plan: buying it grants `sessionCount` class credits the member spends
// booking classes (one credit per confirmed seat), drawn down FIFO by the pack
// expiring soonest. Like the freeze flow (`subscriptions.ts`), the member acts on
// their *own* account — the gym + member are resolved from the tenant-scoped
// session, never off the wire — so the only input is the catalogue `packId`.

import { z } from 'zod';

/**
 * `422` code returned when a credit pack can't be purchased — the referenced
 * {@link PackageSummary} plan is missing, not `ACTIVE`, or has no finite
 * `sessionCount` (an unlimited plan grants no countable credits, so it isn't a
 * pack). The client surfaces it as "this pack is no longer available".
 */
export const PACK_UNAVAILABLE_CODE = 'PACK_UNAVAILABLE';

/**
 * `422` code returned when a booking can't be paid for — the member holds no
 * entitling subscription and has no class credits left across their active packs
 * (T8.5). The booking client surfaces it as "you're out of credits".
 */
export const INSUFFICIENT_CREDITS_CODE = 'INSUFFICIENT_CREDITS';

/**
 * Body for `POST /credit-packs/purchase` — buy the credit pack identified by the
 * catalogue `packId` (a finite-`sessionCount` {@link PackageSummary} plan). The
 * member and gym are the authenticated caller's own, resolved from the
 * tenant-scoped session (never trusted off the wire), so they are not in the body.
 */
export const purchaseCreditPackSchema = z.object({
  packId: z.string().min(1),
  /**
   * An optional discount code. A credit pack is a {@link PackagePlan}, so it is
   * checked against the `packages` scope — the same codes that discount a plain
   * package discount a session pack, which is what a gym running "20% off
   * packages" means by it.
   */
  promoCode: z.string().trim().min(1).max(64).optional(),
});

/** Validated `POST /credit-packs/purchase` body — {@link purchaseCreditPackSchema}. */
export type PurchaseCreditPackInput = z.input<typeof purchaseCreditPackSchema>;

/** Parsed `POST /credit-packs/purchase` body — {@link purchaseCreditPackSchema}. */
export type PurchaseCreditPackData = z.infer<typeof purchaseCreditPackSchema>;

/**
 * Successful `POST /credit-packs/purchase` response — the id of the freshly minted
 * {@link CreditPackSummary} the member can now spend on bookings.
 */
export interface PurchaseCreditPackResponse {
  creditPackId: string;
  /**
   * The `PAID` order the purchase was recorded on. Surfaced so a caller that
   * settles several product types through one flow — the join wizard's checkout —
   * can key its confirmation screen off the same `orderId` regardless of what was
   * bought. Callers that only need the pack can ignore it.
   */
  orderId: string;
}

/**
 * One of the caller's purchased credit packs as the member dashboard needs it
 * (`GET /members/me/credit-packs`, T8.5). `totalCredits` is the credits the pack
 * was bought with and `remainingCredits` the live balance; `expiresAt` is the
 * ISO-8601 instant the pack lapses, or `null` for a pack that never expires.
 * `planTitle` is the catalogue plan's name snapshotted at purchase, so it survives
 * the plan being renamed or removed (`null` only if it was never recorded).
 */
export const creditPackSummarySchema = z.object({
  id: z.string().min(1),
  totalCredits: z.number().int().nonnegative(),
  remainingCredits: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
  planTitle: z.string().nullable(),
});

/** A single credit-pack summary — {@link creditPackSummarySchema}. */
export type CreditPackSummary = z.infer<typeof creditPackSummarySchema>;

/**
 * Successful `GET /members/me/credit-packs` response — the caller's usable credit
 * packs (`ACTIVE`, with credits left), ordered by the pack expiring soonest first
 * (the same FIFO order booking draws them down in), packs that never expire last.
 * An empty array is a normal `200` — a member who has bought no packs (or whose
 * packs are all spent / expired).
 */
export interface ListCreditPacksResponse {
  packs: CreditPackSummary[];
}

/**
 * One buyable credit pack from the gym's catalogue (T5.8) — a finite-`sessionCount`,
 * `ACTIVE` {@link PackagePlan} projected to exactly what the purchase pickers need:
 * the member portal's "Buy credits" modal and the admin member-detail "Add credit"
 * modal both render these to let a pack be chosen, then post its `id` to the
 * purchase / grant endpoint. `priceAmount` is in the currency's MINOR units (no
 * float crosses the wire); `sessionCount` is the credits the pack grants; and
 * `validityDays` is how long the minted pack stays usable (`null` = never expires).
 */
export const creditPackCatalogueEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  sessionCount: z.number().int().positive(),
  validityDays: z.number().int().positive().nullable(),
});

/** A single catalogue entry the purchase pickers render — {@link creditPackCatalogueEntrySchema}. */
export type CreditPackCatalogueEntry = z.infer<typeof creditPackCatalogueEntrySchema>;

/**
 * Successful `GET /credit-packs/catalogue` (member) / `GET /admin/credit-packs/
 * catalogue` (staff) response — the gym's purchasable credit packs, cheapest
 * first. An empty array is a normal `200` (a gym that sells no finite-session
 * packs), which the pickers render as their "no packs on sale" state.
 */
export interface ListCreditPackCatalogueResponse {
  packs: CreditPackCatalogueEntry[];
}
