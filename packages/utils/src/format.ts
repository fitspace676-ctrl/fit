// Locale-aware formatting helpers built on the platform `Intl` APIs.
//
// Every front-end formats dates, numbers, and money the same way by going
// through these helpers, so a `ka` user sees Georgian month names and `₾`
// grouped the Georgian way while an `en` user sees the English equivalents.
// The locale set is shared from `@fit/i18n` so it can't drift from routing.

import type { Locale } from '@fit/i18n';

/** Default currency for the platform — Georgian Lari. */
export const DEFAULT_CURRENCY = 'GEL';

/** Map a platform {@link Locale} to the BCP-47 tag `Intl` expects. */
const BCP47: Record<Locale, string> = {
  ka: 'ka-GE',
  en: 'en-US',
};

function toBcp47(locale: Locale): string {
  return BCP47[locale];
}

/** Accepted date inputs: a `Date`, an epoch-ms number, or an ISO string. */
export type DateInput = Date | number | string;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Format a date for the given locale. Defaults to a medium date style
 * (e.g. `2 ივნ. 2026` for `ka`, `Jun 2, 2026` for `en`); pass `options` to
 * override (time, weekday, etc.).
 */
export function formatDate(
  date: DateInput,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(toBcp47(locale), options).format(toDate(date));
}

/** Format a number with locale-aware grouping and decimal separators. */
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(toBcp47(locale), options).format(value);
}

/**
 * Format a monetary amount (in major units) as locale-aware currency.
 * Defaults to {@link DEFAULT_CURRENCY} (GEL) — pass `currency` for others.
 */
export function formatCurrency(
  amount: number,
  locale: Locale,
  currency: string = DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat(toBcp47(locale), { style: 'currency', currency }).format(amount);
}
