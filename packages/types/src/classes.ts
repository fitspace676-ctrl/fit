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
});

/** A single class occurrence card — {@link classInstanceCardSchema}. */
export type ClassInstanceCard = z.infer<typeof classInstanceCardSchema>;

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
