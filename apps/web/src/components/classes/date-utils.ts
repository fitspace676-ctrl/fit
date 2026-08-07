// Small, dependency-free date helpers for the classes calendar.
//
// The calendar works in week windows that start on Monday (the Georgian /
// European convention) and renders times in the visitor's local zone. These
// helpers are deliberately tiny and pure so the calendar/list components stay
// declarative — there is no date library in the web app's dependency set, and a
// handful of `Date` arithmetic functions cover everything this page needs.

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

/**
 * A full, human date for an ISO instant, in the given locale — e.g.
 * `Monday, 1 June 2026`. Used by the class detail page heading; the calendar
 * itself groups by {@link dayKey} and never needs the long form.
 */
export function formatDate(iso: string, locale: string): string {
  return createDateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** Local `HH:mm` (24-hour) for an ISO instant, in the given locale. */
export function formatTime(iso: string, locale: string): string {
  return createDateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** A short label for a week range, e.g. `Jun 1 – Jun 7`. */
export function formatWeekRange(weekStart: Date, locale: string): string {
  const end = addDays(weekStart, DAYS_IN_WEEK - 1);
  const fmt = createDateTimeFormat(locale, { month: 'short', day: 'numeric' });
  return `${fmt.format(weekStart)} – ${fmt.format(end)}`;
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

/**
 * Group occurrences by local calendar day, each group and the items within it
 * sorted ascending by start time. The list view renders these as collapsible
 * day sections. Days with no classes are omitted (only days present in the data
 * appear).
 */
export function groupByDay<T extends HasStart>(items: T[]): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const date = new Date(item.startsAt);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const key = dayKey(start);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, { key, date: start, items: [item] });
    }
  }

  const sorted = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const group of sorted) {
    group.items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }
  return sorted;
}

/** Minutes from local midnight for an ISO instant (used to position grid cards). */
export function minutesIntoDay(iso: string): number {
  const date = new Date(iso);
  return date.getHours() * 60 + date.getMinutes();
}

/** Whole-day offset (0–6) of `iso` from `weekStart`, or `-1` if outside the week. */
export function dayIndexInWeek(iso: string, weekStart: Date): number {
  const date = new Date(iso);
  const offset = Math.floor((date.getTime() - weekStart.getTime()) / DAY_MS);
  return offset >= 0 && offset < DAYS_IN_WEEK ? offset : -1;
}
