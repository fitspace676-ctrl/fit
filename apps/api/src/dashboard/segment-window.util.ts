// The window every dashboard segment tab (Sales, Members, Revenue, Classes, Staff)
// aggregates over.
//
// With the header's `period` in the query, a tab answers for EXACTLY the window the
// overview shows — the same `resolvePeriodWindow`, in the gym's zone — so "this
// month" means the same days on every tab and the month's takings agree. The tab's
// `granularity` then only picks the chart bucket (day / week / month).
//
// Without `period` (the AI tools, older clients) a tab keeps its older rolling
// window: `granularity` picks `30d` / `12w` / `12m`, and the response says so by
// echoing `period: null`.

import {
  SALES_GRANULARITY_RANGE,
  type DashboardPeriod,
  type DashboardResolvedPeriod,
  type SalesGranularity,
} from '@fit/types';
import { resolveWindow, type ReportWindow } from '../reports/report-window.util';
import { resolvePeriodWindow } from './dashboard.service';

/** The series bucket each granularity draws once the window comes from `period`. */
const GRANULARITY_BUCKET: Record<SalesGranularity, ReportWindow['bucket']> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

/** The query fields a segment window is resolved from. */
export interface SegmentWindowQuery {
  granularity: SalesGranularity;
  period?: DashboardPeriod;
  from?: string;
  to?: string;
}

export interface SegmentWindow {
  /** The `[start, end)` window and bucket every figure on the tab reads. */
  win: ReportWindow;
  /** The header period it came from, echoed on the response; `null` when rolling. */
  period: DashboardResolvedPeriod | null;
}

/**
 * Resolve a segment query into its window.
 *
 * A period window that runs past `now` (today, this week, this month) is cut at
 * `now`: nothing has happened after it, so takings are unchanged, while state
 * figures ("active at the end of the window") and charts stop at the present
 * instead of projecting today's state onto days still to come.
 */
export function resolveSegmentWindow(
  query: SegmentWindowQuery,
  zone: string,
  now = new Date(),
): SegmentWindow {
  if (query.period === undefined) {
    return {
      win: resolveWindow(SALES_GRANULARITY_RANGE[query.granularity], zone, now),
      period: null,
    };
  }
  const pw = resolvePeriodWindow(query, now, zone);
  const end = pw.end > now ? (now > pw.start ? now : pw.start) : pw.end;
  return {
    win: { start: pw.start, end, bucket: GRANULARITY_BUCKET[query.granularity], zone },
    period: { period: pw.period, from: pw.fromISO, to: pw.toISO },
  };
}
