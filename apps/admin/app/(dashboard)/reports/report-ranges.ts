// @fit/admin — the Reports screen's export-window model.
//
// A plain (non-client) module so both the server page (which validates the URL
// param and resolves the day bounds) and the client view (which renders the
// segmented control) can share the same range set without crossing the RSC
// client-reference boundary.

/** The export window options offered by the range control, in ascending span order. */
export const REPORT_RANGES = ['today', '7d', '30d', 'quarter'] as const;

/** One of {@link REPORT_RANGES} — the export window key carried in the URL. */
export type ReportsRange = (typeof REPORT_RANGES)[number];

/** Human labels for the range control's segments. */
export const RANGE_LABELS: Record<ReportsRange, string> = {
  today: 'Today',
  '7d': '7 days',
  '30d': '30 days',
  quarter: 'Quarter',
};
