'use client';

import { useLocale, useTranslations } from 'next-intl';
import { createDateTimeFormat } from '@fit/i18n';
import type { RecurrenceWeekday, ServiceSchedule } from '@fit/types';

/** The localised words a schedule sentence is built from. */
export interface ScheduleCopy {
  /** `"Every {days}"` — `days` is the comma-joined weekday list. */
  weekly: (days: string) => string;
  daily: string;
  /** `"Once · {date}"` — a one-off with its date. */
  once: (date: string) => string;
  /** `"until {date}"` — the end date, when set. */
  until: (date: string) => string;
  weekday: (day: RecurrenceWeekday) => string;
  /** `"2026-09-01"` → a short date in the active locale. */
  date: (iso: string) => string;
}

/**
 * A schedule in words for the roster row: `"Every Mon, Wed · 18:00"`,
 * `"Daily · 09:00"`, `"Once · 3 Sep 2026 · 18:00"`, each with `" · until <date>"`
 * when an end date is set. The words come from `copy`, so the same sentence
 * reads in Georgian and English; the middle dot is the only separator, never a
 * long dash.
 */
export function formatServiceSchedule(schedule: ServiceSchedule, copy: ScheduleCopy): string {
  const head =
    schedule.freq === 'WEEKLY'
      ? copy.weekly(schedule.weekdays.map(copy.weekday).join(', '))
      : schedule.freq === 'DAILY'
        ? copy.daily
        : copy.once(copy.date(schedule.startDate));
  const until = schedule.until ? ` · ${copy.until(copy.date(schedule.until))}` : '';
  return `${head} · ${schedule.startTime}${until}`;
}

/** `formatServiceSchedule` bound to the active locale's `admin.services.schedule` copy. */
export function useServiceScheduleFormatter(): (schedule: ServiceSchedule) => string {
  const t = useTranslations('admin.services.schedule');
  const locale = useLocale();
  // A `YYYY-MM-DD` parses as UTC midnight, and the formatter reads UTC fields,
  // so the day never shifts with the browser's timezone.
  const dateFormat = createDateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const copy: ScheduleCopy = {
    weekly: (days) => t('weekly', { days }),
    daily: t('daily'),
    once: (date) => t('once', { date }),
    until: (date) => t('until', { date }),
    weekday: (day) => t(`weekday.${day}`),
    date: (iso) => dateFormat.format(new Date(iso)),
  };
  return (schedule) => formatServiceSchedule(schedule, copy);
}
