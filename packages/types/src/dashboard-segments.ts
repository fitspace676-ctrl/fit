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
 * segment — no migration, because the stored rows carry the segment as a plain
 * string.
 *
 * `sales`, `members` and `revenue` are absent: all three are hand-built views with
 * their own controls, like `overview`, so there is nothing for the picker to
 * configure. Stored `DashboardWidget` rows naming their retired keys are harmless —
 * `findDashboardWidget` already returns `undefined` for a key the catalogue no
 * longer defines.
 */
export const CONFIGURABLE_DASHBOARD_SEGMENTS = ['classes', 'staff'] as const;

export const configurableDashboardSegmentSchema = z.enum(CONFIGURABLE_DASHBOARD_SEGMENTS);
export type ConfigurableDashboardSegment = z.infer<typeof configurableDashboardSegmentSchema>;

/**
 * The tabs that are hand-built views rather than widget grids. The single source
 * of truth for "does this tab read the shell's `?range=` and offer the widget
 * picker?" — read by `segmented-dashboard.tsx` and `dashboard-header.tsx` alike,
 * so the two can never disagree about a tab.
 */
export const HAND_BUILT_SEGMENTS = ['overview', 'sales', 'members', 'revenue'] as const;

export type HandBuiltDashboardSegment = (typeof HAND_BUILT_SEGMENTS)[number];

/**
 * Every dashboard tab, in display order — the hand-built views first, then the
 * configurable ones, so adding a segment there still adds its tab.
 */
export const DASHBOARD_SEGMENTS = [
  ...HAND_BUILT_SEGMENTS,
  ...CONFIGURABLE_DASHBOARD_SEGMENTS,
] as const;

export const dashboardSegmentSchema = z.enum(DASHBOARD_SEGMENTS);
export type DashboardSegment = z.infer<typeof dashboardSegmentSchema>;

/** The tab shown when `?segment=` is absent or unrecognised. */
export const DEFAULT_DASHBOARD_SEGMENT: DashboardSegment = 'overview';

/**
 * Whether a tab is one of the hand-built views. A type guard rather than a plain
 * boolean so the FALSE branch narrows to {@link ConfigurableDashboardSegment} —
 * which is what lets a caller hand the remainder straight to the segment panel
 * or the picker without a cast that a later segment could silently invalidate.
 */
export function isHandBuiltSegment(
  segment: DashboardSegment,
): segment is HandBuiltDashboardSegment {
  return (HAND_BUILT_SEGMENTS as readonly DashboardSegment[]).includes(segment);
}

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
