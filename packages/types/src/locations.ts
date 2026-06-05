// @fit/types — public location-discovery contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the purchase wizard's first step (T3.8):
// the `GET /locations` listing an unauthenticated visitor browses when choosing
// where to buy. The API validates the inbound query with these Zod schemas and
// the web client reuses the inferred types, so the wizard's location cards and
// the controller can never drift on the wire format.
//
// The underlying `Location` Prisma model + real queries land later; this file
// fixes only the public-facing summary shape the wizard renders, a denormalised
// projection (a flat `amenities` list and a `hours` map keyed by weekday) so the
// step needs no follow-up joins.

import { z } from 'zod';

/**
 * One physical location (branch) of a gym as the purchase wizard needs it —
 * a summary card, never the full row. `photoUrl` is an absolute URL (R2-hosted
 * in production) or `null` when the branch has no photo yet; `amenities` is a
 * flat list of short labels rendered as chips; `hours` maps a lowercase weekday
 * key (`mon`…`sun`) to a human-readable opening string (e.g. `"06:00–23:00"` or
 * `"Closed"`), so the card can surface today's hours without a second lookup.
 */
export const locationSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  address: z.string(),
  photoUrl: z.string().url().nullable(),
  amenities: z.array(z.string()),
  hours: z.record(z.string(), z.string()),
});

/** A single location summary card — {@link locationSummarySchema}. */
export type LocationSummary = z.infer<typeof locationSummarySchema>;

/**
 * Query for `GET /locations`. `gymId` scopes the listing to one tenant (the
 * public wizard resolves it from the active subdomain). An unknown gym returns
 * an empty list rather than a 404, which the step renders as its empty state.
 */
export const listLocationsQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Validated `GET /locations` query — {@link listLocationsQuerySchema}. */
export type ListLocationsQuery = z.infer<typeof listLocationsQuerySchema>;

/**
 * Successful `GET /locations` response — every active location of the gym, in
 * display order. An empty array is a normal result (a gym with no locations
 * configured yet), which the wizard renders as its empty state.
 */
export interface ListLocationsResponse {
  locations: LocationSummary[];
}
