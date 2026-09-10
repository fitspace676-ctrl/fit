// @fit/mobile — money, for the shop.
//
// Every price the shop renders is an INTEGER IN MINOR UNITS on the wire
// (`priceAmount`, `unitPrice`, `lineTotal`, `subtotal`, `total`) — see
// `packages/types/src/cart.ts`. Dividing by 100 and formatting is the app's
// job, not the design system's: `Money` takes an already-formatted string
// precisely because formatting needs the locale, the currency and the
// minor-unit convention, none of which `@fit/ui-mobile` may know.
//
// `createNumberFormat`, never `Intl`. The lint rule in `eslint.config.mjs`
// enforces it, and the reason is in `packages/i18n/src/number-format.ts`:
// Hermes ships no Georgian locale data, so `Intl.NumberFormat('ka', …)`
// silently answers in en-US and shows `GEL 89.00` to a Georgian member while
// the server rendered `89,00 ₾`.
//
// ## Why there are two formatters and not one
//
// `Money` requires an `accessibilityLabel` because VoiceOver reads a tabular
// monospace run character by character: "89,00 ₾" becomes "eight nine comma
// zero zero lari sign", on the one number a member will ask to have read back
// before spending money. {@link MoneyFormatter.spoken} is the plain-digits form
// with the ISO code after it — "89 GEL" — which every screen reader on both
// platforms says as a quantity.
//
// The code, not the symbol, is deliberate: `SYMBOLS` in `@fit/i18n` maps GEL to
// `₾` for `ka`, and a glyph a screen reader does not know is a glyph it spells
// or skips. Joining a number to an ISO 4217 code with a space is arithmetic
// notation rather than a sentence, so it needs no catalogue key.

import { createNumberFormat, type NumberFormatter } from '@fit/i18n';
import { useMemo } from 'react';

import { useI18n } from '../../providers/I18nProvider';

/**
 * The currency to assume before anything priced has loaded.
 *
 * `useCart(currency)` needs one on its very first render — an EMPTY cart has no
 * line to read a currency off, and the gym's currency is not in the JWT claims
 * (`ActiveGym` is `{gymId, role, userId}`). The moment either the product
 * listing or a non-empty cart arrives, {@link shopCurrency} takes over with the
 * real value. Only ever visible as the unit on a `0` total, and the platform
 * sells in GEL.
 */
export const FALLBACK_CURRENCY = 'GEL';

/** Minor units (tetri / cents) per major unit. Integer money, everywhere. */
const MINOR_UNITS = 100;

/** Formats one gym's prices, in the reader's locale. */
export interface MoneyFormatter {
  /** `8900, 'GEL'` → `"89,00 ₾"` in `ka`, `"GEL 89.00"` in `en`. */
  format(minorUnits: number, currency: string): string;
  /** The spoken form of the same amount — `"89 GEL"`. See this file's header. */
  spoken(minorUnits: number, currency: string): string;
}

/**
 * A money formatter bound to the active locale.
 *
 * Formatters are cached per currency inside the memo: a cart screen formats the
 * same currency a dozen times per render, and `createNumberFormat` resolves a
 * shape table and a symbol table on every call.
 */
export function useMoney(): MoneyFormatter {
  const { locale } = useI18n();

  return useMemo<MoneyFormatter>(() => {
    const priced = new Map<string, NumberFormatter>();
    // One decimal formatter for every currency: the digits are the same, only
    // the unit differs, and the unit is appended rather than formatted.
    const plain = createNumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    function priceFormatter(currency: string): NumberFormatter {
      const cached = priced.get(currency);
      if (cached) return cached;
      const created = createNumberFormat(locale, { style: 'currency', currency });
      priced.set(currency, created);
      return created;
    }

    return {
      format: (minorUnits, currency) => priceFormatter(currency).format(minorUnits / MINOR_UNITS),
      spoken: (minorUnits, currency) => `${plain.format(minorUnits / MINOR_UNITS)} ${currency}`,
    };
  }, [locale]);
}
