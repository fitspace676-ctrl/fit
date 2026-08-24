// Small, dependency-free date helpers for the classes calendar.
//
// The calendar works in week windows that start on Monday (the Georgian /
// European convention) and renders every time in the GYM'S zone — never the
// viewer's, and never UTC.
//
// WHY THE ZONE IS A REQUIRED ARGUMENT EVERYWHERE BELOW. A class is a wall-clock
// commitment: "Monday 18:00 at Main Floor" is the same appointment whether the
// member opens the page in Tbilisi or from a phone in Berlin. The stored
// `startsAt` is a true UTC instant, so the wall clock only comes back by reading
// it in the gym's zone. Before this, two different wrong zones were in play at
// once: the block's label was formatted in UTC (`createDateTimeFormat` is
// UTC-only by design — it exists for the admin reporting layer, where bucketing
// must not follow a viewer) while the grid positioned the same block by
// `Date#getHours`, the viewer's zone. An 08:00-UTC class was drawn at 12:00 with
// "08:00" written on it. Making the zone a parameter rather than a default is
// what stops that pairing from coming back: there is no call site that can
// forget it.
//
// There is no date library in the web app's dependency set; `Intl` supplies the
// zone arithmetic and these helpers stay tiny and pure.

import { createDateTimeFormat } from '@fit/i18n';

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Number of days a week window spans. */
export const DAYS_IN_WEEK = 7;

/** A new `Date` `n` days after `date` (negative `n` goes back). */
export function addDays(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

/** A new `Date` `n` weeks after `date` (negative `n` goes back). */
export function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * DAYS_IN_WEEK);
}

/**
 * The Monday 00:00 (local time) of the week containing `date`. Sunday counts as
 * the last day of the *previous* week, matching the Mon→Sun grid the calendar
 * draws.
 */
export function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  // getDay(): 0=Sun … 6=Sat. Map Sunday (0) to 6 so Monday is the week start.
  const dayFromMonday = (start.getDay() + 6) % DAYS_IN_WEEK;
  return addDays(start, -dayFromMonday);
}

/** True when `a` and `b` fall on the same local calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** A stable `YYYY-MM-DD` key for `date` in local time (used for grouping + URLs). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The seven `Date`s (Mon→Sun) of the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i));
}

/**
 * The half-open `[from, to)` window covering the week starting at `weekStart`,
 * as ISO-8601 strings ready for the `GET /class-instances` query. `to` is the
 * following Monday 00:00, so a class at 23:00 Sunday is included and the next
 * week's Monday classes are not.
 */
export function weekWindow(weekStart: Date): { from: string; to: string } {
  return {
    from: weekStart.toISOString(),
    to: addDays(weekStart, DAYS_IN_WEEK).toISOString(),
  };
}

/**
 * Resolve the `?week=YYYY-MM-DD` URL param to the Monday that starts its week,
 * falling back to the current week when the param is missing or unparseable. The
 * value is always normalised to a week start, so any day within a week yields
 * the same window.
 */
export function parseWeekParam(value: string | undefined | null): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return startOfWeek(parsed);
    }
  }
  return startOfWeek(new Date());
}

/** A short label for a week range, e.g. `Jun 1 – Jun 7`. */
export function formatWeekRange(weekStart: Date, locale: string): string {
  const end = addDays(weekStart, DAYS_IN_WEEK - 1);
  const fmt = createDateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return `${fmt.format(weekStart)} - ${fmt.format(end)}`;
}

/** A class occurrence carrying at least the `startsAt` instant used to group. */
interface HasStart {
  startsAt: string;
}

/** One day's worth of grouped occurrences, in calendar order. */
export interface DayGroup<T extends HasStart> {
  /** `YYYY-MM-DD` local key for the day. */
  key: string;
  /** The day itself (local midnight), for heading formatting. */
  date: Date;
  /** The day's occurrences, ascending by `startsAt`. */
  items: T[];
}

/* ========================================================================== *
 *  Zoned reads
 * ========================================================================== */

/** `Intl` formatters are expensive to build and pure — one per zone is plenty. */
const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = PARTS_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `h23` rather than `hour12: false`: the latter still yields "24" for
      // midnight on some engines, which would push a 00:15 class to the bottom
      // of the grid instead of the top.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    PARTS_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** An instant's wall-clock components as read in one zone. */
export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Read `iso`'s wall clock in `timeZone`. */
export function zonedParts(iso: string, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(new Date(iso));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/**
 * A `Date` whose UTC fields carry `iso`'s wall clock in `timeZone`.
 *
 * The trick that lets the localised month / weekday tables in `@fit/i18n` keep
 * working: that formatter reads UTC fields, so re-anchoring the gym's wall clock
 * as UTC makes it print exactly the components the gym would read off its own
 * wall, in the visitor's language. Never use one of these as an instant — it is
 * a carrier for display components only.
 */
function asUtcWallClock(iso: string, timeZone: string): Date {
  const { year, month, day, hour, minute } = zonedParts(iso, timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

/** `YYYY-MM-DD` for `iso` as the gym's calendar reads it. */
export function zonedDayKey(iso: string, timeZone: string): string {
  const { year, month, day } = zonedParts(iso, timeZone);
  return `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

/** `HH:mm` on the gym's clock, 24-hour. */
export function formatZonedTime(iso: string, timeZone: string): string {
  const { hour, minute } = zonedParts(iso, timeZone);
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
}

/**
 * Format `iso` on the gym's calendar with any field set.
 *
 * The one place `createDateTimeFormat` may be paired with a zone: it reads UTC
 * fields by contract, and {@link asUtcWallClock} is what makes those fields the
 * gym's wall clock. Everything dated in the portal should come through here or
 * one of the wrappers below, so no screen has to remember the pairing — getting
 * it wrong is silent, and prints a plausible date from the wrong day.
 */
export function formatZoned(
  iso: string,
  timeZone: string,
  locale: string,
  options: Parameters<typeof createDateTimeFormat>[1],
): string {
  return createDateTimeFormat(locale, options).format(asUtcWallClock(iso, timeZone));
}

/** A full, human date on the gym's calendar — e.g. `Monday, 1 June 2026`. */
export function formatZonedDate(iso: string, timeZone: string, locale: string): string {
  return formatZoned(iso, timeZone, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** The relative-day words a caller supplies, from its own i18n catalogue. */
export interface RelativeDayLabels {
  today: string;
  tomorrow: string;
  yesterday?: string;
}

/**
 * "Today" / "Tomorrow" / "Yesterday", else the short weekday — decided on the
 * GYM's calendar, not the viewer's and not UTC.
 *
 * Both halves have to agree on a zone or the label contradicts the clock beside
 * it. The dashboard used to compute today/tomorrow from `Date#toDateString`
 * (the viewer's zone) and then print the weekday through `createDateTimeFormat`
 * (UTC, by that formatter's own contract) — two zones inside one string, on a
 * card whose time was a third. Here both come from `zonedDayKey`, and the
 * weekday name is read off a wall-clock carrier so `@fit/i18n`'s localised
 * weekday table still applies.
 *
 * `now` is passed in rather than read from the clock so the result is stable for
 * a given render and testable without freezing time.
 */
export function zonedRelativeDay(
  iso: string,
  now: Date,
  timeZone: string,
  locale: string,
  labels: RelativeDayLabels,
): string {
  const dayKey = zonedDayKey(iso, timeZone);
  const todayKey = zonedDayKey(now.toISOString(), timeZone);
  // Both keys are `YYYY-MM-DD`, so parsing them as UTC midnights makes the
  // difference a whole number of days with no DST arithmetic involved.
  const diff = Math.round(
    (Date.parse(`${dayKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / DAY_MS,
  );

  if (diff === 0) return labels.today;
  if (diff === 1) return labels.tomorrow;
  if (diff === -1 && labels.yesterday) return labels.yesterday;
  return formatZoned(iso, timeZone, locale, { weekday: 'short' });
}

/** A compact `D Mon` date on the gym's calendar. */
export function formatZonedShortDate(iso: string, timeZone: string, locale: string): string {
  return formatZoned(iso, timeZone, locale, { day: 'numeric', month: 'short' });
}

/**
 * Whole-day offset (0–6) of `iso` from the week starting at `weekStartKey`, or
 * `-1` when it falls outside that week. Both sides are compared as the gym's
 * calendar days, so a class near midnight cannot land in the wrong column
 * because the viewer happens to be a few hours off.
 */
export function zonedDayIndexInWeek(iso: string, weekStartKey: string, timeZone: string): number {
  const key = zonedDayKey(iso, timeZone);
  const start = Date.parse(`${weekStartKey}T00:00:00Z`);
  const day = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(day)) return -1;
  const offset = Math.round((day - start) / DAY_MS);
  return offset >= 0 && offset < DAYS_IN_WEEK ? offset : -1;
}

/**
 * Group occurrences by the gym's calendar day, each group and the items within
 * it ascending by start. Days with no classes are omitted.
 */
export function groupByZonedDay<T extends HasStart>(items: T[], timeZone: string): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const key = zonedDayKey(item.startsAt, timeZone);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      // The carrier date holds the gym's midnight in UTC fields, so the day
      // heading formats through the same UTC-reading localised tables.
      groups.set(key, { key, date: new Date(`${key}T00:00:00Z`), items: [item] });
    }
  }

  const sorted = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const group of sorted) {
    group.items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return sorted;
}
