'use client';

// The header period, as the segment tabs carry it.
//
// The overview resolves `?period=` (+ `from`/`to`) into a concrete window and
// echoes it; the shell hands that to every segment tab, which sends it to its API
// so the tab covers the SAME days as the overview, and names those days in its
// captions instead of a rolling "Last 30 days".

import { useLocale, useTranslations } from 'next-intl';
import type { DashboardPeriod, DashboardResolvedPeriod } from '@fit/types';

/** The query fields a segment action takes for the header period. */
export interface SegmentPeriodQuery {
  period?: DashboardPeriod;
  from?: string;
  to?: string;
}

/** The period fields to send with a segment request (none when there is no period). */
export function periodQuery(period: DashboardResolvedPeriod | undefined): SegmentPeriodQuery {
  return period === undefined ? {} : { period: period.period, from: period.from, to: period.to };
}

/** A cache-key fragment that changes whenever the window does. */
export function periodKey(period: DashboardResolvedPeriod | undefined): string {
  return period === undefined ? '' : `${period.period}:${period.from}:${period.to}`;
}

/**
 * The caption naming the window a response covers — "This month · 1 – 30 Nov" —
 * or `undefined` when the response came from the rolling window (no period),
 * which lets the card fall back to its own "Last 30 days" label.
 */
export function usePeriodWindowLabel(
  period: DashboardResolvedPeriod | null | undefined,
): string | undefined {
  const locale = useLocale();
  const t = useTranslations('admin.dashboard.periodWindow');
  if (!period) return undefined;
  // Calendar days, not instants: format them as the dates they are, in UTC, so a
  // browser in another zone cannot shift a day across midnight.
  const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
  const format = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(period.period === 'custom' && !sameYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
  const day = (iso: string) => format.format(new Date(`${iso}T00:00:00.000Z`));
  return t(period.period, { from: day(period.from), to: day(period.to) });
}
