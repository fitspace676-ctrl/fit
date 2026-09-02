// @fit/types — the hand-built Sales dashboard tab's contract (Zod schemas).
//
// The Sales tab is not a widget grid: it is a purpose-built view with two
// controls that recompute every card on it. This module is the whole wire
// surface for `GET /dashboard/sales`.
//
// Money is an integer in the currency's MINOR units (cents/tetri) throughout,
// like every other admin contract. Display labels for channels, methods and
// product types are deliberately NOT on the wire — they are i18n keys resolved
// client-side, so the API stays locale-free like the segment contracts.
//
// Every figure the response carries is a REAL aggregation over rows that exist
// today (same honesty contract as `./analytics` and `./reports-drilldown`); an
// empty breakdown is an honest "nothing happened in this window", never a
// fabricated zero. Time SERIES are the exception and are densely zero-filled:
// a bucket with no sales is a real zero, and omitting it would misdraw the
// trend.

import { z } from 'zod';
import { reportSeriesPointSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Query                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * How the tab's trends are bucketed. Deliberately ONE value rather than a
 * separate window and bucket: the two can never be set to a nonsensical pair
 * (monthly buckets over seven days) because the pairing lives in
 * {@link SALES_GRANULARITY_RANGE}.
 */
export const SALES_GRANULARITIES = ['daily', 'weekly', 'monthly'] as const;
export const salesGranularitySchema = z.enum(SALES_GRANULARITIES);
export type SalesGranularity = z.infer<typeof salesGranularitySchema>;

/** The granularity a query without one lands on. */
export const DEFAULT_SALES_GRANULARITY: SalesGranularity = 'daily';

/**
 * The existing report range each granularity resolves to, so the API writes no
 * new window or bucket math — `resolveWindow` remains the single source of truth
 * for where a bucket starts.
 */
export const SALES_GRANULARITY_RANGE: Record<SalesGranularity, '30d' | '12w' | '12m'> = {
  daily: '30d',
  weekly: '12w',
  monthly: '12m',
};

/**
 * What kind of sale the tab is narrowed to. Derived at read time from the
 * order's shape — no stored column, no backfill:
 *   • `memberships`   — the order names a `PackagePlan` and minted no credit pack.
 *   • `session-packs` — the order minted a `CreditPack` (a class / PT session pass).
 *   • `retail`        — everything else: the POS till and the online shop.
 *
 * Classes and PT sessions are NOT separable: both are sold as the same credit
 * pack, `PackagePlan` carries no kind discriminator, and a `PtSession` has no
 * price or order of its own. `session-packs` is labelled to say so rather than
 * offering a filter the data cannot answer.
 */
export const SALES_PRODUCT_TYPES = ['all', 'memberships', 'session-packs', 'retail'] as const;
export const salesProductTypeSchema = z.enum(SALES_PRODUCT_TYPES);
export type SalesProductType = z.infer<typeof salesProductTypeSchema>;

/** The filter a query without one lands on. */
export const DEFAULT_SALES_PRODUCT_TYPE: SalesProductType = 'all';

/**
 * `GET /dashboard/sales?granularity=&productType=` query. `.catch` (not
 * `.default`) so a hand-edited URL lands on the default rather than a 400 — the
 * same forgiving rule the overview query already applies.
 */
export const dashboardSalesQuerySchema = z.object({
  granularity: salesGranularitySchema.catch(DEFAULT_SALES_GRANULARITY),
  productType: salesProductTypeSchema.catch(DEFAULT_SALES_PRODUCT_TYPE),
});
export type DashboardSalesQuery = z.infer<typeof dashboardSalesQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Response pieces                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The channel a sale was settled through, from `Payment.provider`: the POS till
 * stamps `"pos"`, the online wizard and shop stamp `"stub"` (a real gateway key
 * once T8.8 lands). The same rule the admin order roster already keys off.
 */
export const salesChannelSchema = z.enum(['pos', 'online']);
export type SalesChannel = z.infer<typeof salesChannelSchema>;

/** How a sale was settled — the wire form of the `PaymentMethod` enum. */
export const salesPaymentMethodSchema = z.enum(['cash', 'card', 'bank-transfer', 'member-account']);
export type SalesPaymentMethod = z.infer<typeof salesPaymentMethodSchema>;

/**
 * One bucket of the sales-vs-refunds trend. `sales` is gross taken in the bucket;
 * `refunds` is money returned in the bucket, dated by the refund's OWN timestamp
 * rather than the sale's — see the service for why the two can legitimately
 * disagree with the refunded KPI.
 */
export const salesComparisonPointSchema = z.object({
  /** Bucket start, `YYYY-MM-DD`. */
  label: z.string(),
  sales: z.number(),
  refunds: z.number(),
});
export type SalesComparisonPoint = z.infer<typeof salesComparisonPointSchema>;

/** One bar of the payment breakdown — a channel × method combination that occurred. */
export const salesMethodSliceSchema = z.object({
  channel: salesChannelSchema,
  method: salesPaymentMethodSchema,
  /** Net takings on this combination, MINOR units. */
  value: z.number(),
});
export type SalesMethodSlice = z.infer<typeof salesMethodSliceSchema>;

/** One row of the ranked top-sellers list. */
export const salesTopSellerSchema = z.object({
  /** The order line's label, snapshotted at sale time. */
  label: z.string(),
  /** Distinct orders this line appeared on. */
  orders: z.number(),
  /** Summed line value, MINOR units. */
  value: z.number(),
});
export type SalesTopSeller = z.infer<typeof salesTopSellerSchema>;

/** How many rows the ranked top-sellers list carries. */
export const SALES_TOP_SELLERS_LIMIT = 8;

/**
 * The tab's three headline figures. All MINOR units. There is deliberately no
 * gross figure: the owner removed it (2026-09-02), and the gross-vs-refunds
 * chart already shows what net is net of.
 */
export const salesKpisSchema = z.object({
  netSales: z.number(),
  refunded: z.number(),
  avgSale: z.number(),
});
export type SalesKpis = z.infer<typeof salesKpisSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `GET /dashboard/sales` response — the whole tab in one round trip, so the two
 * controls never leave one card showing a different window from its neighbour.
 * Echoes the resolved query so the client can confirm what it is looking at.
 */
export const dashboardSalesResponseSchema = z.object({
  granularity: salesGranularitySchema,
  productType: salesProductTypeSchema,
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  kpis: salesKpisSchema,
  /** Net revenue per bucket — dense across the window. */
  revenueOverTime: z.array(reportSeriesPointSchema),
  /** Gross sales against refunds per bucket — dense across the window. */
  salesVsRefunds: z.array(salesComparisonPointSchema),
  /** Only combinations that actually occurred, descending by value. */
  byPaymentMethod: z.array(salesMethodSliceSchema),
  /** Descending by value, capped at {@link SALES_TOP_SELLERS_LIMIT}. */
  topSellers: z.array(salesTopSellerSchema),
});
export type DashboardSalesResponse = z.infer<typeof dashboardSalesResponseSchema>;
