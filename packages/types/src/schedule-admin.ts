// @fit/types — staff-console schedule week-view contracts (Zod schemas + types).
//
// Shapes crossing the API boundary for the scheduling console's week calendar
// (T3.1 → T3.2): the `GET /admin/schedule` range query the calendar issues as the
// staff pages between weeks, and the materialised {@link ClassInstance} occurrences
// it renders, each carrying its occupancy (`bookedCount` / `capacity`), its trainer
// and branch, and its lifecycle `status`. The API validates the inbound query with
// this Zod schema and the `@fit/admin` console reuses the inferred types, so the
// calendar grid and the controller can never drift on the wire format.
//
// Unlike the *public* discovery listing ({@link ListClassInstancesResponse}, which
// only ever surfaces `SCHEDULED` occurrences as anonymous cards), the staff view is
// tenant-scoped and shows every occurrence in the window whatever its status — so a
// canceled or completed class still appears on the calendar with the badge that
// says so, and the occupancy the desk plans around is always visible.

import { z } from 'zod';
import type { ClassInstanceStatus } from './classes';

/**
 * The widest range `GET /admin/schedule` will serve in one request, in days. A
 * week view asks for seven days at a time; a month view for ~31. The ceiling
 * (two months) keeps a single query bounded — the calendar pages rather than
 * pulling a whole year — while comfortably covering any real calendar span the
 * console renders. A wider window is a `400`, not a slow unbounded scan.
 */
export const MAX_SCHEDULE_WINDOW_DAYS = 62;

/** {@link MAX_SCHEDULE_WINDOW_DAYS} expressed in milliseconds, for the range guard. */
const MAX_SCHEDULE_WINDOW_MS = MAX_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Query for `GET /admin/schedule`. `from`/`to` bound the visible window as
 * ISO-8601 instants (the calendar sends the selected week's Monday→next-Monday
 * range in the gym's zone); an occurrence belongs to the window when its
 * `startsAt` falls in `[from, to)`, so an occurrence that spans midnight into the
 * next week is placed once, by its start. `trainerId` / `locationId` optionally
 * narrow the grid to one coach or branch (the console's calendar filters). The
 * gym is *not* on the wire — the route is tenant-scoped, so the caller's session
 * pins it. Two `.refine`s reject an inverted or over-wide range up front rather
 * than returning a silently-empty or unbounded result.
 */
export const adminScheduleQuerySchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    trainerId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
  })
  .refine((q) => new Date(q.from).getTime() <= new Date(q.to).getTime(), {
    message: 'from must be on or before to',
    path: ['from'],
  })
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= MAX_SCHEDULE_WINDOW_MS, {
    message: `The window cannot exceed ${MAX_SCHEDULE_WINDOW_DAYS} days`,
    path: ['to'],
  });

/** Validated `GET /admin/schedule` query — {@link adminScheduleQuerySchema}. */
export type AdminScheduleQuery = z.infer<typeof adminScheduleQuerySchema>;

/**
 * One materialised class occurrence as the staff week calendar renders it — a
 * denormalised block, never the full row. `startsAt` / `endsAt` are the resolved
 * ISO-8601 instants the grid positions the block by; `durationMinutes` is the
 * template's scheduled length (the block's height) even if a past edit realigned
 * `endsAt`. `capacity` already resolves any per-occurrence override, so the desk
 * reads remaining spots as `capacity - bookedCount`. `trainerName` /
 * `locationName` / `room` are the denormalised template defaults, `null` when the
 * template has none. `status` carries the occurrence's lifecycle so a canceled /
 * completed class renders with the right badge rather than being hidden.
 * `templateId` deep-links the block to its recurring definition for a quick edit.
 */
export interface AdminScheduleInstance {
  id: string;
  templateId: string;
  title: string;
  category: string;
  color: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  trainerName: string | null;
  locationName: string | null;
  room: string | null;
  capacity: number;
  bookedCount: number;
  status: ClassInstanceStatus;
}

/**
 * Successful `GET /admin/schedule` response — every occurrence whose `startsAt`
 * falls in the requested window, ordered by `startsAt`. An empty array is a
 * normal result (a gym with no classes that week), which the calendar renders as
 * its empty state.
 */
export interface AdminScheduleResponse {
  instances: AdminScheduleInstance[];
}

/**
 * A live booking's lifecycle status as the staff class-instance drawer lists it
 * (T3.3). `BOOKED` holds a confirmed seat; `WAITLIST` is queued (ordered by
 * `waitlistPosition`) for a freed one; `ATTENDED` / `NO_SHOW` are the post-class
 * attendance outcomes a completed occurrence carries. A `CANCELED` booking
 * released its hold and never appears on the roster, so it is intentionally
 * absent — the drawer shows the people who are (or were) actually coming.
 */
export type AdminRosterBookingStatus = 'BOOKED' | 'WAITLIST' | 'ATTENDED' | 'NO_SHOW';

/**
 * One row of a class occurrence's booking roster in the staff drawer (T3.3) — a
 * live booking and the member who holds it. `memberName` is their display name
 * (`null` when they never set one); `memberEmail` is always present so the desk
 * can still identify them. `waitlistPosition` is the queue slot for a `WAITLIST`
 * entry and `null` for a held seat. `bookedAt` (ISO-8601) is when the booking was
 * made, giving the held-seat list a stable order.
 */
export interface AdminClassInstanceRosterEntry {
  bookingId: string;
  memberId: string;
  memberName: string | null;
  memberEmail: string;
  status: AdminRosterBookingStatus;
  waitlistPosition: number | null;
  bookedAt: string;
}

/**
 * One class occurrence in full, as the staff schedule drawer renders it (T3.3):
 * the same denormalised block the week grid shows ({@link AdminScheduleInstance})
 * plus its `waitlistCount` and the `roster` of live bookings (held seats first in
 * booking order, then the waitlist by position). Opening the drawer fetches this
 * from `GET /admin/schedule/instances/:id`; a cancel returns the refreshed shape
 * so the drawer re-renders from one round-trip.
 */
export interface AdminClassInstanceDetail extends AdminScheduleInstance {
  /** Number of `WAITLIST` entries queued for a freed seat. */
  waitlistCount: number;
  roster: AdminClassInstanceRosterEntry[];
}

/** Successful `GET /admin/schedule/instances/:id` response — {@link AdminClassInstanceDetail}. */
export type GetAdminClassInstanceResponse = AdminClassInstanceDetail;

/**
 * Successful `POST /admin/schedule/instances/:id/cancel` response — the occurrence
 * detail after it was canceled (its `status` now `CANCELED`, every held-seat / queued
 * booking released), so the drawer and the underlying week grid re-render from the
 * one call.
 */
export type CancelClassInstanceResponse = AdminClassInstanceDetail;
