// @fit/admin — the schedule calendar's week-window maths.
//
// The staff week calendar (T3.2) pages over `GET /admin/schedule` (T3.1) one week
// at a time.
//
// Day *anchors* here are UTC-midnight `Date`s used purely as calendar-day tokens
// — "the 3rd of August", not an instant. What needs the gym's zone is the three
// places a token meets real time: which day is **today**, the `[from, to)`
// **instants** a week covers, and which column an occurrence **falls in**.
//
// This module used to do all of that in UTC, on the stated grounds that
// occurrences were anchored at UTC midnight and the console had no timezone to
// hand. `ClassTemplate.startTime` ended that: an occurrence now sits at a
// gym-local wall clock, so a UTC grid shows a Tbilisi gym its 11:00 class at
// 07:00 and, just after local midnight, the whole of last week.
//
// The URL carries a single `?week=YYYY-MM-DD` param — the Monday of the visible
// week. From it the page derives the `[from, to)` instant window the API expects
// and the seven day columns the grid renders; the client only ever moves `week`.

/** Milliseconds in one day, for shifting a UTC-midnight anchor by whole days. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days shown in a week column strip. */
export const DAYS_IN_WEEK = 7;

/** `YYYY-MM-DD` for a Date, in UTC — the canonical `?week=` / day-anchor form. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The `YYYY-MM-DD` calendar date `instant` falls on **in `timeZone`** — the key a
 * grid column is bucketed under. A 00:30 Tbilisi class is 20:30Z the day before,
 * so keying off the raw instant would file it in yesterday's column.
 */
export function zonedIsoDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const at = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${at('year')}-${at('month')}-${at('day')}`;
}

/**
 * The day anchor for "today at the gym" — today's gym-local date, as the
 * UTC-midnight token the rest of this module works in.
 */
export function zonedToday(now: Date, timeZone: string): Date {
  return new Date(`${zonedIsoDate(now, timeZone)}T00:00:00.000Z`);
}

/**
 * The UTC instant at which the gym-local calendar day `anchor` begins.
 *
 * The offset depends on the instant and the instant on the offset, so the guess
 * is refined twice: the first pass lands within an hour, the second settles it
 * even when the first fell the far side of a DST switch.
 */
export function zonedDayStart(anchor: Date, timeZone: string): Date {
  const wall = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
    0,
    0,
    0,
  );
  let utc = wall;
  for (let pass = 0; pass < 2; pass += 1) {
    utc = wall - zoneOffsetMs(new Date(utc), timeZone);
  }
  return new Date(utc);
}

/** The offset, in ms, that `timeZone` was at for `instant` — positive east of UTC. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const at = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asIfUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour'),
    at('minute'),
    at('second'),
  );
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC-midnight `Date` for the Monday of the week containing `date`. ISO weeks
 * start on Monday, so Sunday (`getUTCDay() === 0`) belongs to the week that began
 * six days earlier. Time-of-day is discarded so the result is a stable day anchor.
 */
export function mondayOf(date: Date): Date {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dow = new Date(utcMidnight).getUTCDay();
  const backToMonday = (dow + 6) % 7; // Mon→0, Tue→1, … Sun→6
  return new Date(utcMidnight - backToMonday * DAY_MS);
}

/**
 * Resolve the visible week's Monday from a raw `?week=` param. A well-formed
 * `YYYY-MM-DD` is snapped to its own Monday (so a mid-week or hand-edited value
 * still lands on a week boundary); anything missing or unparseable falls back to
 * the Monday of `today`.
 */
export function resolveWeekStart(weekParam: string | undefined, today: Date): Date {
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    const parsed = new Date(`${weekParam}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return mondayOf(parsed);
    }
  }
  return mondayOf(today);
}

/** Shift a week-start Monday by whole weeks (negative = earlier). */
export function addWeeks(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * DAYS_IN_WEEK * DAY_MS);
}

/** The seven UTC-midnight day anchors of the week beginning at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
}

/**
 * The half-open instant window `[from, to)` the API expects for the week — the
 * Monday midnight through the next Monday midnight, both as ISO-8601 UTC strings.
 */
export function weekWindow(weekStart: Date, timeZone: string): { from: string; to: string } {
  return {
    from: zonedDayStart(weekStart, timeZone).toISOString(),
    to: zonedDayStart(addWeeks(weekStart, 1), timeZone).toISOString(),
  };
}

// ── Month view ──────────────────────────────────────────────────────────────
// The month calendar reuses the same UTC-anchored maths as the week grid: it
// fetches the whole month *grid* window (the full weeks that overlap the month,
// so the leading/trailing days from neighbouring months are covered too) and
// renders a Monday-first 7-column grid.

/** The UTC-midnight `Date` for the first day of the month containing `date`. */
export function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Resolve a raw `?week=` param to a month anchor — the first of its month. A
 * well-formed `YYYY-MM-DD` is honoured; anything missing or unparseable falls
 * back to the month of `today`.
 */
export function resolveMonthAnchor(weekParam: string | undefined, today: Date): Date {
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    const parsed = new Date(`${weekParam}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return firstOfMonth(parsed);
    }
  }
  return firstOfMonth(today);
}

/** Shift a month anchor (its first) by whole months (negative = earlier). */
export function addMonths(anchor: Date, months: number): Date {
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + months, 1));
}

/**
 * The day anchors of the month *grid* for `anchor`'s month — every day from the
 * Monday on/before the 1st through the Sunday on/after the last, so the grid is
 * always whole weeks (35 or 42 days). Each is a UTC-midnight `Date`.
 */
export function monthGridDays(anchor: Date): Date[] {
  const gridStart = mondayOf(firstOfMonth(anchor));
  const monthEnd = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  const gridEndExclusive = addWeeks(mondayOf(monthEnd), 1);
  const dayCount = Math.round((gridEndExclusive.getTime() - gridStart.getTime()) / DAY_MS);
  return Array.from({ length: dayCount }, (_, i) => new Date(gridStart.getTime() + i * DAY_MS));
}

/**
 * The half-open instant window `[from, to)` covering `anchor`'s whole month grid
 * — the first grid day's midnight through the day after the last, as ISO-8601
 * UTC strings. This is the fetch window the API expects for a month view.
 */
export function monthWindow(anchor: Date, timeZone: string): { from: string; to: string } {
  const days = monthGridDays(anchor);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  return {
    from: zonedDayStart(first, timeZone).toISOString(),
    to: zonedDayStart(new Date(last.getTime() + DAY_MS), timeZone).toISOString(),
  };
}
