// @fit/admin — shared money formatting + parsing for the products UI.
//
// One place the roster, detail page, and form agree on how a `priceAmount` (an
// integer in the currency's MINOR units, e.g. cents/tetri) maps to and from the
// human-readable major-unit value the staff member sees and types, so the admin
// surfaces never drift on the money format.

import { createNumberFormat, defaultLocale } from '@fit/i18n';

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string, e.g. `$29.99`.
 *
 * `locale` defaults to the platform's rather than the RUNTIME's: this used to pass
 * `undefined`, which formats in whatever locale the host happens to prefer — the
 * server's in Node and the viewer's OS setting in the browser, which is both
 * non-deterministic and a hydration mismatch waiting to happen.
 *
 * An unknown currency code renders as the code itself, the way CLDR does it, so
 * there is no throwing path left to catch.
 */
export function formatPrice(
  amountMinor: number,
  currency: string,
  locale: string = defaultLocale,
): string {
  return createNumberFormat(locale, { style: 'currency', currency }).format(
    amountMinor / MINOR_PER_MAJOR,
  );
}

/**
 * Render a minor-unit amount as the plain major-unit string a number input shows,
 * e.g. `2999` → `29.99`. An empty/`null` value renders as an empty string.
 */
export function minorToInput(amountMinor: number | null): string {
  if (amountMinor === null || Number.isNaN(amountMinor)) {
    return '';
  }
  return (amountMinor / MINOR_PER_MAJOR).toFixed(2);
}

/**
 * The profit margin as a whole-number percentage from a base price and unit cost
 * (both in minor units), or `null` when cost is untracked or the price is zero.
 * `(price - cost) / price`, rounded — the reference product editor's readout.
 */
export function marginPercent(priceMinor: number, costMinor: number | null): number | null {
  if (costMinor === null || priceMinor <= 0) {
    return null;
  }
  return Math.round(((priceMinor - costMinor) / priceMinor) * 100);
}

/**
 * Parse a major-unit input string (e.g. `29.99`) to an integer minor-unit amount
 * (`2999`). A blank or unparseable string yields `null`, so callers can treat
 * "left empty" distinctly (a variant inheriting the base price) from "set to 0".
 */
export function inputToMinor(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  const major = Number(trimmed);
  if (Number.isNaN(major)) {
    return null;
  }
  return Math.round(major * MINOR_PER_MAJOR);
}
