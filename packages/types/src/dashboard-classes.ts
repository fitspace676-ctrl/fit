// @fit/types — the hand-built Classes dashboard tab's contract (Zod schemas).
//
// Sibling of `./dashboard-sales`, `./dashboard-members` and `./dashboard-revenue`.
// Where Revenue answers "what did we take?", this one answers "what did we commit
// a trainer and a room to, and did anybody come?"
//
// Percentages are 0–100 and NULLABLE throughout. A `null` rate is "there was
// nothing to measure"; `0` is "measured, and it was zero". Collapsing the two
// would report an attendance rate of 0% for a week with no marked bookings — a
// confident claim about a fact nobody recorded.
//
// The heatmap travels as CELLS ONLY. Weekday names are i18n keys resolved
// client-side, so this contract stays locale-free like every sibling; the Reports
// drill-down puts English row labels on the wire and this deliberately does not
// copy that.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately the SAME vocabulary and window
 * mapping as its three sibling tabs, so a user who learns one time control has
 * learned all of them.
 */
export const classesGranularitySchema = salesGranularitySchema;
export type ClassesGranularity = z.infer<typeof classesGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_CLASSES_GRANULARITY: ClassesGranularity = 'daily';

/**
 * `GET /dashboard/classes?granularity=` query. `.catch` (not `.default`) so a
 * hand-edited URL lands on the default rather than a 400.
 */
export const dashboardClassesQuerySchema = z.object({
  granularity: classesGranularitySchema.catch(DEFAULT_CLASSES_GRANULARITY),
});
export type DashboardClassesQuery = z.infer<typeof dashboardClassesQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/** Demand heatmap dimensions: Monday–Sunday by hour 0–23, UTC. */
export const HEATMAP_ROWS = 7;
export const HEATMAP_COLS = 24;

/** One bucket of a percentage trend. `null` — nothing to measure, not 0%. */
export const classesRatePointSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
});
export type ClassesRatePoint = z.infer<typeof classesRatePointSchema>;

/** One row of the class-type ranking. */
export const classTypeSliceSchema = z.object({
  name: z.string(),
  seatsBooked: z.number(),
  sessions: z.number(),
  /** `null` when the type's occurrences resolved no capacity at all. */
  utilizationRate: z.number().nullable(),
});
export type ClassTypeSlice = z.infer<typeof classTypeSliceSchema>;

/**
 * The tab's four headline figures. Two counts and two rates; the rates are
 * nullable for the reason in this module's header.
 *
 * `noShowRate` rather than the attendance rate it complements: they share a
 * denominator, so one is `100 −` the other, and the tile carries the one an owner
 * acts on while the trend carries the one that reads better as a line.
 */
export const classesKpisSchema = z.object({
  classesHeld: z.number(),
  seatsBooked: z.number(),
  noShowRate: z.number().nullable(),
  utilizationRate: z.number().nullable(),
});
export type ClassesKpis = z.infer<typeof classesKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/classes` response — the whole tab in one round trip, so its
 * granularity control never leaves one card describing a different window from
 * its neighbour.
 */
export const dashboardClassesResponseSchema = z.object({
  granularity: classesGranularitySchema,
  kpis: classesKpisSchema,
  /** Seats booked per bucket, keyed by the occurrence's start — dense. */
  bookingsOverTime: z.array(reportSeriesPointSchema),
  /** Attended share of the marked bookings per bucket. */
  attendanceOverTime: z.array(classesRatePointSchema),
  /** Seats booked against resolved capacity per bucket. */
  utilizationOverTime: z.array(classesRatePointSchema),
  /** Non-cancelled PT sessions per bucket — dense. */
  ptSessionsOverTime: z.array(reportSeriesPointSchema),
  /** Ranked by seats booked, capped at eight rows. */
  topClassTypes: z.array(classTypeSliceSchema),
  /** {@link HEATMAP_ROWS} x {@link HEATMAP_COLS} seat counts, Mon–Sun x hour, UTC. */
  demandByHour: z.array(z.array(z.number())),
  /**
   * Share of FINISHED, uncancelled bookings carrying an attendance outcome.
   * `null` when no occurrence in the window has ended yet — a tab opened on a week
   * of future classes has nothing to have marked, which is not 0% coverage.
   */
  markedCoverage: z.number().nullable(),
});
export type DashboardClassesResponse = z.infer<typeof dashboardClassesResponseSchema>;
