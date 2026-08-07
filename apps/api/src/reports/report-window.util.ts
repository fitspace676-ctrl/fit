import type { ReportRange } from '@fit/types';
import { addZonedDays, zonedDayStart, zonedIsoDate, zonedParts } from './zoned-time.util';

/**
 * Shared reporting-window + bucket math for the admin reports surfaces (T12.12).
 *
 * The Reports CSV/XLSX catalogue ({@link ReportsService}) and the drill-down
 * framework ({@link ReportDrilldownService}) both window their aggregates over the
 * same `7d`/`30d`/`12w`/`12m` vocabulary and bucket time series identically. These
 * pure helpers are that single source of truth so the two services (and the
 * analytics screen's own copy) can never drift on where a bucket starts or which
 * periods a dense series fills.
 *
 * Every function takes a `timeZone` and DEFAULTS IT TO UTC. That default is not
 * a shrug: a bucket boundary is a calendar question, and answering it in UTC is
 * what put a gym's 01:00 takings on the previous day. The dashboard passes the
 * gym's own zone from its settings. Reports still take the default, and moving
 * them is a separate change with its own fixtures — the parameter exists so the
 * two can differ deliberately rather than by omission.
 *
 * Never reads the SERVER's zone. That is the one answer that is wrong everywhere.
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

/** Resolve a range token into a concrete window + series bucket granularity. */
export function resolveWindow(range: ReportRange, timeZone = 'UTC'): ReportWindow {
  const end = new Date();
  switch (range) {
    case '7d':
      return { start: new Date(end.getTime() - 7 * DAY_MS), end, bucket: 'day' };
    case '30d':
      return { start: new Date(end.getTime() - 30 * DAY_MS), end, bucket: 'day' };
    case '12w':
      return { start: new Date(end.getTime() - 12 * 7 * DAY_MS), end, bucket: 'week' };
    case '12m': {
      // Twelve CALENDAR months back from the gym's today, not 365 days: the
      // month buckets have to land on month starts, and months are not equal.
      const { year, month, day } = zonedParts(end, timeZone);
      const back = new Date(Date.UTC(year, month - 1 - 12, day));
      return { start: zonedDayStart(zonedIsoDate(back, 'UTC'), timeZone), end, bucket: 'month' };
    }
  }
}

/** The `YYYY-MM-DD` bucket key an instant falls into, at the given granularity. */
export function bucketKey(at: Date, bucket: 'day' | 'week' | 'month', timeZone = 'UTC'): string {
  const { year, month, day, weekday } = zonedParts(at, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  if (bucket === 'month') return `${year}-${pad(month)}-01`;
  if (bucket === 'week') {
    // Monday-start week. `weekday` is already 0 = Monday, so it IS the offset
    // back to Monday — and it is the LOCAL weekday, which is the point: an
    // instant can be Sunday in UTC and Monday at the gym, and those are
    // different weeks.
    return addZonedDays(`${year}-${pad(month)}-${pad(day)}`, -weekday, timeZone);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A dense, zero-filled bucket map spanning the window, keyed by bucket start. */
export function emptyBuckets(win: ReportWindow, timeZone = 'UTC'): Map<string, number> {
  const buckets = new Map<string, number>();
  if (win.bucket === 'month') {
    const first = zonedParts(win.start, timeZone);
    let year = first.year;
    let month = first.month;
    for (;;) {
      const key = `${year}-${String(month).padStart(2, '0')}-01`;
      if (zonedDayStart(key, timeZone) >= win.end) break;
      buckets.set(key, 0);
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return buckets;
  }
  // Anchor to the first bucket's start so day/week keys line up with `bucketKey`,
  // then step the CALENDAR. Adding a fixed 24h lands an hour out across a
  // daylight-saving change and eventually skips or repeats a date, which in a
  // dense series is a missing or duplicated bucket.
  const step = win.bucket === 'week' ? 7 : 1;
  let cursor = bucketKey(win.start, win.bucket, timeZone);
  while (zonedDayStart(cursor, timeZone) < win.end) {
    buckets.set(cursor, 0);
    cursor = addZonedDays(cursor, step, timeZone);
  }
  return buckets;
}

/** Format an instant as its `YYYY-MM-DD` calendar date in `timeZone`. */
export function isoDate(at: Date, timeZone = 'UTC'): string {
  return zonedIsoDate(at, timeZone);
}
