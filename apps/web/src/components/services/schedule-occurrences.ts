import { RECURRENCE_WEEKDAYS, type RecurrenceWeekday, type ServiceSchedule } from '@fit/types';

/** One upcoming run of a service: a calendar date plus its `HH:MM` start. */
export interface ServiceOccurrence {
  /** `YYYY-MM-DD` in the gym's own calendar. */
  date: string;
  /** `HH:MM`, 24-hour, as the schedule stores it. */
  time: string;
}

/** `Date.getUTCDay()` (Sunday = 0) → the schedule's Monday-first weekday code. */
const WEEKDAY_BY_UTC_DAY: readonly RecurrenceWeekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** `YYYY-MM-DD` → the UTC-midnight `Date` for that calendar day. */
function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** The UTC-midnight `Date` → `YYYY-MM-DD`. */
function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Expand a service schedule into the dates it runs on, starting from `today`
 * (the gym's current calendar day) and looking `horizonDays` ahead, capped at
 * `limit` rows. A `ONCE` schedule is its single date, still in the future or
 * not at all; `DAILY` is every day; `WEEKLY` is its chosen weekdays. An end date
 * (`until`) is inclusive. Pure and calendar-only: no time zones are involved
 * because the schedule is a calendar date + wall-clock time by design.
 */
export function upcomingOccurrences(
  schedule: ServiceSchedule,
  today: string,
  { horizonDays = 28, limit = 12 }: { horizonDays?: number; limit?: number } = {},
): ServiceOccurrence[] {
  const first = schedule.startDate > today ? schedule.startDate : today;

  if (schedule.freq === 'ONCE') {
    return schedule.startDate >= today
      ? [{ date: schedule.startDate, time: schedule.startTime }]
      : [];
  }

  const weekdays: readonly RecurrenceWeekday[] =
    schedule.freq === 'WEEKLY' ? schedule.weekdays : RECURRENCE_WEEKDAYS;
  const out: ServiceOccurrence[] = [];
  const cursor = parseDay(first);
  for (let i = 0; i < horizonDays && out.length < limit; i += 1) {
    const day = formatDay(cursor);
    if (schedule.until !== null && day > schedule.until) break;
    if (weekdays.includes(WEEKDAY_BY_UTC_DAY[cursor.getUTCDay()]!)) {
      out.push({ date: day, time: schedule.startTime });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
