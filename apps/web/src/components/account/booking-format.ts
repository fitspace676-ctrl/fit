// Small presentation helpers for the member "My bookings" board.
//
// Both are pure functions of their inputs (the request-time `now` is passed in,
// never read from the clock here) so the components that use them stay easy to
// reason about and the day labels are stable for a given render.

import { createDateTimeFormat } from '@fit/i18n';

/** A `t('…')` accessor — the subset of next-intl's translator these helpers use. */
type Translate = (key: string) => string;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight (ms since epoch) of the day containing `ms`. */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * A short label for the day of `iso` relative to `now`: "Today" / "Tomorrow" /
 * "Yesterday" (translated) within ±1 day, otherwise the localized short weekday
 * (e.g. "Sat"). Used by the time blocks and the "Next up" hero.
 */
export function relativeDayLabel(iso: string, now: number, locale: string, t: Translate): string {
  const diffDays = Math.round(
    (startOfLocalDay(new Date(iso).getTime()) - startOfLocalDay(now)) / DAY_MS,
  );
  if (diffDays === 0) return t('relative.today');
  if (diffDays === 1) return t('relative.tomorrow');
  if (diffDays === -1) return t('relative.yesterday');
  return createDateTimeFormat(locale, { weekday: 'short' }).format(new Date(iso));
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

/** A compact `D Mon` date label (e.g. "5 Jun") for the card's detail row. */
export function formatShortDate(iso: string, locale: string): string {
  return createDateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));
}
