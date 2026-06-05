// @fit/types — public trainer-discovery contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the public web trainers index (T3.6): the
// `GET /trainers` listing an unauthenticated visitor browses on a gym's site.
// The API validates the inbound query with these Zod schemas and the web client
// reuses the inferred types, so the trainer cards / filter bar and the controller
// can never drift on the wire format.
//
// Like the classes contracts (T3.4), the underlying Prisma-backed query lands
// later (Phase 5); this file fixes only the public-facing card shape the index
// renders, intentionally a denormalised projection (specialty + location names,
// not ids) so the page needs no follow-up joins.

import { z } from 'zod';

/**
 * One trainer as the public discovery surface needs it — a denormalised card,
 * never the full row. `headline` is a short role/tagline shown under the name;
 * `bio` is a longer blurb the card may truncate. `avatarUrl` is `null` when the
 * trainer has no photo (the card renders an initials placeholder). `specialties`
 * and `locationNames` are the denormalised names the filter facets are derived
 * from — a trainer with neither is still a valid card.
 */
export const trainerCardSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  headline: z.string(),
  bio: z.string(),
  avatarUrl: z.string().url().nullable(),
  specialties: z.array(z.string()),
  locationNames: z.array(z.string()),
});

/** A single trainer card — {@link trainerCardSchema}. */
export type TrainerCard = z.infer<typeof trainerCardSchema>;

/**
 * Query for `GET /trainers`. `gymId` scopes the listing to one tenant (the
 * public page resolves it from the active subdomain). Unlike the classes
 * listing there is no time window — the index is the gym's full roster, narrowed
 * client-side by the filter cards.
 */
export const listTrainersQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Validated `GET /trainers` query — {@link listTrainersQuerySchema}. */
export type ListTrainersQuery = z.infer<typeof listTrainersQuerySchema>;

/**
 * Successful `GET /trainers` response — the gym's trainers, ordered by name. An
 * empty array is a normal result (a gym with no trainers yet), which the page
 * renders as its empty state.
 */
export interface ListTrainersResponse {
  trainers: TrainerCard[];
}

/**
 * One upcoming session a trainer leads, as the public detail page needs it — a
 * denormalised entry, never the full class row. `startsAt` / `endsAt` are
 * ISO-8601 instants the page renders in the visitor's local zone; `locationName`
 * is the denormalised studio/location name (empty when the gym has a single
 * unnamed space). Mirrors the classes card projection (T3.4) so the same date
 * helpers group and format both.
 */
export const trainerScheduleEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  locationName: z.string(),
});

/** A single scheduled session on a trainer's detail page — {@link trainerScheduleEntrySchema}. */
export type TrainerScheduleEntry = z.infer<typeof trainerScheduleEntrySchema>;

/**
 * One trainer as the public detail page needs it — the same card projection the
 * index renders, plus the upcoming `schedule` the detail view lists. The shared
 * card fields (full `bio`, `headline`, `specialties`, `locationNames`) carry the
 * profile; `schedule` is the trainer's forthcoming sessions, ordered by
 * `startsAt`. An empty `schedule` is normal (a trainer with nothing booked yet),
 * which the page renders as its "no upcoming sessions" state.
 */
export const trainerDetailSchema = trainerCardSchema.extend({
  schedule: z.array(trainerScheduleEntrySchema),
});

/** A trainer profile + schedule for the detail page — {@link trainerDetailSchema}. */
export type TrainerDetail = z.infer<typeof trainerDetailSchema>;

/**
 * Query for `GET /trainers/:id`. The trainer is identified by the path `id`;
 * `gymId` scopes the lookup to one tenant (the public page resolves it from the
 * active subdomain) so a trainer can only ever be read through the gym whose
 * site is being browsed — an id from another tenant resolves to a `404`, same as
 * an unknown id.
 */
export const getTrainerQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Validated `GET /trainers/:id` query — {@link getTrainerQuerySchema}. */
export type GetTrainerQuery = z.infer<typeof getTrainerQuerySchema>;

/**
 * Successful `GET /trainers/:id` response — the requested trainer's profile and
 * schedule. A missing / cross-tenant id is a `404`, not an empty body, so the
 * page can cleanly distinguish "no such trainer" from "trainer with no sessions".
 */
export interface GetTrainerResponse {
  trainer: TrainerDetail;
}
