// @fit/types — staff-console dashboard contracts (inferred types).
//
// Two shapes cross the wire for the admin console's landing dashboard:
//
//   • `GET /dashboard/stats`    — the original headline-count snapshot (T4.10) the
//     KPI widgets and other code still consume; kept unchanged.
//   • `GET /dashboard/overview` — the richer "control room" overview the FormaCore
//     reference dashboard renders: live in-gym occupancy, today's revenue /
//     check-ins / new-member KPIs, a range-windowed revenue series, the live plan
//     mix, today's class schedule, real-event alerts, and the live check-in feed.
//
// Every figure the overview returns is computed from a REAL tenant-scoped query
// over rows that already exist (payments, check-ins, subscriptions, class
// instances, locations, members) — there are no fabricated numbers. Where a gym
// has no rows for a section the API returns an honest empty array / zero and the
// UI shows an empty state rather than inventing a value.
//
// Money is carried the same way the order/billing/analytics contracts carry it —
// an integer in the currency's MINOR units (cents/tetri) — so no float rounding
// crosses the wire; the client formats with `Intl.NumberFormat` against `currency`.

import { z } from 'zod';
import { analyticsPointSchema } from './analytics';
import { checkInMethodSchema } from './check-in';

/* -------------------------------------------------------------------------- */
/*  GET /dashboard/stats  (unchanged, T4.10)                                    */
/* -------------------------------------------------------------------------- */

/**
 * The headline count pair for one entity on the dashboard: `active` is the
 * primary figure each widget leads with (the gym's current roster / catalogue),
 * `total` is the all-statuses count shown as context beside it. `total >= active`
 * always (an inactive record still counts toward the total).
 */
export interface DashboardStat {
  /** Records in the live/active lifecycle state (the widget's headline number). */
  active: number;
  /** All records regardless of status (active + suspended/inactive). */
  total: number;
}

/**
 * Successful `GET /dashboard/stats` response — one live snapshot of the gym's
 * headline counts, one {@link DashboardStat} per entity the basic dashboard
 * surfaces. Every figure is scoped to the caller's gym server-side; the widgets
 * render `active` large with `total` as the sub-label.
 */
export interface DashboardStatsResponse {
  /** Gym members (the `MEMBER`-role roster) — active vs. all statuses. */
  members: DashboardStat;
  /** Trainer profiles — active (rostered) vs. all. */
  trainers: DashboardStat;
  /** Locations (branches) — active (bookable) vs. all. */
  locations: DashboardStat;
  /** Retail products — active (sellable) vs. all. */
  products: DashboardStat;
}

/* -------------------------------------------------------------------------- */
/*  GET /dashboard/overview                                                     */
/* -------------------------------------------------------------------------- */

/** The reporting window the overview's revenue series is bucketed over. */
export const dashboardRangeSchema = z.enum(['7d', '30d', '12w']);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;

/** The default window when the query omits `range` — the reference's "7d". */
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = '7d';

/** `GET /dashboard/overview?range=` query — coerced + validated by the same schema. */
export const dashboardOverviewQuerySchema = z.object({
  range: dashboardRangeSchema.default(DEFAULT_DASHBOARD_RANGE),
});
export type DashboardOverviewQuery = z.infer<typeof dashboardOverviewQuerySchema>;

/**
 * The signed-in staff member the console chrome greets by name — resolved from the
 * caller's own `GymMember` + `User`, so it is always real. `name` falls back to the
 * email's local part when the account has no display name.
 */
export const dashboardViewerSchema = z.object({
  name: z.string(),
  email: z.string(),
  role: z.string(),
});
export type DashboardViewer = z.infer<typeof dashboardViewerSchema>;

/** One area (a real active {@link Location}) with its live occupancy today. */
export const dashboardAreaSchema = z.object({
  /** The location's name — the area label. */
  name: z.string(),
  /** The location's configured capacity (0 when unset). */
  capacity: z.number().int().nonnegative(),
  /** Today's check-ins carrying this location's id (0 is a valid quiet area). */
  occupancy: z.number().int().nonnegative(),
});
export type DashboardArea = z.infer<typeof dashboardAreaSchema>;

/** The "in the gym now" live occupancy card, from today's real check-ins. */
export const dashboardInGymNowSchema = z.object({
  /** Distinct members with a check-in today (no checkout event exists yet). */
  current: z.number().int().nonnegative(),
  /** SUM of active locations' capacities — the gym's total headroom. */
  capacity: z.number().int().nonnegative(),
  /** Per active location: its capacity + today's check-ins there. */
  areas: z.array(dashboardAreaSchema),
});
export type DashboardInGymNow = z.infer<typeof dashboardInGymNowSchema>;

/**
 * One headline KPI on the overview: a live `value` plus an optional
 * period-over-period `deltaPct` (today vs. yesterday, or this 7d vs. the prior
 * 7d). `deltaPct` is `null` when there is no prior baseline, so the UI hides the
 * trend chip rather than showing a misleading `0%` / `∞`.
 */
export const dashboardKpiSchema = z.object({
  /** The metric's value (money is MINOR units; counts are whole numbers). */
  value: z.number(),
  /** Percent change vs. the comparison window, or `null` when incomparable. */
  deltaPct: z.number().nullable(),
});
export type DashboardKpi = z.infer<typeof dashboardKpiSchema>;

/** The three headline KPI cards on the overview. */
export const dashboardKpisSchema = z.object({
  /** Captured revenue today (MINOR units), delta vs. yesterday. */
  todaysRevenue: dashboardKpiSchema,
  /** Check-ins recorded today, delta vs. yesterday. */
  checkInsToday: dashboardKpiSchema,
  /** New `MEMBER`-role members joined in the last 7 days, delta vs. the prior 7. */
  newMembers7d: dashboardKpiSchema,
});
export type DashboardKpis = z.infer<typeof dashboardKpisSchema>;

/** The revenue area chart's series + its window total (all in MINOR units). */
export const dashboardRevenueSchema = z.object({
  /** The resolved window the series was bucketed over. */
  range: dashboardRangeSchema,
  /** One point per bucket (day for 7d/30d, week for 12w). */
  series: z.array(analyticsPointSchema),
  /** SUM of the series — the window's captured revenue (MINOR units). */
  total: z.number().int().nonnegative(),
});
export type DashboardRevenue = z.infer<typeof dashboardRevenueSchema>;

/** One plan in the live plan-mix stacked bar. */
export const dashboardPlanSliceSchema = z.object({
  /** Catalogue plan id, or `null` for subscriptions whose plan was deleted. */
  planId: z.string().nullable(),
  /** Plan name for the legend (`"No plan"` when unattributed). */
  name: z.string(),
  /** Live subscribers on this plan. */
  count: z.number().int().nonnegative(),
  /** A hex colour for the stacked bar, when the plan carries one. */
  color: z.string().nullable(),
});
export type DashboardPlanSlice = z.infer<typeof dashboardPlanSliceSchema>;

/** The plan-mix card: a paid-members total + one slice per live plan. */
export const dashboardPlanMixSchema = z.object({
  /** Total live (paid) subscriptions across all plans. */
  total: z.number().int().nonnegative(),
  /** One slice per plan, richest first. */
  plans: z.array(dashboardPlanSliceSchema),
});
export type DashboardPlanMix = z.infer<typeof dashboardPlanMixSchema>;

/** One row of today's class schedule. */
export const dashboardScheduleRowSchema = z.object({
  /** The occurrence's start as an ISO-8601 instant (client formats the time). */
  startsAt: z.string(),
  /** The class title (from its template). */
  title: z.string(),
  /** The leading trainer's name, or `null` when the class has none. */
  trainerName: z.string().nullable(),
  /** Confirmed + attended bookings on the occurrence. */
  booked: z.number().int().nonnegative(),
  /** The occurrence's capacity (`capacityOverride ?? template.capacity`). */
  capacity: z.number().int().nonnegative(),
  /** The class template's accent colour, for the row marker. */
  color: z.string().nullable(),
});
export type DashboardScheduleRow = z.infer<typeof dashboardScheduleRowSchema>;

/** The kind of a dashboard alert, driving its icon/tone. */
export const dashboardAlertKindSchema = z.enum(['payment', 'class_full', 'payment_failed']);
export type DashboardAlertKind = z.infer<typeof dashboardAlertKindSchema>;

/**
 * One alert row, derived from a REAL event (never fabricated). A kind with no
 * matching event is simply omitted from the list.
 */
export const dashboardAlertSchema = z.object({
  kind: dashboardAlertKindSchema,
  /** Short headline (e.g. "Payment received", "Spin Express is 92% full"). */
  title: z.string(),
  /** Secondary detail (e.g. the amount, the class fill, "Card declined"). */
  detail: z.string(),
  /** When the event happened, ISO-8601. */
  at: z.string(),
});
export type DashboardAlert = z.infer<typeof dashboardAlertSchema>;

/** One row of the live recent-check-ins feed. */
export const dashboardCheckInSchema = z.object({
  /** The member's display name (or email when unnamed). */
  name: z.string(),
  /** The member's current subscription plan name, or `null`. */
  planName: z.string().nullable(),
  /** How the arrival was recorded. */
  method: checkInMethodSchema,
  /** When they checked in, ISO-8601 (client renders "time ago"). */
  checkedInAt: z.string(),
});
export type DashboardCheckIn = z.infer<typeof dashboardCheckInSchema>;

/**
 * Successful `GET /dashboard/overview` response — the FormaCore control-room
 * dashboard. Every section is scoped to the caller's gym server-side and computed
 * from real rows; empty arrays and zeroed KPIs are honest "no data yet" signals
 * the UI renders as empty states.
 */
export const dashboardOverviewResponseSchema = z.object({
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  /** The signed-in staff member (name/email/role), for the greeting + user card. */
  viewer: dashboardViewerSchema,
  /** The gym's display name (real, from the `Gym` row). */
  gymName: z.string(),
  /** The live "in the gym now" occupancy card. */
  inGymNow: dashboardInGymNowSchema,
  /** Today's three headline KPI cards. */
  kpis: dashboardKpisSchema,
  /** The range-windowed revenue area chart series + total. */
  revenue: dashboardRevenueSchema,
  /** The live plan-mix breakdown. */
  planMix: dashboardPlanMixSchema,
  /** Today's class schedule, earliest first. */
  todaysSchedule: z.array(dashboardScheduleRowSchema),
  /** Real-event alerts, newest first (capped ~5). */
  alerts: z.array(dashboardAlertSchema),
  /** The live recent-check-ins feed (top ~6, newest first). */
  recentCheckIns: z.array(dashboardCheckInSchema),
});
export type DashboardOverviewResponse = z.infer<typeof dashboardOverviewResponseSchema>;
