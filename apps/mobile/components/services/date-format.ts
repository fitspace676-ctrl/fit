// Wall-clock dates and times for the discovery stacks — Trainers and Services.
//
// ===========================================================================
// WHY THIS FILE EXISTS AT ALL: `createDateTimeFormat` READS UTC, ON PURPOSE.
//
// `@fit/i18n`'s formatter is pure — no `Intl` on any code path, because no
// runtime we ship carries Georgian locale data (and the app's own eslint
// config bans `Intl` and `toLocale*` outright). The price of that purity is
// that every field it reads is a `getUTC*`, and its doc says so: "Only 'UTC'
// is honoured; anything else formats in UTC too and is a bug at the call
// site."
//
// Every instant the API hands these screens — `startsAt`, `endsAt`,
// `createdAt` — is an ISO-8601 UTC instant. Rendered straight through the
// formatter, a 19:00 session in Tbilisi (UTC+4) reads "15:00". That is not a
// rounding error; it is the wrong answer to the only question the screen
// exists to answer.
//
// So the instant is shifted by the zone offset *at that instant* — which is
// what makes it DST-correct rather than a fixed `+4` — and the shifted `Date`
// is then read in UTC by the pure formatter. Its UTC fields now spell the
// LOCAL wall clock. {@link wallClock} is the only place that trick lives.
//
// ---------------------------------------------------------------------------
// WHY IT LIVES UNDER `components/services/` AND IS IMPORTED BY `trainers/`.
//
// Both discovery stacks group a list of instants under day headings and
// render a start–end range: the trainer's upcoming schedule and the service's
// free slots are the same shape with different nouns. C3b owns exactly two
// component directories (`components/trainers/**`, `components/services/**`)
// and no shared third, so the module sits in one of them rather than being
// written twice — a second copy is how two screens end up disagreeing about
// which day a 23:30 session falls on. When a third consumer appears it should
// move to a shared `components/discovery/`.
// ===========================================================================

import { createDateTimeFormat, type Locale } from '@fit/i18n';

/** A day's worth of items, keyed by the local calendar date they fall on. */
export interface DayGroup<T> {
  /** `YYYY-MM-DD` in the device's zone. Stable, sortable, and a React key. */
  readonly key: string;
  /** The instant the heading is formatted from — the day's first item. */
  readonly date: Date;
  readonly items: readonly T[];
}

/**
 * The same instant, shifted so its **UTC** fields read the device's local wall
 * clock.
 *
 * The returned `Date` is deliberately NOT the same moment in time; it exists
 * only to be handed to a UTC-reading formatter. Never compare two of these
 * against `Date.now()`.
 */
export function wallClock(iso: string | Date): Date {
  const instant = typeof iso === 'string' ? new Date(iso) : iso;
  // `getTimezoneOffset` is evaluated *for that instant*, so a session either
  // side of a DST boundary shifts by its own offset rather than today's.
  return new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000);
}

/** Is this a real instant? An unparseable string is `Invalid Date`, not a throw. */
export function isValidDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

/** `YYYY-MM-DD` for the local calendar day an instant falls on. */
export function localDayKey(iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return local.toISOString().slice(0, 10);
}

/**
 * `HH:MM` in Georgian, `h:MM AM/PM` in English — the locale's own clock.
 *
 * The hour WIDTH is per-locale and that is CLDR's rule, not a preference:
 * Georgian's short time pattern is `HH:mm`, so 08:30 keeps its leading zero,
 * while English's is `h:mm a`, where "06:00 PM" is simply wrong. One shared
 * option would get one of the two locales wrong on every screen that shows a
 * time, and English is the one a developer would notice.
 */
export function formatTime(locale: Locale, iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return createDateTimeFormat(locale, {
    hour: locale === 'en' ? 'numeric' : '2-digit',
    minute: '2-digit',
  }).format(local);
}

/**
 * `18:30 – 19:30`. An EN DASH with hair spaces, not a hyphen: the hyphen is
 * what a phone number uses, and at 13px the two are not distinguishable.
 */
export function formatTimeRange(locale: Locale, startIso: string, endIso: string): string {
  const start = formatTime(locale, startIso);
  const end = formatTime(locale, endIso);
  if (start === '') return '';
  return end === '' ? start : `${start} – ${end}`;
}

/** `Thu, Aug 6` / `ხუთ, 6 აგვ` — the heading over one day's group. */
export function formatDayHeading(locale: Locale, iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return createDateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(local);
}

/** `Thursday 6 August` — spelled out, for an `accessibilityLabel`. */
export function formatDayLong(locale: Locale, iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return createDateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(local);
}

/** `Aug 6, 2026` — a medium date, for a review's timestamp. */
export function formatMediumDate(locale: Locale, iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return createDateTimeFormat(locale, { dateStyle: 'medium' }).format(local);
}

/** The abbreviated weekday alone — the top line of a `DayCell`. */
export function formatWeekdayShort(locale: Locale, iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return createDateTimeFormat(locale, { weekday: 'short' }).format(local);
}

/** The day of the month alone — the bottom line of a `DayCell`. */
export function formatDayOfMonth(iso: string | Date): string {
  const local = wallClock(iso);
  if (!isValidDate(local)) return '';
  return String(local.getUTCDate());
}

/**
 * Group instants under their local calendar day, days ascending and each day's
 * items ascending within it.
 *
 * The input order is not trusted: `GET /trainers/:id` documents its schedule as
 * ordered by `startsAt`, but the slots endpoint makes no such promise, and one
 * unsorted response is enough to draw "Thu" twice.
 */
export function groupByDay<T>(items: readonly T[], instantOf: (item: T) => string): DayGroup<T>[] {
  const buckets = new Map<string, { date: Date; items: T[] }>();

  for (const item of items) {
    const iso = instantOf(item);
    const key = localDayKey(iso);
    if (key === '') continue;
    const existing = buckets.get(key);
    if (existing) existing.items.push(item);
    else buckets.set(key, { date: new Date(iso), items: [item] });
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, bucket]) => ({
      key,
      date: bucket.date,
      items: bucket.items.sort(
        (a, b) => new Date(instantOf(a)).getTime() - new Date(instantOf(b)).getTime(),
      ),
    }));
}

// ── The week window the slot calendar pages through ─────────────────────────

/** Days in the calendar's window. One ISO week. */
export const WEEK_DAYS = 7;

/**
 * Local midnight on the Monday of the ISO week containing `date`.
 *
 * `new Date(y, m, d)` is local midnight by construction, so the window this
 * seeds lines up with the days the member sees rather than with UTC's.
 */
export function startOfWeek(date: Date): Date {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // `getDay()` is Sunday-first; the design's weeks, like CLDR's Georgian and
  // the shared `WEEKDAYS` table, start on Monday.
  const mondayIndex = (midnight.getDay() + 6) % 7;
  midnight.setDate(midnight.getDate() - mondayIndex);
  return midnight;
}

/** `date` plus `days`, at the same local wall-clock time. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

/** The seven local midnights of the week beginning `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: WEEK_DAYS }, (_, index) => addDays(weekStart, index));
}

/**
 * The `[from, to)` instants a week covers, as the ISO strings
 * `GET /service-sessions` validates.
 *
 * Seven days, far inside the server's `MAX_SCHEDULE_WINDOW_DAYS` of 62 — an
 * inverted or over-long range is a `400`, not an empty list.
 */
export function weekWindow(weekStart: Date): { from: string; to: string } {
  return {
    from: weekStart.toISOString(),
    to: addDays(weekStart, WEEK_DAYS).toISOString(),
  };
}

/** Are these the same local calendar day? */
export function isSameDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b);
}

// ── Calendar dates, which are NOT instants ──────────────────────────────────
//
// A `ServiceSchedule` carries `startDate` / `until` as bare `YYYY-MM-DD` and
// `startTime` as a bare `HH:MM`. Those are calendar values, not moments: there
// is no zone attached and none to strip. Running them through {@link wallClock}
// would be a real bug — a UTC-midnight carrier shifted by a NEGATIVE offset
// lands on the previous day, so `2026-08-06` would render "Aug 5" for every
// member west of Greenwich. These two build the same UTC-midnight carrier the
// web port does and hand it STRAIGHT to the UTC-reading formatter.

/** `YYYY-MM-DD` → the UTC-midnight carrier a UTC-reading formatter wants. */
export function calendarCarrier(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** `Aug 6, 2026` from a bare `YYYY-MM-DD`. No zone shift. */
export function formatCalendarDate(locale: Locale, isoDate: string): string {
  const carrier = calendarCarrier(isoDate);
  if (!isValidDate(carrier)) return '';
  return createDateTimeFormat(locale, { dateStyle: 'medium' }).format(carrier);
}

/** `Thu, Aug 6` from a bare `YYYY-MM-DD`. No zone shift. */
export function formatCalendarDayHeading(locale: Locale, isoDate: string): string {
  const carrier = calendarCarrier(isoDate);
  if (!isValidDate(carrier)) return '';
  return createDateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(carrier);
}
