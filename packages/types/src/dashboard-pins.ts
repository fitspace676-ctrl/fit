// @fit/types — dashboard "Pin to Dashboard" contracts (Zod schemas + types).
//
// The wire shape for pinning a drill-down report widget to a staff member's admin
// dashboard (T12.12). A pin is per-user and per-gym: it records which section of
// which drill-down report ({@link ReportMetric} + section id) a user wants surfaced
// on their dashboard. The reports drill-down page reads {@link DashboardPinsResponse}
// to toggle each section's pin control; the dashboard reads
// {@link DashboardWidgetsResponse} — the same pins but each resolved to its LIVE
// {@link ReportSection} data — to render the pinned widgets. Both are recomputed
// from real rows on every request (no cached figures).

import { z } from 'zod';
import { reportMetricSchema } from './reports-drilldown';
import { reportSectionSchema } from './reports-drilldown';

/* -------------------------------------------------------------------------- */
/*  Request                                                                     */
/* -------------------------------------------------------------------------- */

/** `POST /admin/dashboard/pins` body — pin one report section to the dashboard. */
export const createDashboardPinSchema = z.object({
  /** The drill-down report the pinned section belongs to. */
  metric: reportMetricSchema,
  /** The section's stable id within that report (e.g. `revenue-over-time`). */
  section: z.string().min(1).max(64),
});
export type CreateDashboardPin = z.infer<typeof createDashboardPinSchema>;

/* -------------------------------------------------------------------------- */
/*  Result                                                                      */
/* -------------------------------------------------------------------------- */

/** A stored pin — its id, the report/section it targets, and when it was pinned. */
export const dashboardPinSchema = z.object({
  id: z.string(),
  metric: reportMetricSchema,
  section: z.string(),
  /** ISO-8601 timestamp the pin was created. */
  pinnedAt: z.string(),
});
export type DashboardPin = z.infer<typeof dashboardPinSchema>;

/** `GET /admin/dashboard/pins` response — the caller's pins, newest first. */
export const dashboardPinsResponseSchema = z.object({
  pins: z.array(dashboardPinSchema),
});
export type DashboardPinsResponse = z.infer<typeof dashboardPinsResponseSchema>;

/**
 * One resolved pinned widget for the dashboard: the pin id and the metric/currency
 * it came from, plus the section's LIVE data. A pin whose section no longer exists
 * (a report changed shape) is omitted from the widgets response rather than shown
 * broken — so the dashboard only renders pins it can honestly fill.
 */
export const pinnedWidgetSchema = z.object({
  /** The pin id (for the unpin control). */
  id: z.string(),
  metric: reportMetricSchema,
  /** ISO-4217 currency the widget's money figures are denominated in. */
  currency: z.string(),
  /** The pinned section, resolved to its live data. */
  section: reportSectionSchema,
});
export type PinnedWidget = z.infer<typeof pinnedWidgetSchema>;

/** `GET /admin/dashboard/pins/widgets` response — pins resolved to live sections. */
export const dashboardWidgetsResponseSchema = z.object({
  widgets: z.array(pinnedWidgetSchema),
});
export type DashboardWidgetsResponse = z.infer<typeof dashboardWidgetsResponseSchema>;
