import type { ReportRange } from '@fit/types';

/**
 * Shared reporting-window + bucket math for the admin reports surfaces (T12.12).
 *
 * The Reports CSV/XLSX catalogue ({@link ReportsService}) and the drill-down
 * framework ({@link ReportDrilldownService}) both window their aggregates over the
 * same `7d`/`30d`/`12w`/`12m` vocabulary and bucket time series identically. These
 * pure, UTC helpers are that single source of truth so the two services (and the
 * analytics screen's own copy) can never drift on where a bucket starts or which
 * periods a dense series fills. All math is UTC — no server-timezone drift.
 */

/** Milliseconds in a day, for window math. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Fallback reporting currency when the gym has taken no payments (schema default). */
export const DEFAULT_CURRENCY = 'USD';

/** The reporting window a report is computed over, with its series bucket. */
export interface ReportWindow {
  /** Inclusive start of the window. */
  start: Date;
  /** Exclusive end of the window (always "now"). */
  end: Date;
  /** Bucket granularity for any time-series report. */
  bucket: 'day' | 'week' | 'month';
}

/** A count as a 0–100 percentage of a total, rounded to one decimal. */
export function rate(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

/** Resolve a range token into a concrete window + series bucket granularity (UTC). */
export function resolveWindow(range: ReportRange): ReportWindow {
  const end = new Date();
  switch (range) {
    case '7d':
      return { start: new Date(end.getTime() - 7 * DAY_MS), end, bucket: 'day' };
    case '30d':
      return { start: new Date(end.getTime() - 30 * DAY_MS), end, bucket: 'day' };
    case '12w':
      return { start: new Date(end.getTime() - 12 * 7 * DAY_MS), end, bucket: 'week' };
    case '12m':
      return {
        start: new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, end.getUTCDate())),
        end,
        bucket: 'month',
      };
  }
}

/** The `YYYY-MM-DD` bucket key an instant falls into, at the given granularity (UTC). */
export function bucketKey(at: Date, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'month') {
    return isoDate(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)));
  }
  if (bucket === 'week') {
    // Monday-start week: shift back to the week's Monday (UTC).
    const day = at.getUTCDay(); // 0 = Sun … 6 = Sat
    const mondayOffset = (day + 6) % 7;
    const monday = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - mondayOffset),
    );
    return isoDate(monday);
  }
  return isoDate(at);
}

/** A dense, zero-filled bucket map spanning the window, keyed by bucket start. */
export function emptyBuckets(win: ReportWindow): Map<string, number> {
  const buckets = new Map<string, number>();
  if (win.bucket === 'month') {
    let cursor = new Date(Date.UTC(win.start.getUTCFullYear(), win.start.getUTCMonth(), 1));
    while (cursor < win.end) {
      buckets.set(isoDate(cursor), 0);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return buckets;
  }
  const step = win.bucket === 'week' ? 7 * DAY_MS : DAY_MS;
  // Anchor to the first bucket's start so day/week keys line up with `bucketKey`.
  let cursorMs = new Date(`${bucketKey(win.start, win.bucket)}T00:00:00.000Z`).getTime();
  while (cursorMs < win.end.getTime()) {
    buckets.set(isoDate(new Date(cursorMs)), 0);
    cursorMs += step;
  }
  return buckets;
}

/** Format an instant as its `YYYY-MM-DD` UTC date. */
export function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}
