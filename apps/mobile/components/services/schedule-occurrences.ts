// Expanding a service's recurrence into the dates it next runs.
//
// A near-verbatim port of `apps/web/src/components/services/schedule-occurrences.ts`,
// kept identical on purpose: the two surfaces render the same "When it runs"
// table off the same `ServiceSchedule`, and a member who checks the website and
// then the app must not be shown two different Thursdays.
//
// ===========================================================================
// THIS IS CALENDAR ARITHMETIC, AND IT IS DELIBERATELY ZONE-FREE.
//
// A `ServiceSchedule` is a calendar date (`YYYY-MM-DD`) plus a wall-clock time
// (`HH:MM`) — "every Tuesday at 19:00", not "every Tuesday at 15:00Z". There
// is no instant to convert, so introducing a time zone here would invent a
// precision the data does not have. Every comparison below is a STRING
// comparison over `YYYY-MM-DD`, which is correct because that format sorts
// lexicographically, and every cursor step is `setUTCDate` on a UTC-midnight
// carrier, which cannot drift across a DST boundary the way a local `setDate`
// on an 00:00 local date can.
// ===========================================================================

import { RECURRENCE_WEEKDAYS, type ServiceSchedule } from '@fit/types';

/** `Date.prototype.getUTCDay()` is Sunday-first; the codes are not. */
const WEEKDAY_BY_UTC_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** One date a service runs on. `time` is the schedule's raw `HH:MM`. */
export interface ServiceOccurrence {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** `HH:MM`, 24-hour, exactly as the gym typed it. Never reformatted. */
  readonly time: string;
}

export interface OccurrenceOptions {
  /** How many days forward to scan. Days SCANNED, not occurrences found. */
  horizonDays?: number;
  /** Stop after this many occurrences. */
  limit?: number;
}

const DEFAULTS = { horizonDays: 28, limit: 12 } as const;

/** `YYYY-MM-DD` → a UTC-midnight carrier. */
function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** A UTC-midnight carrier → `YYYY-MM-DD`. */
function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * The next dates a schedule runs on, from `today` (a `YYYY-MM-DD` in the
 * viewer's own calendar) forward.
 *
 * `until` is INCLUSIVE — a schedule ending on the 30th still runs on the 30th.
 * A `ONCE` schedule that has already happened yields nothing rather than a row
 * in the past.
 */
export function upcomingOccurrences(
  schedule: ServiceSchedule,
  today: string,
  options: OccurrenceOptions = {},
): ServiceOccurrence[] {
  const horizonDays = options.horizonDays ?? DEFAULTS.horizonDays;
  const limit = options.limit ?? DEFAULTS.limit;

  if (schedule.freq === 'ONCE') {
    return schedule.startDate >= today
      ? [{ date: schedule.startDate, time: schedule.startTime }]
      : [];
  }

  // Start at whichever is later: the schedule's own start, or today. A
  // long-running weekly service must not list dates from the month it began.
  const first = schedule.startDate > today ? schedule.startDate : today;
  // DAILY is "every weekday code", which is what makes one loop serve both.
  const weekdays = schedule.freq === 'WEEKLY' ? schedule.weekdays : RECURRENCE_WEEKDAYS;

  const out: ServiceOccurrence[] = [];
  const cursor = parseDay(first);

  for (let scanned = 0; scanned < horizonDays && out.length < limit; scanned += 1) {
    const day = formatDay(cursor);
    if (schedule.until !== null && day > schedule.until) break;
    const code = WEEKDAY_BY_UTC_DAY[cursor.getUTCDay()];
    if (code !== undefined && weekdays.includes(code)) {
      out.push({ date: day, time: schedule.startTime });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

/**
 * Today's date in the DEVICE's calendar, as `YYYY-MM-DD`.
 *
 * Web computes this in the gym's IANA zone with `Intl.DateTimeFormat('en-CA')`.
 * `Intl` is banned here, and there is no `Intl`-free way to resolve an
 * arbitrary zone, so the phone uses its own calendar day — see the header of
 * `date-format.ts`.
 */
export function todayLocal(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
