// @fit/types — the hand-built Staff dashboard tab's contract (Zod schemas).
//
// The tab has TWO HALVES that the schema cannot join. `Trainer` is a curated
// profile carrying `availability`; a staff `GymMember` is an auth identity
// carrying `ShiftSlot` rows. There is no foreign key between them, so trainer
// delivery and shift coverage describe different populations — no figure here
// crosses that line and no total spans them.
//
// Hours are decimal hours to one place; percentages are 0–100 and NULLABLE. A
// trainer with no availability set has no utilization, not 0%: dividing by that
// zero would report every unconfigured trainer as idle.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/** The same time vocabulary as every sibling tab. */
export const staffGranularitySchema = salesGranularitySchema;
export type StaffGranularity = z.infer<typeof staffGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_STAFF_GRANULARITY: StaffGranularity = 'daily';

/**
 * `GET /dashboard/staff?granularity=` query. `.catch` (not `.default`) so a
 * hand-edited URL lands on the default rather than a 400. `locationId` reports on
 * the work delivered at one branch; omitted, the tab covers every branch, which is
 * also where an unrecognised id degrades to.
 */
export const dashboardStaffQuerySchema = z.object({
  granularity: staffGranularitySchema.catch(DEFAULT_STAFF_GRANULARITY),
  locationId: z.string().min(1).optional().catch(undefined),
});
export type DashboardStaffQuery = z.infer<typeof dashboardStaffQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/** How many trainers the ranking shows. The card's caption states it. */
export const TOP_TRAINERS = 8;

/** One bucket of the delivery trend, split by what was delivered. */
export const sessionsPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  classes: z.number(),
  pt: z.number(),
});
export type SessionsPoint = z.infer<typeof sessionsPointSchema>;

/** One trainer's delivery over the window. */
export const trainerDeliverySchema = z.object({
  name: z.string(),
  classes: z.number(),
  pt: z.number(),
  sessions: z.number(),
  /** Delivered hours behind those sessions. */
  hours: z.number(),
  /** `null` — no usable availability, so there is no rate to state. */
  utilizationRate: z.number().nullable(),
});
export type TrainerDelivery = z.infer<typeof trainerDeliverySchema>;

/** One weekday of the standing rota. Scheduled, never worked. */
export const shiftCoverageDaySchema = z.object({
  /** 0 = Monday … 6 = Sunday, matching `ShiftSlot.dayOfWeek`. */
  dayOfWeek: z.number(),
  hours: z.number(),
  staffCount: z.number(),
});
export type ShiftCoverageDay = z.infer<typeof shiftCoverageDaySchema>;

/**
 * What the tab cannot count, gathered in one place.
 *
 * Every figure above has an exclusion behind it. Scattering those as five small
 * caveats would let each be missed; naming them together makes the tab's blind
 * spots something an owner can act on rather than a footnote.
 */
export const staffGapsSchema = z.object({
  /** Approved leave overlapping the window, in staff-days. */
  leaveStaffDays: z.number(),
  staffWithoutShifts: z.number(),
  trainersWithoutAvailability: z.number(),
  classesWithoutTrainer: z.number(),
  /** Shift slots whose end does not fall after their start. */
  invalidShiftSlots: z.number(),
});
export type StaffGaps = z.infer<typeof staffGapsSchema>;

/**
 * The tab's four headline figures.
 *
 * `utilizationRate` is weighted by hours rather than averaged across trainers, so
 * one trainer with two available hours cannot swing it like one with forty, and
 * is `null` when no trainer has any availability to divide by.
 */
export const staffKpisSchema = z.object({
  trainersDelivering: z.number(),
  sessionsDelivered: z.number(),
  utilizationRate: z.number().nullable(),
  scheduledHoursPerWeek: z.number(),
});
export type StaffKpis = z.infer<typeof staffKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/staff` response — the whole tab in one round trip, so its
 * granularity control never leaves one card describing a different window from
 * its neighbour.
 */
export const dashboardStaffResponseSchema = z.object({
  granularity: staffGranularitySchema,
  kpis: staffKpisSchema,
  /** Sessions delivered per bucket, classes against PT — dense. */
  sessionsOverTime: z.array(sessionsPointSchema),
  /** Ranked by sessions, capped at {@link TOP_TRAINERS}. */
  trainers: z.array(trainerDeliverySchema),
  /** Always seven entries, Monday first. Not window-scoped — a rota has no dates. */
  shiftCoverage: z.array(shiftCoverageDaySchema),
  gaps: staffGapsSchema,
});
export type DashboardStaffResponse = z.infer<typeof dashboardStaffResponseSchema>;
