// @fit/types — public package-catalogue contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the purchase wizard's second step (T3.9):
// the `GET /packages` listing an unauthenticated visitor browses when choosing
// what to buy, after picking a location in step 1 (T3.8). The API validates the
// inbound query with these Zod schemas and the web client reuses the inferred
// types, so the wizard's package cards and the controller can never drift on the
// wire format.
//
// The underlying `Package`/`MembershipPlan` Prisma model + real queries land
// later; this file fixes only the public-facing summary shape the step renders,
// a denormalised projection (price in minor units + a flat `features` list) so
// the card needs no follow-up joins or a category→price map.

import { z } from 'zod';

/**
 * How a package is billed. `month`/`year` are recurring memberships; `one_time`
 * is a single charge (a session pack or a day pass). The card surfaces a per
 * `interval` suffix ("/ mo", "/ yr") for recurring plans and none for one-off
 * purchases.
 */
export const packageIntervalSchema = z.enum(['month', 'year', 'one_time']);

/** A package's billing cadence — {@link packageIntervalSchema}. */
export type PackageInterval = z.infer<typeof packageIntervalSchema>;

/**
 * One purchasable package as the wizard's step 2 needs it — a summary card,
 * never the full row. `priceAmount` is in the currency's MINOR units (e.g.
 * cents/tetri) so no float rounding crosses the wire; the client formats it with
 * `Intl.NumberFormat` against `currency` (ISO 4217). `interval` drives the price
 * suffix; `sessionCount` is the number of sessions a pack grants, or `null` for
 * unlimited access. `features` is a flat list of short perk labels rendered as
 * bullets, and `popular` flags the one plan that gets the brand emphasis and a
 * "Most popular" badge.
 */
export const packageSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  priceAmount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  interval: packageIntervalSchema,
  sessionCount: z.number().int().positive().nullable(),
  features: z.array(z.string()),
  popular: z.boolean(),
});

/** A single package summary card — {@link packageSummarySchema}. */
export type PackageSummary = z.infer<typeof packageSummarySchema>;

/**
 * Query for `GET /packages`. `gymId` scopes the listing to one tenant (the
 * public wizard resolves it from the active subdomain). `locationId` is the
 * branch chosen in step 1: optional because some catalogues are gym-wide, but
 * when present it narrows the result to packages sold at that location. An
 * unknown gym/location returns an empty list rather than a 404, which the step
 * renders as its empty state.
 */
export const listPackagesQuerySchema = z.object({
  gymId: z.string().min(1),
  locationId: z.string().min(1).optional(),
});

/** Validated `GET /packages` query — {@link listPackagesQuerySchema}. */
export type ListPackagesQuery = z.infer<typeof listPackagesQuerySchema>;

/**
 * Successful `GET /packages` response — every active package available for the
 * gym (and location, when scoped), in display order. An empty array is a normal
 * result (a gym with no packages configured yet), which the wizard renders as
 * its empty state.
 */
export interface ListPackagesResponse {
  packages: PackageSummary[];
}
