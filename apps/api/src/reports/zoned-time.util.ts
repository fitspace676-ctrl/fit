/**
 * Calendar math in a named IANA time zone.
 *
 * Reporting asks calendar questions — which DAY did this payment land on, which
 * HOUR of which weekday was the gym busiest — and a calendar only exists
 * somewhere. `report-window.util.ts` answered them in UTC, which is right for a
 * server and wrong for a gym: with `DEFAULT_TIMEZONE` at `Asia/Tbilisi` (UTC+4),
 * a 19:00 class landed in the 15:00 column of a chart titled "when demand
 * lands", and everything a gym took between midnight and 04:00 was counted
 * against the previous day.
 *
 * Built on `Intl.DateTimeFormat`, which is the only correct way to do this
 * without a dependency: it carries the full IANA database, so it knows that
 * Tbilisi has been UTC+4 since 2005 but was UTC+3 with summer time before it,
 * and it will keep knowing when some future government changes its mind. Hand
 * arithmetic on a fixed offset cannot do that, and is the reason "just add four
 * hours" is not a fix.
 *
 * This runs on the API only, where Node ships full ICU. It is deliberately NOT
 * in `@fit/i18n`, whose formatters are pure by contract precisely so they cannot
 * depend on a runtime's ICU build.
 */

/** A wall-clock reading, as the gym's own calendar shows it. */
export interface ZonedParts {
  year: number;
  /** 1–12, not the 0–11 `Date` uses. */
  month: number;
  /** 1–31. */
  day: number;
  /** 0–23. */
  hour: number;
  /** 0 = Monday … 6 = Sunday, matching the heatmap's row order. */
  weekday: number;
}

/** 0 = Monday … 6 = Sunday, from `Intl`'s short English weekday. */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * One formatter per zone, built once.
 *
 * `Intl.DateTimeFormat` construction is the expensive part — it resolves the
 * zone against ICU — and a heatmap calls this once per booking. A gym has one
 * zone, so this map holds one entry in practice.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  // `en-GB` for a stable, parseable part vocabulary: the LOCALE here decides how
  // the parts are spelled, never what they mean, so it must not follow the
  // gym's language. A Georgian locale would return `ორშ` for the weekday and
  // this would silently stop matching `WEEKDAY_INDEX`.
  const made = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  formatters.set(timeZone, made);
  return made;
}

/** An instant, read as the wall clock in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    // `hour12: false` still renders midnight as `24` in some ICU versions.
    hour: Number(pick('hour')) % 24,
    weekday: WEEKDAY_INDEX[pick('weekday')] ?? 0,
  };
}

/** The `YYYY-MM-DD` calendar date an instant falls on, in `timeZone`. */
export function zonedIsoDate(at: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(at, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * How far `timeZone` is ahead of UTC at a given instant, in milliseconds.
 *
 * Reads the wall clock there and re-interprets it as if it were UTC; the
 * difference from the real instant is the offset. Seconds are included because
 * a handful of historical zones are not whole minutes off.
 */
function offsetMs(at: Date, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(at);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour') % 24,
    pick('minute'),
    pick('second'),
  );
  // `at` carries milliseconds the formatter does not, so drop them from both
  // sides — otherwise every offset comes out a few hundred ms off a whole minute.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which a local calendar day begins.
 *
 * Guess that local midnight is UTC midnight, measure the zone's offset near that
 * guess, and subtract it. The offset is then re-measured AT the candidate and
 * applied again, which is what makes the two days a year that change offset come
 * out right: on those days the offset near UTC midnight and the offset at the
 * corrected instant can differ, and only the second one is the one in force.
 *
 * In the hour a spring-forward skips, local midnight does not exist; this
 * returns the instant the day actually starts, which is the defensible answer
 * for bucketing.
 */
export function zonedDayStart(isoDay: string, timeZone: string): Date {
  const [year, month, day] = isoDay.split('-').map(Number);
  const wall = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  const candidate = new Date(wall - offsetMs(new Date(wall), timeZone));
  return new Date(wall - offsetMs(candidate, timeZone));
}

/**
 * The calendar day `days` after `isoDay`, in `timeZone`.
 *
 * Steps the CALENDAR, not the clock. Adding 86_400_000ms to an instant lands an
 * hour early or late across a DST boundary and eventually skips or repeats a
 * date, which in a dense series shows up as a missing or duplicated bucket.
 */
export function addZonedDays(isoDay: string, days: number, timeZone: string): string {
  const start = zonedDayStart(isoDay, timeZone);
  // Noon, so a ±1h shift anywhere in the day cannot cross a date boundary.
  const noonish = new Date(start.getTime() + days * 86_400_000 + 12 * 3_600_000);
  return zonedIsoDate(noonish, timeZone);
}
