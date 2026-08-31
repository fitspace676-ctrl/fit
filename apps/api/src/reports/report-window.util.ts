import { BadRequestException } from '@nestjs/common';
import { MAX_CUSTOM_RANGE_DAYS, type ReportWindowInput } from '@fit/types';
import { addZonedDays, zonedDayStart, zonedIsoDate, zonedParts } from './zoned-time.util';

/**
 * Shared reporting-window + bucket math for the admin reports surfaces (T12.12).
 *
 * The Reports CSV/XLSX catalogue ({@link ReportsService}) and the drill-down
 * framework ({@link ReportDrilldownService}) both window their aggregates over the
 * same preset vocabulary (or a custom pair of days) and bucket time series
 * identically. These
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

/** The reporting window a report is computed over, with its series bucket. */
export interface ReportWindow {
  /** Inclusive start of the window. */
  start: Date;
  /** Exclusive end of the window (always "now"). */
  end: Date;
  /** Bucket granularity for any time-series report. */
  bucket: 'day' | 'week' | 'month';
  /**
   * The IANA zone the window was answered in. Rides along so every bucket key,
   * calendar date and clock time derived from this window reads the same
   * calendar — a window opened at the gym's midnight and bucketed in UTC would
   * put the first hours of every day on the day before.
   */
  zone: string;
}

/** A count as a 0–100 percentage of a total, rounded to one decimal. */
export function rate(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Resolve a window input into a concrete window + series bucket granularity.
 *
 * `input` is a preset token or `{ from, to }` (two inclusive calendar days). The
 * calendar-anchored ones — `today`, `mtd`, and a custom pair — are answered in
 * `timeZone`, which is why the reports services pass the gym's own zone: "today"
 * in UTC is still yesterday at 02:00 in Tbilisi. `now` is injectable for tests
 * and defaults to the wall clock.
 *
 * A custom window never reaches into the future: one ending today stops at
 * `now`, and one ending after today is refused as a bad request rather than
 * quietly clipped, because the reader asked for days that have not happened.
 */
export function resolveWindow(
  input: ReportWindowInput,
  timeZone = 'UTC',
  now = new Date(),
): ReportWindow {
  const end = now;
  if (typeof input !== 'string') return resolveCustomWindow(input, timeZone, now);
  switch (input) {
    case 'today':
      return {
        start: zonedDayStart(zonedIsoDate(end, timeZone), timeZone),
        end,
        bucket: 'day',
        zone: timeZone,
      };
    case 'mtd': {
      const { year, month } = zonedParts(end, timeZone);
      const first = `${year}-${String(month).padStart(2, '0')}-01`;
      return { start: zonedDayStart(first, timeZone), end, bucket: 'day', zone: timeZone };
    }
    case '7d':
      return { start: new Date(end.getTime() - 7 * DAY_MS), end, bucket: 'day', zone: timeZone };
    case '30d':
      return { start: new Date(end.getTime() - 30 * DAY_MS), end, bucket: 'day', zone: timeZone };
    case '12w':
      return {
        start: new Date(end.getTime() - 12 * 7 * DAY_MS),
        end,
        bucket: 'week',
        zone: timeZone,
      };
    case '12m': {
      // Twelve CALENDAR months back from the gym's today, not 365 days: the
      // month buckets have to land on month starts, and months are not equal.
      const { year, month, day } = zonedParts(end, timeZone);
      const back = new Date(Date.UTC(year, month - 1 - 12, day));
      return {
        start: zonedDayStart(zonedIsoDate(back, 'UTC'), timeZone),
        end,
        bucket: 'month',
        zone: timeZone,
      };
    }
  }
}

/**
 * Bucket a custom span the way the presets do: a month or less reads by day
 * (as `30d` does), up to half a year by week (`12w` is 84 days), longer by
 * month (`12m`). Inclusive day counts.
 */
function customBucket(days: number): ReportWindow['bucket'] {
  if (days <= 31) return 'day';
  if (days <= 26 * 7) return 'week';
  return 'month';
}

function resolveCustomWindow(
  { from, to }: { from: string; to: string },
  timeZone: string,
  now: Date,
): ReportWindow {
  const today = zonedIsoDate(now, timeZone);
  if (to > today) {
    throw new BadRequestException(`A custom range cannot end after today (${today})`);
  }
  const start = zonedDayStart(from, timeZone);
  // `to` is inclusive, so the half-open window ends where the NEXT day starts —
  // capped at `now` so a range ending today does not count hours yet to come.
  const after = zonedDayStart(addZonedDays(to, 1, timeZone), timeZone);
  const end = after > now ? now : after;
  if (end < start) {
    throw new BadRequestException('A custom range must not end before it starts');
  }
  const days = Math.round((after.getTime() - start.getTime()) / DAY_MS);
  if (days > MAX_CUSTOM_RANGE_DAYS) {
    throw new BadRequestException(`A custom range covers at most ${MAX_CUSTOM_RANGE_DAYS} days`);
  }
  return { start, end, bucket: customBucket(days), zone: timeZone };
}

/**
 * The first and last calendar day a window touches, in its own zone — what a
 * response echoes as `from` / `to` so the screen can show the window it was
 * actually given. A custom window reads back as the two days asked for; a
 * rolling preset reads back as the days its instants land on. `end` is
 * exclusive, so the last day is the one just before it.
 */
export function windowDays(win: ReportWindow): { from: string; to: string } {
  const lastInstant = new Date(Math.max(win.end.getTime() - 1, win.start.getTime()));
  return { from: zonedIsoDate(win.start, win.zone), to: zonedIsoDate(lastInstant, win.zone) };
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
