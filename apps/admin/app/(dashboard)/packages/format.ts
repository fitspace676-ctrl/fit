// @fit/admin — shared money + billing formatting for the package-plans UI.
//
// One place the roster, detail page, and form agree on how a `priceAmount` (an
// integer in the currency's MINOR units, e.g. cents/tetri) maps to and from the
// human-readable major-unit value the staff member sees and types, plus the
// labels for the billing cadence and session count, so the admin surfaces never
// drift on the money/plan format.

import type { PackageBillingInterval } from '@fit/types';

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string, e.g. `$500.00`.
 * Falls back to a plain `500.00 USD` when the currency code isn't one `Intl`
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
 * e.g. `50000` → `500.00`. An empty/`null` value renders as an empty string.
 */
export function minorToInput(amountMinor: number | null): string {
  if (amountMinor === null || Number.isNaN(amountMinor)) {
    return '';
  }
  return (amountMinor / MINOR_PER_MAJOR).toFixed(2);
}

/**
 * Parse a major-unit input string (e.g. `500`) to an integer minor-unit amount
 * (`50000`). A blank or unparseable string yields `0`, so the base price always
 * has a concrete value the API can store.
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

/** The selectable billing cadences and their human labels, in display order. */
export const BILLING_INTERVALS: ReadonlyArray<{ value: PackageBillingInterval; label: string }> = [
  { value: 'MONTH', label: 'Monthly' },
  { value: 'YEAR', label: 'Yearly' },
  { value: 'ONE_TIME', label: 'One-time' },
];

/** The short price suffix per cadence (`/mo`, `/yr`, `one-off` — reference-design copy). */
export function intervalSuffix(interval: PackageBillingInterval): string {
  switch (interval) {
    case 'MONTH':
      return '/mo';
    case 'YEAR':
      return '/yr';
    case 'ONE_TIME':
    default:
      return 'one-off';
  }
}

/** The human label for a cadence, e.g. `Monthly`. */
export function intervalLabel(interval: PackageBillingInterval): string {
  return BILLING_INTERVALS.find((entry) => entry.value === interval)?.label ?? interval;
}

/** Render the session count as a short label, or "Unlimited" when `null`. */
export function sessionLabel(sessionCount: number | null): string {
  if (sessionCount === null) {
    return 'Unlimited sessions';
  }
  return `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'}`;
}
