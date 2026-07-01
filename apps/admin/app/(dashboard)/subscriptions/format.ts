// @fit/admin — shared money + cadence formatting for the subscription-plans UI.
//
// One place the roster, detail page, and form agree on how a `priceAmount` (an
// integer in the currency's MINOR units, e.g. cents/tetri) maps to and from the
// human-readable major-unit value the staff member sees and types, plus the
// labels for the renewal cadence, so the admin surfaces never drift on the
// money/plan format. Mirrors the package-plans `format.ts` (T4.11) minus the
// one-off cadence and session count — a recurring membership has neither.

import type { SubscriptionInterval } from '@fit/types';

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string, e.g. `$50.00`.
 * Falls back to a plain `50.00 USD` when the currency code isn't one `Intl`
 * recognises.
 */
export function formatPrice(amountMinor: number, currency: string): string {
  const major = amountMinor / MINOR_PER_MAJOR;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/**
 * Render a minor-unit amount as the plain major-unit string a number input shows,
 * e.g. `5000` → `50.00`. An empty/`null` value renders as an empty string.
 */
export function minorToInput(amountMinor: number | null): string {
  if (amountMinor === null || Number.isNaN(amountMinor)) {
    return '';
  }
  return (amountMinor / MINOR_PER_MAJOR).toFixed(2);
}

/**
 * Parse a major-unit input string (e.g. `50`) to an integer minor-unit amount
 * (`5000`). A blank or unparseable string yields `0`, so the price always has a
 * concrete value the API can store.
 */
export function inputToMinor(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }
  const major = Number(trimmed);
  if (Number.isNaN(major)) {
    return 0;
  }
  return Math.round(major * MINOR_PER_MAJOR);
}

/** The selectable renewal cadences and their human labels, in display order. */
export const SUBSCRIPTION_INTERVALS: ReadonlyArray<{ value: SubscriptionInterval; label: string }> =
  [
    { value: 'MONTH', label: 'Monthly' },
    { value: 'YEAR', label: 'Yearly' },
  ];

/** The short price suffix per cadence (`/ mo`, `/ yr`). */
export function intervalSuffix(interval: SubscriptionInterval): string {
  switch (interval) {
    case 'YEAR':
      return '/ yr';
    case 'MONTH':
    default:
      return '/ mo';
  }
}

/** The human label for a cadence, e.g. `Monthly`. */
export function intervalLabel(interval: SubscriptionInterval): string {
  return SUBSCRIPTION_INTERVALS.find((entry) => entry.value === interval)?.label ?? interval;
}
