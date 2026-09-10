// Money, in minor units, written the way the locale writes it.
//
// `createNumberFormat` from `@fit/i18n` rather than `Intl.NumberFormat`: no
// runtime we ship carries Georgian locale data, so `Intl` silently answers
// en-US and a Georgian member is shown `GEL 45.00` where the server, the
// invoice and the web portal all say `45,00 ₾`. The app's eslint config bans
// `Intl` and `toLocale*` outright for exactly this reason; this module is the
// one place a price is turned into a string.
//
// Every price the services surface handles is an INTEGER IN MINOR UNITS
// (`priceMinor`, `invoice.amount`) — tetri, cents. Dividing by 100 at the edge,
// once, is what keeps a float out of the arithmetic.

import { createNumberFormat, type Locale } from '@fit/i18n';

/** Minor units per major unit. Both currencies the platform prices in use 100. */
const MINOR_UNITS = 100;

/**
 * `45,00 ₾` / `GEL 45.00` — a price in minor units, in the member's locale.
 *
 * An unknown ISO code falls back to the code itself, which is what CLDR does
 * for a symbol it does not have; the formatter never throws, so no call site
 * needs a guard.
 */
export function formatMoney(minor: number, currency: string, locale: Locale): string {
  return createNumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / MINOR_UNITS);
}
