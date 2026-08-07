// @fit/types — the hand-built Revenue dashboard tab's contract (Zod schemas).
//
// Sibling of `./dashboard-sales` and `./dashboard-members`. Where Sales answers
// "what did we sell?" and Members "who is still here?", this one answers the three
// money questions a subscription business runs on: what came in, what is owed, and
// what is coming.
//
// Money is an integer in the currency's MINOR units (tetri) throughout. Display
// labels are NOT on the wire: they are i18n keys resolved client-side, so the API
// stays locale-free like every sibling contract.
//
// Every figure is a REAL aggregation over rows that exist today. Time series are
// densely zero-filled — a day with no takings is a real zero. The one nullable
// figure is `byLocation`, and it is nullable for a reason no empty array could
// express: see its own comment.

import { z } from 'zod';
import { salesGranularitySchema } from './dashboard-sales';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately the SAME vocabulary and window
 * mapping as Sales and Members (`SALES_GRANULARITY_RANGE`), so a user who learns
 * one tab's time control has learned all three.
 */
export const revenueGranularitySchema = salesGranularitySchema;
export type RevenueGranularity = z.infer<typeof revenueGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_REVENUE_GRANULARITY: RevenueGranularity = 'daily';

/**
 * How far AHEAD the projection reaches, in days. A string enum rather than a
 * number so it round-trips through a URL query and a `SegmentedControl` value
 * without coercion at either end — the same shape as the Members tab's windows.
 */
export const projectionWindowSchema = z.enum(['7', '30']);
export type ProjectionWindow = z.infer<typeof projectionWindowSchema>;

/** The projection window a query without one lands on. */
export const DEFAULT_PROJECTION_WINDOW: ProjectionWindow = '7';

/**
 * Days each projection window covers. Exported so the API and the caption read the
 * same number rather than each parsing the enum's string.
 */
export const PROJECTION_WINDOW_DAYS: Record<ProjectionWindow, number> = { '7': 7, '30': 30 };

/**
 * `GET /dashboard/revenue?granularity=&projectionWindow=` query. `.catch` (not
 * `.default`) so a hand-edited URL lands on the default rather than a 400.
 */
export const dashboardRevenueQuerySchema = z.object({
  granularity: revenueGranularitySchema.catch(DEFAULT_REVENUE_GRANULARITY),
  projectionWindow: projectionWindowSchema.catch(DEFAULT_PROJECTION_WINDOW),
});
export type DashboardRevenueQuery = z.infer<typeof dashboardRevenueQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One bucket of the revenue trend, split by stream.
 *
 * The two are disjoint by construction: `recurring` counts subscription invoices
 * (`orderId: null`) and `oneOff` counts captured order payments, so no money
 * movement lands in both. Kept as two numbers rather than one total because they
 * move for different reasons and are fixed by different actions.
 */
export const revenueStreamPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  /** Subscription charges settled in this bucket. */
  recurring: z.number(),
  /** Till, shop and session-pack takings, net of refunds. */
  oneOff: z.number(),
});
export type RevenueStreamPoint = z.infer<typeof revenueStreamPointSchema>;

/**
 * The tab's four headline figures, all in MINOR units.
 *
 * Two are windowed and two are not, which the strip's caption states rather than
 * leaving to be inferred: `totalRevenue` and `revenuePerMember` describe the
 * selected window, while `mrr` and `outstandingTotal` describe right now. A debt
 * does not stop being owed because the chart is showing last week.
 */
export const revenueKpisSchema = z.object({
  totalRevenue: z.number(),
  mrr: z.number(),
  revenuePerMember: z.number(),
  outstandingTotal: z.number(),
});
export type RevenueKpis = z.infer<typeof revenueKpisSchema>;

/**
 * Unsettled invoices, gym-wide. `overdue*` is the subset past its stated
 * `dueDate`; `failed*` is the subset whose charge was declined. They OVERLAP — a
 * failed charge can also be overdue — and are broken out because they need
 * different responses: one is chased, the other retried.
 */
export const outstandingInvoicesSchema = z.object({
  count: z.number(),
  total: z.number(),
  overdueCount: z.number(),
  overdueTotal: z.number(),
  failedCount: z.number(),
  failedTotal: z.number(),
});
export type OutstandingInvoices = z.infer<typeof outstandingInvoicesSchema>;

/**
 * Charges already scheduled by an existing subscription's own billing date. Not a
 * forecast: no growth model, no churn adjustment. `atRisk*` is the `PAST_DUE`
 * population — deliberately NOT part of `total`, because that money is late rather
 * than upcoming, and reported beside it because "what is coming in" is only honest
 * next to what is being chased.
 */
export const projectedRevenueSchema = z.object({
  total: z.number(),
  /** One point per day of the window — dense. */
  points: z.array(reportSeriesPointSchema),
  atRiskCount: z.number(),
  atRiskTotal: z.number(),
});
export type ProjectedRevenue = z.infer<typeof projectedRevenueSchema>;

/** One row of the location breakdown. */
export const revenueLocationSliceSchema = z.object({
  location: z.string(),
  value: z.number(),
});
export type RevenueLocationSlice = z.infer<typeof revenueLocationSliceSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/revenue` response — the whole tab in one round trip, so its two
 * controls never leave one card describing a different window from its neighbour.
 * Echoes the resolved query so the client can confirm what it is looking at.
 */
export const dashboardRevenueResponseSchema = z.object({
  granularity: revenueGranularitySchema,
  projectionWindow: projectionWindowSchema,
  /** ISO-4217 currency every money figure here is denominated in. */
  currency: z.string(),
  kpis: revenueKpisSchema,
  /** Net takings per bucket, split by stream — dense. */
  revenueOverTime: z.array(revenueStreamPointSchema),
  /** Monthly value of the paid base at each bucket's start — dense. */
  mrrOverTime: z.array(reportSeriesPointSchema),
  projected: projectedRevenueSchema,
  outstanding: outstandingInvoicesSchema,
  /**
   * `null` means the gym has fewer than two active locations — the question does
   * not apply, and the client drops the card rather than rendering an empty one.
   * An empty ARRAY is the different fact "multi-location, no revenue in window".
   */
  byLocation: z.array(revenueLocationSliceSchema).nullable(),
});
export type DashboardRevenueResponse = z.infer<typeof dashboardRevenueResponseSchema>;
