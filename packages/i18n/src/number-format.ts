// Locale-correct number and money formatting that does NOT depend on the runtime
// having the locale's data.
//
// The bug this exists for: `Intl.NumberFormat('ka', …)` resolves to `ka` in Node
// (full ICU) and to `en-US` in Chromium, which ships no Georgian locale data. So
// the same component renders `0 ₾` on the server and `GEL 0` in the browser —
// a hydration mismatch on every money figure, and, worse, English formatting
// shown to Georgian users in every browser that lacks the data.
//
// Delegating to `Intl` is therefore not an option for this product's primary
// locale. The rules below are CLDR's, transcribed for the two locales the
// platform ships, and `number-format.spec.ts` asserts them against Node's own
// ICU — so if this table ever drifts from CLDR, the suite says so rather than a
// user noticing a stray comma.
//
// Everything here is pure and synchronous: identical output in Node, in the
// browser, and in a test, which is the whole point.

import { defaultLocale, isLocale, type Locale } from '../index';

/** How one locale writes a number. Transcribed from CLDR; pinned by the spec. */
interface NumberShape {
  group: string;
  decimal: string;
  /**
   * How many integer digits a number needs before grouping starts. CLDR's
   * `minimumGroupingDigits`: Georgian is 2, so `1234` is bare and `12345` groups.
   */
  minGroupingDigits: number;
  /** Where the currency sits, and what separates it from the digits. */
  currency: { position: 'prefix' | 'suffix'; separator: string };
}

/** A non-breaking space — CLDR's separator, and not the same character as ' '. */
const NBSP = ' ';

const SHAPES: Record<Locale, NumberShape> = {
  ka: {
    group: NBSP,
    decimal: ',',
    minGroupingDigits: 2,
    currency: { position: 'suffix', separator: NBSP },
  },
  en: {
    group: ',',
    decimal: '.',
    minGroupingDigits: 1,
    currency: { position: 'prefix', separator: '' },
  },
};

/**
 * What each currency is written as, per locale. A currency absent here falls back
 * to its ISO code, which is exactly what CLDR does for an unknown symbol.
 *
 * `en` deliberately writes GEL as its code: English CLDR has no lari symbol, and
 * inventing one would make the two locales disagree about the same amount.
 */
const SYMBOLS: Record<Locale, Record<string, string>> = {
  ka: { GEL: '₾', USD: 'US$', EUR: '€', GBP: '£' },
  en: { USD: '$', EUR: '€', GBP: '£' },
};

/**
 * Whether a prefix currency needs a space before the digits. CLDR puts none after
 * a symbol (`$1,234`) and one after a code (`GEL 1,234`).
 */
function prefixSeparator(symbol: string): string {
  return /^[A-Z]{3}$/.test(symbol) ? NBSP : '';
}

export interface NumberFormatOptions {
  style?: 'decimal' | 'currency';
  /** ISO-4217 code. Required when `style` is `currency`. */
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * A formatter with `Intl.NumberFormat`'s `format` method, so a call site swaps one
 * constructor for another and nothing else.
 */
export interface NumberFormatter {
  format(value: number): string;
}

/** Round half away from zero, the rule `Intl` applies by default. */
function roundHalfExpand(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded / factor;
}

/**
 * Group an integer string per the locale's rule.
 *
 * The threshold is `3 + minGroupingDigits`: English groups from four digits
 * (`1,234`), Georgian from five (`1234` bare, `12 345` grouped).
 */
function group(digits: string, shape: NumberShape): string {
  if (digits.length < 3 + shape.minGroupingDigits) return digits;
  let out = '';
  for (let i = digits.length; i > 0; i -= 3) {
    const chunk = digits.slice(Math.max(0, i - 3), i);
    out = out === '' ? chunk : `${chunk}${shape.group}${out}`;
  }
  return out;
}

/**
 * Build a formatter for `locale`, falling back to the platform default for a
 * locale the platform does not ship.
 *
 * Drop-in for `new Intl.NumberFormat(locale, options)` across the console — see
 * this module's header for why `Intl` cannot be trusted with `ka`.
 */
export function createNumberFormat(
  locale: string,
  options: NumberFormatOptions = {},
): NumberFormatter {
  const resolved: Locale = isLocale(locale) ? locale : baseLocale(locale);
  const shape = SHAPES[resolved];
  const isCurrency = options.style === 'currency';

  const maximumFractionDigits = options.maximumFractionDigits ?? (isCurrency ? 2 : 3);
  // `Intl` clamps the minimum down to the maximum rather than throwing, so a
  // currency asked for whole units prints whole units.
  const minimumFractionDigits = Math.min(
    options.minimumFractionDigits ?? (isCurrency ? 2 : 0),
    maximumFractionDigits,
  );

  return {
    format(value: number): string {
      const rounded = roundHalfExpand(value, maximumFractionDigits);
      const negative = rounded < 0 || Object.is(rounded, -0);
      const absolute = Math.abs(rounded);

      const fixed = absolute.toFixed(maximumFractionDigits);
      const [whole = '0', decimals = ''] = fixed.split('.');
      const trimmed = decimals.replace(/0+$/, '');
      const fraction = trimmed.padEnd(minimumFractionDigits, '0');

      let digits = group(whole, shape);
      if (fraction !== '') digits += shape.decimal + fraction;

      if (!isCurrency) return negative ? `-${digits}` : digits;

      const code = options.currency ?? '';
      const symbol = SYMBOLS[resolved][code] ?? code;
      // The sign sits OUTSIDE a prefixed currency (`-$5`, not `$-5`) and inside a
      // suffixed one (`-5 ₾`) — CLDR's own placement, pinned by the spec.
      if (shape.currency.position === 'suffix') {
        const signed = negative ? `-${digits}` : digits;
        return `${signed}${shape.currency.separator}${symbol}`;
      }
      const amount = `${symbol}${prefixSeparator(symbol)}${digits}`;
      return negative ? `-${amount}` : amount;
    },
  };
}

/** The shipped locale a tag like `ka-GE` belongs to, else the platform default. */
function baseLocale(tag: string): Locale {
  const base = tag.split('-')[0] ?? '';
  return isLocale(base) ? base : defaultLocale;
}
