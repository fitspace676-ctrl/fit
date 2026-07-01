// @fit/types — reception check-in contracts (Zod schemas + inferred types).
//
// Shapes crossing the API boundary for the staff console's Reception screen
// (T4.12): recording a member's arrival (`POST /admin/check-ins`), the live
// "today's arrivals" feed (`GET /admin/check-ins/today`), the reception KPI
// snapshot (`GET /admin/check-ins/stats`), and a single member's current
// eligibility for the manual-lookup card (`GET /admin/check-ins/eligibility`).
// The API validates inbound bodies/queries with these Zod schemas and the
// `@fit/admin` console reuses the inferred types, so the reception UI and the
// controller can never drift on the wire format.

import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/*  Shared vocab                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How an arrival was recorded, mirroring the Prisma `CheckInMethod` enum. `QR` is
 * a scanned member code at the reception kiosk; `MANUAL` is a receptionist
 * looking the member up and checking them in by hand.
 */
export const checkInMethodSchema = z.enum(['QR', 'MANUAL']);

/** How a check-in was recorded — {@link checkInMethodSchema}. */
export type CheckInMethod = z.infer<typeof checkInMethodSchema>;

/**
 * A member's access eligibility at check-in time, derived from their gym
 * membership standing and current subscription. `ACTIVE` may enter; `FROZEN` has
 * paused their membership; `EXPIRED` has no active membership (suspended, lapsed,
 * canceled, or never subscribed). The reception eligibility card colour-codes off
 * this and staff can still record the arrival regardless.
 */
export const eligibilityStatusSchema = z.enum(['ACTIVE', 'FROZEN', 'EXPIRED']);

/** A member's access standing at check-in — {@link eligibilityStatusSchema}. */
export type EligibilityStatus = z.infer<typeof eligibilityStatusSchema>;

/**
 * A member's current eligibility, as the manual-lookup card renders it. `planName`
 * is the member's current subscription plan name, or `null` when they have no
 * active plan (the field exists on the contract now even though billing may not
 * yet populate it for every member).
 */
export const memberEligibilitySchema = z.object({
  gymMemberId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  status: eligibilityStatusSchema,
  /** Current subscription plan name, or `null` when the member has no active plan. */
  planName: z.string().nullable(),
});

/** A member's access standing + plan for the reception card — {@link memberEligibilitySchema}. */
export type MemberEligibility = z.infer<typeof memberEligibilitySchema>;

/* -------------------------------------------------------------------------- */
/*  POST /admin/check-ins                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Body for `POST /admin/check-ins` — record one member's arrival. `gymMemberId` is
 * the arriving member (tenant-scoped; a cross-gym id is a `404` from the API);
 * `method` records how they were checked in and defaults to `MANUAL`.
 */
export const recordCheckInSchema = z.object({
  gymMemberId: z.string().min(1),
  method: checkInMethodSchema.default('MANUAL'),
});

/** Validated `POST /admin/check-ins` body — {@link recordCheckInSchema}. */
export type RecordCheckInInput = z.infer<typeof recordCheckInSchema>;

/**
 * One recorded check-in as the arrivals feed renders it — a denormalised row, not
 * the raw `CheckIn` + `GymMember` + `User`. `checkedInAt` is an ISO-8601 instant
 * the client formats as "time ago" in the staff member's local zone; `photoUrl` is
 * the member's avatar or `null` (no member avatar source yet, so `null` for now).
 */
export const checkInRowSchema = z.object({
  id: z.string().min(1),
  gymMemberId: z.string().min(1),
  name: z.string(),
  photoUrl: z.string().nullable(),
  method: checkInMethodSchema,
  checkedInAt: z.string(),
});

/** One live-arrivals row — {@link checkInRowSchema}. */
export type CheckInRow = z.infer<typeof checkInRowSchema>;

/**
 * `POST /admin/check-ins` response — the created arrival plus the member's
 * eligibility at the moment of check-in, so the reception UI can confirm the
 * arrival and surface an access warning in one round-trip.
 */
export interface RecordCheckInResponse {
  checkIn: CheckInRow;
  eligibility: MemberEligibility;
}

/* -------------------------------------------------------------------------- */
/*  GET /admin/check-ins/today                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `GET /admin/check-ins/today` response — today's arrivals, most recent first
 * (the live reception feed). Empty until the first arrival of the day.
 */
export interface TodayCheckInsResponse {
  checkIns: CheckInRow[];
}

/* -------------------------------------------------------------------------- */
/*  GET /admin/check-ins/stats                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `GET /admin/check-ins/stats` response — the reception KPI snapshot. All four are
 * "today" figures scoped to the caller's gym:
 *   • `checkedInToday`  — total arrivals recorded today.
 *   • `inGymNow`        — members currently on-site (kept simple: today's distinct
 *                         arrivals, since there is no checkout event yet).
 *   • `peakToday`       — the busiest single hour's arrival count today.
 *   • `noShowsToday`    — expected members who have not checked in yet (0 until an
 *                         expected-attendance source exists; on the contract now
 *                         so the card can render without a later change).
 */
export interface CheckInStatsResponse {
  checkedInToday: number;
  inGymNow: number;
  peakToday: number;
  noShowsToday: number;
}
