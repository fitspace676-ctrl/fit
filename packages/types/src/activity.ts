// @fit/types — unified activity-feed contracts (Zod schemas + inferred types).
//
// The wire shape for the staff console's Activity screen (T3.9): the paginated,
// filtered `GET /admin/activity` feed that merges the gym's real operational
// events — member signups, class bookings, reception check-ins, captured sales,
// and subscription enrolments — into one newest-first stream. The API validates
// the inbound query with `listActivityQuerySchema` and the `@fit/admin` console
// reuses the inferred types, so the feed and the controller can never drift on
// the wire format.
//
// The feed is DERIVED, never written: every entry projects a row that already
// exists in an existing table (`GymMember`, `Booking`, `CheckIn`, `Payment`,
// `Subscription`) — there is no new "activity" table or write path. An entry
// exists only for a real record, so the feed is never fabricated.

import { z } from 'zod';

/**
 * The kinds of event the unified feed surfaces, one per source table:
 *   • `signup`       — a new member joined the gym (`GymMember.joinedAt`).
 *   • `booking`      — a member reserved a class occurrence (`Booking.createdAt`).
 *   • `checkin`      — a member arrived at reception (`CheckIn.checkedInAt`).
 *   • `sale`         — a payment was captured (`Payment.createdAt`, `CAPTURED`).
 *   • `subscription` — a member enrolled in a recurring plan (`Subscription.createdAt`).
 *
 * Exposed as a closed list so the screen's kind filter can offer human labels and
 * an icon/tone per kind. The AuditLog is deliberately not surfaced as a kind: its
 * rows are SUPER_ADMIN platform actions (owner impersonation, gym suspend) that a
 * gym operator's activity feed has no use for, and none of the five categories
 * above are stored there — they are read from their own tables.
 */
export const ACTIVITY_EVENT_TYPES = [
  'signup',
  'booking',
  'checkin',
  'sale',
  'subscription',
] as const;

/** One unified-feed event kind — {@link ACTIVITY_EVENT_TYPES}. */
export const activityEventTypeSchema = z.enum(ACTIVITY_EVENT_TYPES);

/** The kind of a feed entry, driving its icon/tone — {@link activityEventTypeSchema}. */
export type ActivityEventType = z.infer<typeof activityEventTypeSchema>;

/**
 * A `YYYY-MM-DD` calendar day, the format an `<input type="date">` emits and the
 * feed filter's date-range bounds use. Kept as a string on the wire (not a
 * `Date`) so the query round-trips cleanly through the URL and the API re-parses
 * it into an instant range server-side — mirroring the audit-log viewer.
 */
const calendarDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date');

/**
 * Query for `GET /admin/activity`. Pagination is **mandatory server-side** (the
 * stream grows unbounded, never loaded into memory): `page` is 1-based and
 * `limit` is capped at 100. `type` filters to one event kind; `from` / `to` bound
 * the range by calendar day (inclusive, interpreted in UTC). Every field is
 * optional with a sensible default so a bare `GET /admin/activity` is valid.
 * Numbers are coerced because they arrive as query strings. Results are always
 * newest-first.
 */
export const listActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Filter to a single event kind; omitted means every kind is merged. */
  type: activityEventTypeSchema.optional(),
  /** Lower bound of the range, inclusive — events on or after this day. */
  from: calendarDaySchema.optional(),
  /** Upper bound of the range, inclusive — events on or before this day. */
  to: calendarDaySchema.optional(),
});

/** Validated `GET /admin/activity` query — {@link listActivityQuerySchema}. */
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;

/**
 * One entry of the unified activity feed — a denormalised projection of a real
 * source row, never the raw record. `id` is a composite `"<type>:<rowId>"` so it
 * is stable and unique across the heterogeneous sources merged into the stream
 * (two different tables could otherwise collide on a bare cuid). The acting member
 * is resolved for display where the event has one (`memberId` / `memberName`),
 * left `null` for a guest sale with no member. `amount` / `currency` carry the
 * captured value on a `sale` and are `null` on every other kind. `at` is an
 * ISO-8601 instant the feed formats as "time ago" in the staff member's zone.
 */
export interface ActivityEvent {
  /** Composite `"<type>:<rowId>"` — stable + unique across the merged sources. */
  id: string;
  /** Which source produced this entry — {@link ACTIVITY_EVENT_TYPES}. */
  type: ActivityEventType;
  /** Short headline, e.g. "New member", "Booked Spin Express", "Sale captured". */
  title: string;
  /** Secondary detail, e.g. the member email, class status, or settlement channel. */
  detail: string;
  /** The gym-member the event concerns, or `null` for a guest sale. */
  memberId: string | null;
  /** The member's display name, or `null` when absent (guest) / unresolved. */
  memberName: string | null;
  /** Captured value in the currency's MINOR units on a `sale`, else `null`. */
  amount: number | null;
  /** ISO-4217 code of {@link amount} on a `sale`, else `null`. */
  currency: string | null;
  /** ISO-8601 instant the event happened. */
  at: string;
}

/**
 * Successful `GET /admin/activity` response — one page of the merged stream plus
 * the totals the pager needs. `total` is the count *after* filters (so the pager
 * is accurate), `page` / `limit` echo the request. An empty `data` is a normal
 * result the screen renders as its empty state.
 */
export interface ListActivityResponse {
  data: ActivityEvent[];
  total: number;
  page: number;
  limit: number;
}
