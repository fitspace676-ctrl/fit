// @fit/types — segmented admin dashboard contracts (Zod schemas + catalogue).
//
// The dashboard is organised into business SEGMENTS, each showing a set of
// WIDGETS. A widget is deliberately not a new kind of thing: it is a named
// reference to a section of an existing drill-down report
// ({@link REPORT_METRIC_DEFINITIONS}), so the aggregation that fills it and the
// renderer that draws it both already exist. Adding a widget later means adding
// a section to a drill-down report and one entry here; adding a segment means
// one entry in {@link CONFIGURABLE_DASHBOARD_SEGMENTS}. Neither restructures the
// dashboard, which is the whole point of the indirection.
//
// `overview` is the exception: it is the hand-built control-room landing (live
// occupancy, KPI tiles, alerts, recent activity) and carries no catalogue.

import { z } from 'zod';
import { dashboardRangeSchema } from './dashboard';
import { reportSectionSchema, type ReportMetric } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Segments                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The segments whose widget set a gym can choose. Extend this list to add a
 * segment (e.g. `leads` once CRM ships) — no migration, because the stored rows
 * carry the segment as a plain string.
 */
export const CONFIGURABLE_DASHBOARD_SEGMENTS = [
  'sales',
  'members',
  'revenue',
  'classes',
  'staff',
] as const;

export const configurableDashboardSegmentSchema = z.enum(CONFIGURABLE_DASHBOARD_SEGMENTS);
export type ConfigurableDashboardSegment = z.infer<typeof configurableDashboardSegmentSchema>;

/** Every dashboard tab, in display order — `overview` first, then the configurable ones. */
export const DASHBOARD_SEGMENTS = ['overview', ...CONFIGURABLE_DASHBOARD_SEGMENTS] as const;

export const dashboardSegmentSchema = z.enum(DASHBOARD_SEGMENTS);
export type DashboardSegment = z.infer<typeof dashboardSegmentSchema>;

/** The tab shown when `?segment=` is absent or unrecognised. */
export const DEFAULT_DASHBOARD_SEGMENT: DashboardSegment = 'overview';

/* -------------------------------------------------------------------------- */
/*  Widget catalogue                                                            */
/* -------------------------------------------------------------------------- */

/** How wide a widget renders: `sm` one column, `md` two, `lg` the full row. */
export const dashboardWidgetSizeSchema = z.enum(['sm', 'md', 'lg']);
export type DashboardWidgetSize = z.infer<typeof dashboardWidgetSizeSchema>;

/** One catalogue entry — the static definition of a widget the picker can offer. */
export interface DashboardWidgetDefinition {
  /** Stable slug, `<segment>.<name>`. Persisted in `DashboardWidget.widgetKey`; never renamed in place. */
  key: string;
  segment: ConfigurableDashboardSegment;
  /** The drill-down section this widget renders. */
  source: { metric: ReportMetric; section: string };
  size: DashboardWidgetSize;
  /** Flat i18n key under `admin.dashboard.widgets`. */
  labelKey: string;
}

/**
 * The widget catalogue. Every entry names a section that exists today and
 * returns real rows; widgets needing new aggregations arrive in the per-segment
 * follow-up specs, each as one new section plus one entry here.
 */
export const DASHBOARD_WIDGET_CATALOG: readonly DashboardWidgetDefinition[] = [
  // Sales
  {
    key: 'sales.payment-method',
    segment: 'sales',
    source: { metric: 'pos', section: 'sales-by-method' },
    size: 'md',
    labelKey: 'salesPaymentMethod',
  },
  {
    key: 'sales.top-products',
    segment: 'sales',
    source: { metric: 'pos', section: 'product-sales' },
    size: 'md',
    labelKey: 'salesTopProducts',
  },
  {
    key: 'sales.top-plans',
    segment: 'sales',
    source: { metric: 'revenue', section: 'revenue-by-plan' },
    size: 'md',
    labelKey: 'salesTopPlans',
  },
  // Members
  {
    key: 'members.new-signups',
    segment: 'members',
    source: { metric: 'members', section: 'new-members-over-time' },
    size: 'lg',
    labelKey: 'membersNewSignups',
  },
  {
    key: 'members.churn',
    segment: 'members',
    source: { metric: 'members', section: 'churn-rate-trend' },
    size: 'lg',
    labelKey: 'membersChurn',
  },
  // Revenue
  {
    key: 'revenue.over-time',
    segment: 'revenue',
    source: { metric: 'revenue', section: 'revenue-over-time' },
    size: 'lg',
    labelKey: 'revenueOverTime',
  },
  {
    key: 'revenue.by-location',
    segment: 'revenue',
    source: { metric: 'revenue', section: 'revenue-by-location' },
    size: 'md',
    labelKey: 'revenueByLocation',
  },
  // Classes & training
  {
    key: 'classes.most-booked',
    segment: 'classes',
    source: { metric: 'classes', section: 'most-popular-classes' },
    size: 'md',
    labelKey: 'classesMostBooked',
  },
  {
    key: 'classes.peak-hours',
    segment: 'classes',
    source: { metric: 'attendance', section: 'peak-hours' },
    size: 'lg',
    labelKey: 'classesPeakHours',
  },
  // Trainers & staff
  {
    key: 'staff.sessions-per-trainer',
    segment: 'staff',
    source: { metric: 'staff', section: 'sessions-booked-per-trainer' },
    size: 'md',
    labelKey: 'staffSessionsPerTrainer',
  },
];

/** The catalogue entries for one segment, in catalogue order — also the default selection. */
export function widgetsForSegment(
  segment: ConfigurableDashboardSegment,
): DashboardWidgetDefinition[] {
  return DASHBOARD_WIDGET_CATALOG.filter((widget) => widget.segment === segment);
}

/** Look a widget up by its stored key. `undefined` for a key the catalogue no longer defines. */
export function findDashboardWidget(key: string): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGET_CATALOG.find((widget) => widget.key === key);
}

/* -------------------------------------------------------------------------- */
/*  Wire shapes                                                                 */
/* -------------------------------------------------------------------------- */

/** One widget resolved to its live section data. */
export const resolvedDashboardWidgetSchema = z.object({
  key: z.string(),
  size: dashboardWidgetSizeSchema,
  section: reportSectionSchema,
});
export type ResolvedDashboardWidget = z.infer<typeof resolvedDashboardWidgetSchema>;

/**
 * `GET /admin/dashboard/segments/:segment?range=` response. A widget whose
 * section no longer resolves is omitted rather than returned broken, so the list
 * can be shorter than the gym's stored selection.
 */
export const dashboardSegmentResponseSchema = z.object({
  segment: configurableDashboardSegmentSchema,
  range: dashboardRangeSchema,
  /** ISO-4217 currency the money figures are denominated in. */
  currency: z.string(),
  widgets: z.array(resolvedDashboardWidgetSchema),
});
export type DashboardSegmentResponse = z.infer<typeof dashboardSegmentResponseSchema>;

/**
 * `PUT /admin/dashboard/segments/:segment/widgets` body — the full desired set in
 * display order. Whole-slice replacement makes the picker's apply idempotent and
 * removes any reorder race. At least one key: an empty stored selection is
 * indistinguishable from "never configured", which reads as the catalogue default.
 */
export const setDashboardWidgetsSchema = z.object({
  widgetKeys: z.array(z.string().min(1)).min(1),
});
export type SetDashboardWidgetsInput = z.infer<typeof setDashboardWidgetsSchema>;
