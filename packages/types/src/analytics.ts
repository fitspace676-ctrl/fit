// @fit/types — admin analytics contracts (Zod schemas + inferred types).
//
// The wire shape for the admin console's Analytics screen: the tenant-scoped,
// range-windowed aggregations the charts render. Every figure the API returns is
// computed from a REAL tenant-scoped query over data that already exists in the
// schema — there are no fabricated numbers. Where the schema carries no source
// for a metric yet, the API returns an honest empty array / zero and the UI shows
// an empty state rather than inventing a value.
//
// Money is carried the same way the order/billing contracts carry it — an integer
// in the currency's MINOR units (cents/tetri) — so no float rounding crosses the
// wire; the client formats with `Intl.NumberFormat` against `currency`.
//
// What is backed by a real query, and by which model:
//   • KPIs.revenue        — SUM(Payment.amount) WHERE status = CAPTURED, in-range.
//   • KPIs.activeMembers  — COUNT(GymMember) role = MEMBER, status = ACTIVE (snapshot);
//                           delta = new members joined this window vs the previous one.
//   • KPIs.attendanceRate — ATTENDED / (ATTENDED + NO_SHOW) bookings on class
//                           instances that started in-range.
//   • KPIs.churn          — Subscriptions moved to CANCELED/EXPIRED in-range over the
//                           live subscriptions at the window's start.
//   • revenueSeries       — captured Payment.amount bucketed by day/week/month.
//   • channelMix          — captured Payment.amount split by sales channel
//                           (POS vs ONLINE, derived from the payment provider key).
//   • planMix             — live subscriptions grouped by their catalogue plan.
//   • topClasses          — bookings (and their attributed order-less count) grouped
//                           by class template, ranked by booking volume.
//
// Deliberately OMITTED (no real source in the schema yet, so NOT faked):
//   • A dedicated "subscription revenue" channel — subscription renewals are billed
//     by a stubbed provider (T8.x) that writes NO Payment rows, so there is no
//     captured-cash source to aggregate. channelMix therefore reports only the
//     channels that have real Payment rows (POS / ONLINE). Adding subscription cash
//     here would be a fabricated figure, so it is left out until recurring billing
//     records payments.

import { z } from 'zod';
import { orderChannelSchema } from './orders-admin';

/* -------------------------------------------------------------------------- */
/*  Request                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The reporting window the whole response is computed over. Each value fixes both
 * the span and the bucket granularity of the {@link AnalyticsPoint} series:
 *   • `7d`  — the last 7 days,   bucketed per day.
 *   • `30d` — the last 30 days,  bucketed per day.
 *   • `12w` — the last 12 weeks, bucketed per (ISO) week.
 *   • `12m` — the last 12 months, bucketed per calendar month.
 */
export const analyticsRangeSchema = z.enum(['7d', '30d', '12w', '12m']);
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

/** The default window when the query omits `range`. */
export const DEFAULT_ANALYTICS_RANGE: AnalyticsRange = '30d';

/** `GET /admin/analytics?range=` query — coerced + validated by the same schema. */
export const analyticsQuerySchema = z.object({
  range: analyticsRangeSchema.default(DEFAULT_ANALYTICS_RANGE),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  KPIs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * One headline KPI: the live `value` plus an optional period-over-period
 * `deltaPct` (this window vs. the immediately preceding one of equal length).
 * `deltaPct` is `null` when a prior baseline is unavailable (e.g. the previous
 * window had no data to compare against), so the UI hides the trend chip rather
 * than showing a misleading `0%` or `∞`.
 */
export const analyticsKpiSchema = z.object({
  /** The metric's value for the window. Money is MINOR units; rates are 0–100. */
  value: z.number(),
  /** Percent change vs. the previous equal window, or `null` when incomparable. */
  deltaPct: z.number().nullable(),
});
export type AnalyticsKpi = z.infer<typeof analyticsKpiSchema>;

/** The four headline KPI cards. */
export const analyticsKpisSchema = z.object({
  /** Captured revenue in the window, in the gym currency's MINOR units. */
  revenue: analyticsKpiSchema,
  /** Active members (role MEMBER, status ACTIVE) — a live snapshot count. */
  activeMembers: analyticsKpiSchema,
  /** Class attendance rate as a percentage (0–100), attended / attended+no-show. */
  attendanceRate: analyticsKpiSchema,
  /** Subscription churn rate as a percentage (0–100) over the window. */
  churn: analyticsKpiSchema,
});
export type AnalyticsKpis = z.infer<typeof analyticsKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Series + breakdowns                                                         */
/* -------------------------------------------------------------------------- */

/** One point of a bucketed time series: an ISO date label and its numeric value. */
export const analyticsPointSchema = z.object({
  /** Bucket start as `YYYY-MM-DD` (day/week start) — the x-axis key. */
  date: z.string(),
  /** The bucket's aggregated value (revenue is MINOR units). */
  value: z.number(),
});
export type AnalyticsPoint = z.infer<typeof analyticsPointSchema>;

/** One slice of the sales-channel revenue split. */
export const analyticsChannelSliceSchema = z.object({
  channel: orderChannelSchema,
  /** Captured revenue attributed to the channel, in MINOR units. */
  amount: z.number(),
});
export type AnalyticsChannelSlice = z.infer<typeof analyticsChannelSliceSchema>;

/** One bar of the subscriber-per-plan breakdown. */
export const analyticsPlanSliceSchema = z.object({
  /** Catalogue plan id, or `null` for subscriptions whose plan was deleted. */
  planId: z.string().nullable(),
  /** Plan name snapshot for the label; `"No plan"` when unattributed. */
  name: z.string(),
  /** Live subscribers on this plan. */
  subscribers: z.number().int().nonnegative(),
});
export type AnalyticsPlanSlice = z.infer<typeof analyticsPlanSliceSchema>;

/** One row of the top-classes-by-bookings list. */
export const analyticsTopClassSchema = z.object({
  /** Class template id the bookings roll up to. */
  templateId: z.string(),
  /** Class template title for the label. */
  title: z.string(),
  /** Confirmed/attended bookings on the template's in-range instances. */
  bookings: z.number().int().nonnegative(),
});
export type AnalyticsTopClass = z.infer<typeof analyticsTopClassSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Successful `GET /admin/analytics` response. Every section is scoped to the
 * caller's gym server-side and computed from real rows; empty arrays and zeroed
 * KPIs are honest "no data yet" signals the UI renders as empty states.
 */
export const adminAnalyticsResponseSchema = z.object({
  /** The window the response was computed over (echoes the resolved query). */
  range: analyticsRangeSchema,
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  /** The four headline KPI cards. */
  kpis: analyticsKpisSchema,
  /** Captured revenue over the window, one point per bucket. */
  revenueSeries: z.array(analyticsPointSchema),
  /** Captured revenue split by sales channel (POS / ONLINE). */
  channelMix: z.array(analyticsChannelSliceSchema),
  /** Live subscribers grouped by their catalogue plan, richest first. */
  planMix: z.array(analyticsPlanSliceSchema),
  /** Most-booked classes over the window, most bookings first. */
  topClasses: z.array(analyticsTopClassSchema),
});
export type AdminAnalyticsResponse = z.infer<typeof adminAnalyticsResponseSchema>;
