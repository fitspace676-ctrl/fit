// @fit/mobile — class-discovery API helper + calendar date math.
//
// Mirrors the web's `lib/classes.ts` + `date-utils.ts` so the mobile calendar
// renders the exact same `[from, to)` week windows and validated card shape the
// web does — same wire contract (`GET /class-instances`, `@fit/types`), no
// drift. The reads go through `apiFetch` (the listing is `@Public()`, but the
// shared client keeps base-URL + header handling in one place) and the date
// helpers are tiny, pure, and dependency-free (no date library in the app).

import {
  classInstanceCardSchema,
  classInstanceDetailSchema,
  type ClassCalendarView,
  type ClassInstanceCard,
  type ClassInstanceDetail,
} from '@fit/types';
import { apiFetch } from './api-client';

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
 * draws (the Georgian / European convention shared with web).
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

/** A stable `YYYY-MM-DD` key for `date` in local time (used for grouping). */
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

/** Local `HH:mm` (24-hour) for an ISO instant, in the given locale. */
export function formatTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** A short label for a week range, e.g. `Jun 1 – Jun 7`. */
export function formatWeekRange(weekStart: Date, locale: string): string {
  const end = addDays(weekStart, DAYS_IN_WEEK - 1);
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' });
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
 * sorted ascending by start time. The list view renders these as day sections;
 * days with no classes are omitted (only days present in the data appear).
 */
export function groupByDay<T extends HasStart>(items: T[]): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();

  for (const item of items) {
    const start = new Date(item.startsAt);
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

/** Arguments for {@link fetchClassInstances}. */
export interface FetchClassInstancesArgs {
  gymId: string;
  /** Window start, ISO-8601. */
  from: string;
  /** Window end (exclusive), ISO-8601. */
  to: string;
  /** Optional view hint echoed to the API; the response shape is identical. */
  view?: ClassCalendarView;
  /** Abort signal so an in-flight week request is cancelled when the week changes. */
  signal?: AbortSignal;
}

/**
 * Fetch the class occurrences for one gym in the `[from, to)` window. Returns the
 * parsed, validated cards (a malformed payload throws rather than reaching the
 * calendar). The same window backs both the week and list views, so toggling
 * between them never refetches.
 */
export async function fetchClassInstances({
  gymId,
  from,
  to,
  view,
  signal,
}: FetchClassInstancesArgs): Promise<ClassInstanceCard[]> {
  const params = new URLSearchParams({ gymId, from, to });
  if (view) {
    params.set('view', view);
  }

  const response = await apiFetch(`/class-instances?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load classes (${response.status})`);
  }

  const body = (await response.json()) as { instances?: unknown };
  return classInstanceCardSchema.array().parse(body.instances ?? []);
}

/** Arguments for {@link fetchClassInstance}. */
export interface FetchClassInstanceArgs {
  gymId: string;
  /** The occurrence id (the `[instanceId]` route param). */
  instanceId: string;
  /** Abort signal so a superseded detail request is cancelled. */
  signal?: AbortSignal;
}

/**
 * Fetch one occurrence's full detail for the class-detail screen (T6.4) via
 * `GET /class-instances/:id?gymId=<id>`. Returns the parsed, validated
 * {@link ClassInstanceDetail} — the richer projection the detail page renders
 * (description, duration, room, status). A `404` (unknown / cross-tenant id, or
 * a since-removed occurrence) surfaces as a thrown {@link ClassInstanceNotFound}
 * so the screen can show its dedicated "class not found" state rather than a
 * generic error; any other non-OK status throws a plain error.
 */
export async function fetchClassInstance({
  gymId,
  instanceId,
  signal,
}: FetchClassInstanceArgs): Promise<ClassInstanceDetail> {
  const params = new URLSearchParams({ gymId });

  const response = await apiFetch(`/class-instances/${instanceId}?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (response.status === 404) {
    throw new ClassInstanceNotFound(instanceId);
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load class (${response.status})`);
  }

  const body = (await response.json()) as { instance?: unknown };
  return classInstanceDetailSchema.parse(body.instance);
}

/**
 * Thrown by {@link fetchClassInstance} when the occurrence cannot be found
 * (`404`). Lets the detail screen branch on a missing class without parsing
 * status text — see `useClassInstance`.
 */
export class ClassInstanceNotFound extends Error {
  constructor(instanceId: string) {
    super(`Class instance not found: ${instanceId}`);
    this.name = 'ClassInstanceNotFound';
  }
}
