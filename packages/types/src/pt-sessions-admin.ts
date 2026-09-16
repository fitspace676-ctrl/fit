// @fit/types — staff-console PT-calendar contracts (Zod schemas + types).
//
// Shapes crossing the API boundary for the Classes hub's PT Calendar tab: the
// `GET /admin/pt-sessions` range query (a chosen trainer's sessions in a window),
// the `POST /admin/pt-sessions` create body, and the denormalised
// {@link AdminPtSession} the calendar renders. A PT session is a trainer + a
// workout type (a {@link AdminClassTypeOption class type}) at a time — no member —
// so it is its own contract rather than a reuse of the schedule's class-occurrence
// shapes.

import { z } from 'zod';
import type { ClassInstanceStatus } from './classes';
import { MAX_SCHEDULE_WINDOW_DAYS } from './schedule-admin';

/** {@link MAX_SCHEDULE_WINDOW_DAYS} in ms — the PT calendar shares the schedule's window guard. */
const MAX_WINDOW_MS = MAX_SCHEDULE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Query for `GET /admin/pt-sessions`. `from`/`to` bound the visible window as
 * ISO-8601 instants (a session belongs to the window when its `startsAt` is in
 * `[from, to)`).
 *
 * `trainerId` is **optional**: omitted, the calendar shows every trainer's sessions
 * for the week, which is how the PT tab opens. Supplying one narrows the calendar to
 * that trainer. The gym is the tenant session, not on the wire. The two `.refine`s
 * reject an inverted or over-wide range up front.
 */
export const listAdminPtSessionsQuerySchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
    trainerId: z.string().min(1).optional(),
    /**
     * Narrow the calendar to the sessions running at one branch — plain equality on
     * `PtSession.locationId`, the column Stage 6 added.
     *
     * **Not the coach's roster.** A session is one hour at one door, so it carries
     * its own branch; reaching it through the trainer's assignments would leave
     * "where is this" ambiguous for exactly the coaches who cover two sites, which
     * are the only ones worth asking about. It is not the coach's BASE branch
     * either: someone based at the flagship covering a Tuesday at the satellite
     * delivered that hour at the satellite.
     *
     * A session with no branch is absent from a filtered calendar and present in the
     * unfiltered one — nothing knows where it is, and no branch may adopt it.
     */
    locationId: z.string().min(1).optional(),
  })
  .refine((q) => new Date(q.from).getTime() <= new Date(q.to).getTime(), {
    message: 'from must be on or before to',
    path: ['from'],
  })
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= MAX_WINDOW_MS, {
    message: `The window cannot exceed ${MAX_SCHEDULE_WINDOW_DAYS} days`,
    path: ['to'],
  });

/** Validated `GET /admin/pt-sessions` query — {@link listAdminPtSessionsQuerySchema}. */
export type ListAdminPtSessionsQuery = z.infer<typeof listAdminPtSessionsQuerySchema>;

/**
 * Body for `POST /admin/pt-sessions` — schedule one session on a trainer's PT
 * calendar for a workout type (a class type). `startsAt` is an ISO-8601 datetime;
 * `endsAt` is derived server-side from `durationMinutes` (so it can't drift).
 * `notes` is optional free text. The gym is the tenant session. Numbers are
 * coerced because the admin form submits them as strings.
 */
export const createPtSessionSchema = z.object({
  trainerId: z.string().min(1, 'Pick a trainer'),
  classTypeId: z.string().min(1, 'Pick a workout type'),
  /**
   * The branch this session runs at. Optional, and resolved server-side in one of
   * exactly three ways — never by guessing:
   *
   *  1. Sent — that branch, after checking it belongs to this gym.
   *  2. Omitted, and the coach is rostered at exactly ONE branch — that branch.
   *     There is only one possible answer, so taking it invents nothing: the
   *     ambiguity Stage 6 refused to resolve exists only for a coach who covers
   *     two sites.
   *  3. Omitted, and the coach is rostered nowhere or at several — `null`. The
   *     session is unattributed and shows only on the unfiltered calendar.
   *
   * The gym's DEFAULT branch is never used, and neither is the coach's base
   * branch. A PT session is a plan about a room, and defaulting one puts an hour
   * of coaching at a door it was never booked for — the same reason a shift is
   * left unattributed rather than defaulted.
   */
  locationId: z.string().min(1).optional(),
  startsAt: z.string().datetime({ message: 'A valid start time is required' }),
  durationMinutes: z.coerce
    .number()
    .int('Duration must be a whole number of minutes')
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot exceed 24 hours'),
  notes: z.string().trim().max(2000).default(''),
});

/** Raw (pre-parse) create input — the form's string-ish values. */
export type CreatePtSessionInput = z.input<typeof createPtSessionSchema>;

/** Validated `POST /admin/pt-sessions` body the service persists. */
export type CreatePtSessionData = z.infer<typeof createPtSessionSchema>;

/**
 * One PT session as the calendar renders it — a denormalised block. `startsAt` /
 * `endsAt` are the resolved ISO-8601 instants the grid positions the block by, and
 * `durationMinutes` (its height) is their difference. `trainerName` is the trainer
 * whose calendar this is; `classTypeName` / `classTypeColor` are the workout type's
 * label and swatch (both `null` when the type has since been deleted, since the
 * relation is `SET NULL`). `status` carries the lifecycle so a canceled / completed
 * session renders with the right badge rather than being hidden.
 */
export interface AdminPtSession {
  id: string;
  trainerId: string;
  trainerName: string;
  classTypeId: string | null;
  classTypeName: string | null;
  classTypeColor: string | null;
  /**
   * The branch this session runs at, and its name for the block's badge — both
   * `null` for an unattributed session, and for one whose branch was later closed
   * (`SetNull`, because the coaching still happened).
   */
  locationId: string | null;
  locationName: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: ClassInstanceStatus;
  notes: string;
}

/**
 * Successful `GET /admin/pt-sessions` response — the sessions whose `startsAt` falls
 * in the window (every trainer's, or one trainer's when the query narrowed it),
 * ordered by `startsAt`. An empty array is a normal result — a quiet week — and is
 * rendered as an empty calendar rather than an error.
 */
export interface AdminPtSessionsResponse {
  sessions: AdminPtSession[];
}

/** Successful `POST /admin/pt-sessions` (create) response — the new session. */
export type CreatePtSessionResponse = AdminPtSession;

/**
 * Successful `POST /admin/pt-sessions/:id/cancel` / `.../complete` response — the
 * session after its `status` moved to `CANCELED` / `COMPLETED`, so the calendar
 * re-renders from the one call.
 */
export type PtSessionStatusResponse = AdminPtSession;
