// @fit/types — admin drill-down report contracts (Zod schemas + inferred types).
//
// The wire shape for the Reports drill-down framework (T12.12): a richer, chart-
// oriented view of an operational metric than the flat CSV/XLSX catalogue in
// `./reports`. Where a {@link ReportResult} is a single columns+rows table, a
// {@link ReportDrilldown} is a page: headline KPI tiles plus an ordered list of
// typed {@link ReportSection}s — a time-series trend, categorical breakdowns, an
// active/expired split, a peak-hours heatmap, a detailed table.
//
// The section union is the reusable framework: every drill-down report (and the
// remaining ones added in T12.13) is expressed as the same set of section kinds,
// so one client renderer maps each kind to an Astryx chart/table with no report-
// specific UI. Money is carried the same way the rest of the admin contracts do —
// an integer in the currency's MINOR units (cents/tetri) — and every figure is a
// REAL aggregation over rows that already exist (same honesty contract as
// `./analytics`); an empty section is an honest "no data in this window" signal,
// never a fabricated zero.

import { z } from 'zod';
import {
  DEFAULT_REPORT_RANGE,
  reportColumnTypeSchema,
  reportExportQuerySchema,
  reportQuerySchema,
  reportRangeSchema,
  type ReportRange,
} from './reports';

/* -------------------------------------------------------------------------- */
/*  Request                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The reporting window a drill-down is computed over — the Reports console's own
 * vocabulary ({@link reportRangeSchema}), so the hub and a drill-down offer the
 * same four choices and a `?range=` carries across the link between them.
 */
export const reportDrilldownRangeSchema = reportRangeSchema;
export type ReportDrilldownRange = ReportRange;

/** The default window when a drill-down query omits `range`. */
export const DEFAULT_REPORT_DRILLDOWN_RANGE: ReportDrilldownRange = DEFAULT_REPORT_RANGE;

/**
 * The drill-down report metrics. Stable, URL-safe slugs used as the
 * `/reports/[metric]` path segment and the `:metric` API path segment:
 *   • `revenue`    — captured takings: over time, by plan, by location, monthly.
 *   • `members`    — new members over time, active vs expired, churn, monthly.
 *   • `attendance` — check-ins over time, peak-hours heatmap, daily breakdown.
 *   • `classes`    — most popular classes, attendance split, cancellation trend, detail.
 *   • `staff`      — classes taught / attendance rate / sessions booked per trainer, detail.
 *   • `pos`        — daily sales, sales by method, product breakdown, end-of-day summaries.
 *   • `loyalty`    — points issued over time, issued vs redeemed, by reward type, recent.
 *
 * The first three shipped in T12.12; T12.13 adds the last five on the same section
 * framework, so the enum is the single place a new drill-down registers.
 */
export const REPORT_METRICS = [
  'sales',
  'revenue',
  'members',
  'attendance',
  'classes',
  'staff',
  'pos',
  'loyalty',
] as const;

/** A drill-down report metric — {@link REPORT_METRICS}. */
export const reportMetricSchema = z.enum(REPORT_METRICS);
export type ReportMetric = z.infer<typeof reportMetricSchema>;

/**
 * `GET /admin/reports/drilldown/:metric?range=&from=&to=` query — the catalogue's
 * own query schema, so a custom range is validated once and identically.
 */
export const reportDrilldownQuerySchema = reportQuerySchema;
export type ReportDrilldownQuery = z.infer<typeof reportDrilldownQuerySchema>;

/**
 * `GET /admin/reports/drilldown/:metric/export?range=&format=` query — the file
 * download. Reuses the catalogue's {@link reportFormatSchema} so a drill-down and a
 * catalogue report offer the same two formats under the same two names.
 */
export const reportDrilldownExportQuerySchema = reportExportQuerySchema;
export type ReportDrilldownExportQuery = z.infer<typeof reportDrilldownExportQuerySchema>;

/* -------------------------------------------------------------------------- */
/*  Metric catalogue                                                            */
/* -------------------------------------------------------------------------- */

/** A drill-down metric's static copy for the reports hub cards + page heading. */
export interface ReportMetricDefinition {
  metric: ReportMetric;
  name: string;
  description: string;
  /** The section ids this metric can surface, in render order — for pin labels. */
  sections: readonly string[];
}

/**
 * The drill-down catalogue: display copy + the section ids each metric renders,
 * the single source of truth the hub cards and the Pin-to-Dashboard picker read
 * so the section slugs the API emits and the labels the UI shows can never drift.
 */
export const REPORT_METRIC_DEFINITIONS: Record<ReportMetric, ReportMetricDefinition> = {
  sales: {
    metric: 'sales',
    name: 'Sales',
    description:
      'Net sales over time, the settlement mix, who sold what, top plans, and recent refunds.',
    // Section ids are globally unique across metrics (the pin picker keys widgets
    // on them), so these are named for the sales lens rather than reusing the
    // `pos` metric's `daily-sales` / `sales-by-method`.
    sections: [
      'net-sales-over-time',
      'sales-mix-by-method',
      'sales-by-seller',
      'top-selling-plans',
      'recent-refunds',
    ],
  },
  revenue: {
    metric: 'revenue',
    name: 'Revenue',
    description: 'Captured takings over time, by plan, by location, and month by month.',
    sections: ['revenue-over-time', 'revenue-by-plan', 'revenue-by-location', 'revenue-monthly'],
  },
  members: {
    metric: 'members',
    name: 'Members',
    description: 'New members over time, active vs expired, churn trend, and monthly growth.',
    sections: ['new-members-over-time', 'active-vs-expired', 'churn-rate-trend', 'members-monthly'],
  },
  attendance: {
    metric: 'attendance',
    name: 'Attendance',
    description: 'Check-ins over time, peak-hours heatmap, and the daily breakdown.',
    sections: ['checkins-over-time', 'peak-hours', 'attendance-daily'],
  },
  classes: {
    metric: 'classes',
    name: 'Classes',
    description:
      'Most popular classes, the attended / no-show / cancelled split, the cancellation-rate trend, and per-class performance.',
    sections: [
      'most-popular-classes',
      'attendance-distribution',
      'cancellation-rate-trend',
      'class-performance',
    ],
  },
  staff: {
    metric: 'staff',
    name: 'Staff',
    description:
      'Classes taught, attendance rate, and sessions booked per trainer, plus a per-trainer performance table.',
    sections: [
      'classes-taught-per-trainer',
      'attendance-rate-per-trainer',
      'sessions-booked-per-trainer',
      'staff-performance',
    ],
  },
  pos: {
    metric: 'pos',
    name: 'Point of sale',
    description:
      'Daily sales, takings by payment method, the product sales breakdown, and end-of-day summaries.',
    sections: ['daily-sales', 'sales-by-method', 'product-sales', 'end-of-day'],
  },
  loyalty: {
    metric: 'loyalty',
    name: 'Loyalty',
    description:
      'Points issued over time, issued vs redeemed, redemptions by reward type, and the most recent redemptions.',
    sections: [
      'points-issued-over-time',
      'points-issued-vs-redeemed',
      'redemptions-by-reward-type',
      'recent-redemptions',
    ],
  },
};

/** The catalogue as an ordered list, for the reports hub. */
export const REPORT_METRIC_CATALOG: ReportMetricDefinition[] = REPORT_METRICS.map(
  (metric) => REPORT_METRIC_DEFINITIONS[metric],
);

/* -------------------------------------------------------------------------- */
/*  Sections                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How a section's numeric values are formatted by the renderer: `money` cells are
 * MINOR-unit integers (formatted against the report `currency`), `percent` cells
 * are 0–100 numbers, `count` a plain integer.
 */
export const reportValueUnitSchema = z.enum(['money', 'count', 'percent']);
export type ReportValueUnit = z.infer<typeof reportValueUnitSchema>;

/** One point of a bucketed time series — a bucket label and its numeric value. */
export const reportSeriesPointSchema = z.object({
  /** Bucket label (e.g. `YYYY-MM-DD` day/week start, or `Jul`). */
  label: z.string(),
  /** The bucket's aggregated value (money is MINOR units, percent 0–100). */
  value: z.number(),
});
export type ReportSeriesPoint = z.infer<typeof reportSeriesPointSchema>;

/** One bar of a categorical breakdown — a label and its value. */
export const reportBreakdownItemSchema = z.object({
  label: z.string(),
  value: z.number(),
});
export type ReportBreakdownItem = z.infer<typeof reportBreakdownItemSchema>;

/** One slice of a two-or-three-way split (e.g. active vs expired). */
export const reportSplitSliceSchema = z.object({
  label: z.string(),
  value: z.number(),
  /** Semantic tone for the slice colour: positive (green), negative (red), neutral. */
  tone: z.enum(['positive', 'negative', 'neutral']),
});
export type ReportSplitSlice = z.infer<typeof reportSplitSliceSchema>;

/** A drill-down table column — reuses the report column-type vocabulary. */
export const reportDrilldownColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: reportColumnTypeSchema,
});
export type ReportDrilldownColumn = z.infer<typeof reportDrilldownColumnSchema>;

/** One drill-down table row — cell values keyed by column `key`. */
export const reportDrilldownRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]),
);
export type ReportDrilldownRow = z.infer<typeof reportDrilldownRowSchema>;

/** A time-series section, rendered as a brand area/line chart. */
export const reportSeriesSectionSchema = z.object({
  kind: z.literal('series'),
  id: z.string(),
  title: z.string(),
  unit: reportValueUnitSchema,
  points: z.array(reportSeriesPointSchema),
});

/** A categorical breakdown section, rendered as a horizontal bar chart. */
export const reportBreakdownSectionSchema = z.object({
  kind: z.literal('breakdown'),
  id: z.string(),
  title: z.string(),
  unit: reportValueUnitSchema,
  items: z.array(reportBreakdownItemSchema),
});

/** A split section (e.g. active vs expired), rendered as a donut + legend. */
export const reportSplitSectionSchema = z.object({
  kind: z.literal('split'),
  id: z.string(),
  title: z.string(),
  unit: reportValueUnitSchema,
  slices: z.array(reportSplitSliceSchema),
});

/** A heatmap section (e.g. peak hours), rendered as a tinted grid. */
export const reportHeatmapSectionSchema = z.object({
  kind: z.literal('heatmap'),
  id: z.string(),
  title: z.string(),
  /** Row labels (e.g. weekdays), top to bottom. */
  rowLabels: z.array(z.string()),
  /** Column labels (e.g. hours of the day), left to right. */
  colLabels: z.array(z.string()),
  /** `cells[row][col]` — the count for that (row, col); dense, gap-filled with 0. */
  cells: z.array(z.array(z.number())),
});

/** A detailed table section, rendered as a DataTable. */
export const reportTableSectionSchema = z.object({
  kind: z.literal('table'),
  id: z.string(),
  title: z.string(),
  columns: z.array(reportDrilldownColumnSchema),
  rows: z.array(reportDrilldownRowSchema),
});

/**
 * One section of a drill-down report — a discriminated union on `kind`. The client
 * renderer switches on `kind` to pick the Astryx chart/table; adding a new report
 * on this framework never touches the renderer, only produces these sections.
 */
export const reportSectionSchema = z.discriminatedUnion('kind', [
  reportSeriesSectionSchema,
  reportBreakdownSectionSchema,
  reportSplitSectionSchema,
  reportHeatmapSectionSchema,
  reportTableSectionSchema,
]);
export type ReportSection = z.infer<typeof reportSectionSchema>;
export type ReportSeriesSection = z.infer<typeof reportSeriesSectionSchema>;
export type ReportBreakdownSection = z.infer<typeof reportBreakdownSectionSchema>;
export type ReportSplitSection = z.infer<typeof reportSplitSectionSchema>;
export type ReportHeatmapSection = z.infer<typeof reportHeatmapSectionSchema>;
export type ReportTableSection = z.infer<typeof reportTableSectionSchema>;

/* -------------------------------------------------------------------------- */
/*  KPIs                                                                        */
/* -------------------------------------------------------------------------- */

/** One headline KPI tile at the top of a drill-down report. */
export const reportKpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** The metric's value (money is MINOR units, percent 0–100). */
  value: z.number(),
  unit: reportValueUnitSchema,
});
export type ReportKpi = z.infer<typeof reportKpiSchema>;

/* -------------------------------------------------------------------------- */
/*  Response                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Successful `GET /admin/reports/drilldown/:metric` response. Every section is
 * scoped to the caller's gym server-side and computed from real rows; empty
 * sections and zeroed KPIs are honest "no data yet" signals the UI renders as
 * empty states.
 */
export const reportDrilldownSchema = z.object({
  metric: reportMetricSchema,
  /** Display name for the page heading (from {@link REPORT_METRIC_DEFINITIONS}). */
  name: z.string(),
  /** One-line description for the page heading. */
  description: z.string(),
  /** The window the response was computed over (echoes the resolved query). */
  range: reportDrilldownRangeSchema,
  /** The first and last calendar day the window resolved to — see `ReportResult`. */
  from: z.string(),
  to: z.string(),
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  /** Headline KPI tiles, left to right. */
  kpis: z.array(reportKpiSchema),
  /** The report's sections, in render order. */
  sections: z.array(reportSectionSchema),
});
export type ReportDrilldown = z.infer<typeof reportDrilldownSchema>;
