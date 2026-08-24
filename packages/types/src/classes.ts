// @fit/types — public class-discovery contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the public web classes page (T3.4): the
// `GET /class-instances` listing an unauthenticated visitor browses on a gym's
// site. The API validates the inbound query with these Zod schemas and the web
// client reuses the inferred types, so the calendar/list components and the
// controller can never drift on the wire format.
//
// The underlying `ClassInstance` Prisma model + real queries land later (T5.1,
// T5.3); this file fixes only the public-facing card shape the discovery UI
// renders, which is intentionally a denormalised projection (trainer/location
// names, not ids) so the page needs no follow-up joins.

import { z } from 'zod';

/**
 * Calendar presentation mode. `week` is the time-gridded 7-day view; `list`
 * is the day-grouped agenda. Persisted in the page URL (`?view=week|list`) so a
 * shared link reopens the same mode.
 */
export const classCalendarViewSchema = z.enum(['week', 'list']);

/** A calendar presentation mode — {@link classCalendarViewSchema}. */
export type ClassCalendarView = z.infer<typeof classCalendarViewSchema>;

/** The view the page falls back to when the URL carries none / an unknown one. */
export const DEFAULT_CLASS_VIEW: ClassCalendarView = 'week';

/**
 * One scheduled class occurrence as the public discovery surface needs it — a
 * denormalised card, never the full row. `startsAt` / `endsAt` are ISO-8601
 * instants; `capacity` is the seat count and `bookedCount` how many are taken
 * (so `capacity - bookedCount` is the remaining spots a card renders). `color`
 * is the category's display colour (any CSS colour string), supplied by the API
 * so the client never hard-codes a category→colour map.
 */
export const classInstanceCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  trainerName: z.string(),
  locationName: z.string(),
  capacity: z.number().int().nonnegative(),
  bookedCount: z.number().int().nonnegative(),
  category: z.string(),
  color: z.string(),
  /**
   * The class's cover image, or null when it has none. On the card — not just
   * the detail — because the booking modal opens straight from a calendar card:
   * fetching the detail for the cover would cost a round-trip per click, where
   * one nullable URL per row costs almost nothing.
   */
  imageUrl: z.string().url().nullable(),
});

/** A single class occurrence card — {@link classInstanceCardSchema}. */
export type ClassInstanceCard = z.infer<typeof classInstanceCardSchema>;

/**
 * Lifecycle of a scheduled occurrence as the public detail page needs to read
 * it. The discovery *listing* only ever surfaces `SCHEDULED` occurrences, but a
 * deep-linked / shared detail URL can outlive the class — so the detail contract
 * carries the status and the page renders a "canceled" / "finished" banner
 * instead of a confusing 404. Mirrors the backing `InstanceStatus` Prisma enum.
 */
export const classInstanceStatusSchema = z.enum(['SCHEDULED', 'CANCELED', 'COMPLETED']);

/** A scheduled occurrence's lifecycle — {@link classInstanceStatusSchema}. */
export type ClassInstanceStatus = z.infer<typeof classInstanceStatusSchema>;

/**
 * One class occurrence as the member-facing **detail** page needs it (T5.9) — a
 * richer denormalised projection than the calendar {@link classInstanceCardSchema
 * card}. Adds the template's full `description`, the scheduled `durationMinutes`,
 * the `room` within the location (empty string when none), and the occurrence
 * `status` so a shared link to a since-canceled class degrades gracefully. As on
 * the card, `trainerName` / `locationName` are empty strings when the template
 * has no trainer / location, and `capacity` already resolves any per-occurrence
 * override, so the page renders remaining spots as `capacity - bookedCount`.
 */
export const classInstanceDetailSchema = classInstanceCardSchema.extend({
  description: z.string(),
  durationMinutes: z.number().int().positive(),
  room: z.string(),
  status: classInstanceStatusSchema,
});

/** One class occurrence's full detail — {@link classInstanceDetailSchema}. */
export type ClassInstanceDetail = z.infer<typeof classInstanceDetailSchema>;

/**
 * Query for `GET /class-instances/:id`. The occurrence is identified by the path
 * `id`; `gymId` scopes the lookup to one tenant (the public page resolves it from
 * the active subdomain) so an occurrence can only ever be read through the gym
 * whose site is being browsed — an id from another tenant resolves to a `404`,
 * same as an unknown id.
 */
export const getClassInstanceQuerySchema = z.object({
  gymId: z.string().min(1),
});

/** Validated `GET /class-instances/:id` query — {@link getClassInstanceQuerySchema}. */
export type GetClassInstanceQuery = z.infer<typeof getClassInstanceQuerySchema>;

/**
 * Successful `GET /class-instances/:id` response — the requested occurrence's
 * full detail. A missing / cross-tenant id is a `404`, not an empty body, so the
 * page can cleanly distinguish "no such class" from a class that simply has no
 * one booked yet.
 */
export interface GetClassInstanceResponse {
  instance: ClassInstanceDetail;
}

/**
 * Query for `GET /class-instances`. `gymId` scopes the listing to one tenant
 * (the public page resolves it from the active subdomain); `from`/`to` bound the
 * visible window as ISO-8601 instants (the calendar sends the selected week's
 * Monday→next-Monday range, the list view a wider span). `view` is an optional
 * hint the client echoes back — the response shape is identical for both, so the
 * server may ignore it. `.refine` rejects an inverted range up front rather than
 * returning a silently-empty list.
 */
export const listClassInstancesQuerySchema = z
  .object({
    gymId: z.string().min(1),
    from: z.string().datetime(),
    to: z.string().datetime(),
    view: classCalendarViewSchema.optional(),
  })
  .refine((q) => new Date(q.from).getTime() <= new Date(q.to).getTime(), {
    message: 'from must be on or before to',
    path: ['from'],
  });

/** Validated `GET /class-instances` query — {@link listClassInstancesQuerySchema}. */
export type ListClassInstancesQuery = z.infer<typeof listClassInstancesQuerySchema>;

/**
 * Successful `GET /class-instances` response — the occurrences overlapping the
 * requested window, ordered by `startsAt`. An empty array is a normal result (a
 * gym with no classes that week), which the page renders as its empty state.
 */
export interface ListClassInstancesResponse {
  instances: ClassInstanceCard[];
}
