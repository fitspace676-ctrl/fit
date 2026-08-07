// Formatting helpers shared by the dashboard's hand-built tabs.
//
// Lives beside `charts.tsx` rather than inside any one tab's directory: two tabs
// render the same `YYYY-MM-DD` bucket labels on their axes, and a formatter owned
// by whichever tab happened to need it first couples the others to that tab's
// filename.

import { createDateTimeFormat } from '@fit/i18n';

/**
 * A `YYYY-MM-DD` bucket start as a locale short date. UTC in, UTC out.
 *
 * Both UTC guards are load-bearing: the `T00:00:00.000Z` suffix pins the instant
 * and `timeZone: 'UTC'` pins the rendering. Dropping either shifts every bucket by
 * a day for viewers west of UTC.
 */
export function formatBucket(locale: string, bucket: string): string {
  return createDateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${bucket}T00:00:00.000Z`));
}
