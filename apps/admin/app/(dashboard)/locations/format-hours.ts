// @fit/admin — shared opening-hours formatting for the locations UI.
//
// One place the roster, detail page, and (future) public projection agree on how
// a structured `LocationHours` map renders to human-readable strings, so the
// admin surfaces never drift on the display format.

import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  type DayHours,
  type LocationHours,
  type Weekday,
} from '@fit/types';

/** One day's hours as a display string, e.g. `06:00–23:00` or `Closed`. */
export function formatDayHours(day: DayHours): string {
  return day.closed ? 'Closed' : `${day.open}–${day.close}`;
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

  const open = groups.filter((group) => group.text !== 'Closed');
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
