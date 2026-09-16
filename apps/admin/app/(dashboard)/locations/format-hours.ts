// @fit/admin — opening-hours helpers for the locations UI.
//
// The week-shaped and clock-dependent parts the roster and detail page share:
// which day an instant falls on, whether the branch is open right now, and the
// compact week summary the roster cell renders.
//
// The one-day display string itself is not here: `formatDayHours` lives in
// `@fit/types` beside the `MIDNIGHT_CLOSE` encoding it has to interpret, because
// the public `GET /locations` projection renders the same day and the two had
// drifted. It is re-exported so the console's call sites stay unchanged.

import {
  CLOSED_LABEL,
  MIDNIGHT_CLOSE,
  WEEKDAYS,
  WEEKDAY_LABELS,
  formatDayHours,
  type DayHours,
  type LocationHours,
  type Weekday,
} from '@fit/types';

export { formatDayHours };

/**
 * The {@link Weekday} key for a given instant, Monday-first to match
 * {@link WEEKDAYS}. JavaScript's `getDay()` is Sunday-first (0 = Sun), so shift by
 * six and wrap to land Monday at index 0.
 */
export function weekdayOf(date: Date): Weekday {
  // `getDay()` returns 0–6, so the shifted index is always in range; the `?? 'mon'`
  // is unreachable and only satisfies the noUncheckedIndexedAccess bound.
  return WEEKDAYS[(date.getDay() + 6) % 7] ?? 'mon';
}

/** The {@link DayHours} in effect on the given instant's weekday. */
export function hoursForDate(hours: LocationHours, date: Date): DayHours {
  return hours[weekdayOf(date)];
}

/**
 * Whether the branch is open at the given instant, per its weekly hours. Closed
 * on a `closed` day; otherwise the local `HH:MM` clock must fall in `[open,
 * close)`. Times are zero-padded 24-hour strings, so a lexical compare is a
 * correct time compare.
 *
 * A `close` of {@link MIDNIGHT_CLOSE} is the end of the day, not the start of it:
 * the window simply runs to the day's end, so a branch open 09:00–00:00 reads as
 * open at 23:30 rather than closed since nine in the morning.
 */
export function isOpenAt(hours: LocationHours, date: Date): boolean {
  const day = hoursForDate(hours, date);
  if (day.closed) return false;
  const now = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (now < day.open) return false;
  return day.close === MIDNIGHT_CLOSE || now < day.close;
}

/** A weekday's label, e.g. `Monday`. */
export function weekdayLabel(day: Weekday): string {
  return WEEKDAY_LABELS[day];
}

/**
 * A compact summary of the week's hours for the roster: collapses a run of
 * consecutive days that share the same hours into `Mon–Fri 06:00–23:00`, so the
 * cell stays scannable. Returns `Closed all week` when every day is shut.
 */
export function formatHoursSummary(hours: LocationHours): string {
  const SHORT: Record<Weekday, string> = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  };

  const groups: { start: Weekday; end: Weekday; text: string }[] = [];
  for (const day of WEEKDAYS) {
    const text = formatDayHours(hours[day]);
    const last = groups[groups.length - 1];
    if (last && last.text === text) {
      last.end = day;
    } else {
      groups.push({ start: day, end: day, text });
    }
  }

  const open = groups.filter((group) => group.text !== CLOSED_LABEL);
  if (open.length === 0) {
    return 'Closed all week';
  }

  return open
    .map((group) => {
      const range =
        group.start === group.end
          ? SHORT[group.start]
          : `${SHORT[group.start]}–${SHORT[group.end]}`;
      return `${range} ${group.text}`;
    })
    .join(', ');
}
