// @fit/admin — shared money formatting + parsing for the products UI.
//
// One place the roster, detail page, and form agree on how a `priceAmount` (an
// integer in the currency's MINOR units, e.g. cents/tetri) maps to and from the
// human-readable major-unit value the staff member sees and types, so the admin
// surfaces never drift on the money format.

/** Assumed minor units per major unit (USD/EUR/GEL — all two-decimal). */
const MINOR_PER_MAJOR = 100;

/**
 * Format a minor-unit amount as a localized currency string, e.g. `$29.99`. Falls
 * back to a plain `29.99 USD` when the currency code isn't one `Intl` recognises.
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
