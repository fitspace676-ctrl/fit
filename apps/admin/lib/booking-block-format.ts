import { createDateTimeFormat } from '@fit/i18n';
import { zonedClock, zonedIsoDate } from '@/app/(dashboard)/classes/schedule/week';

/** Match the schedule's gym-local dates, including the precise unblock time. */
export function formatBookingBlockDate(iso: string, locale: string, timeZone: string): string {
  const instant = new Date(iso);
  const day = new Date(`${zonedIsoDate(instant, timeZone)}T00:00:00.000Z`);
  const date = createDateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(day);
  return `${date}, ${zonedClock(instant, timeZone)}`;
}
