// Small presentation helpers for the member "My bookings" board.
//
// Every date here is read on the GYM's calendar, like the clock times beside it.
// They were the last mixed-zone pair in the portal: `#304` moved these cards'
// times onto `formatZonedTime`, but the day label above each one was still
// computed from local midnight and the weekday name printed through
// `createDateTimeFormat`, which is UTC by contract. So a card could read
// "Tomorrow · Sat" over a time that belonged to Friday at the gym — three zones
// in one component, disagreeing only near midnight, which is exactly when a
// member checks whether tonight's class is tonight.
//
// Both are pure functions of their inputs (the request-time `now` is passed in,
// never read from the clock here) so the components that use them stay easy to
// reason about and the labels are stable for a given render.

import { formatZonedShortDate, zonedRelativeDay } from '@/src/components/classes/date-utils';

/** A `t('…')` accessor — the subset of next-intl's translator these helpers use. */
type Translate = (key: string) => string;

/**
 * A short label for the day of `iso` relative to `now`: "Today" / "Tomorrow" /
 * "Yesterday" (translated) within ±1 day, otherwise the localized short weekday
 * (e.g. "Sat"). Used by the time blocks and the "Next up" hero.
 */
export function relativeDayLabel(
  iso: string,
  now: number,
  locale: string,
  timeZone: string,
  t: Translate,
): string {
  return zonedRelativeDay(iso, new Date(now), timeZone, locale, {
    today: t('relative.today'),
    tomorrow: t('relative.tomorrow'),
    yesterday: t('relative.yesterday'),
  });
}

/** A compact duration label between two ISO instants, e.g. "45 min" / "1h 30m". */
export function formatDuration(startIso: string, endIso: string): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A compact `D Mon` date label (e.g. "5 Jun") on the gym's calendar. */
export function formatShortDate(iso: string, locale: string, timeZone: string): string {
  return formatZonedShortDate(iso, timeZone, locale);
}
