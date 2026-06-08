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
