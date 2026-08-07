import { describe, expect, it } from 'vitest';
import { createNumberFormat, type NumberFormatOptions } from './number-format';
import { locales } from '../index';

// The suite's spine: this formatter exists BECAUSE browsers cannot be trusted
// with `ka`, but Node's ICU can — so every case below asserts our output against
// `Intl`'s. If CLDR ever changes a separator or a symbol, these fail here rather
// than a Georgian user noticing a stray comma in production.
//
// Guard the guard: if the Node running this suite lacks Georgian data, the
// comparison would be against `en-US` and would pass for the wrong reason.
const NODE_HAS_KA = new Intl.NumberFormat('ka').resolvedOptions().locale.startsWith('ka');

const VALUES = [0, 1, 999, 1000, 1234, 12345, 1234567, 0.5, 12.34, 1234.56, -1234.5, -0.4];

function intl(locale: string, options: NumberFormatOptions, value: number): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

describe('createNumberFormat', () => {
  it('runs against a Node that actually has Georgian data', () => {
    expect(NODE_HAS_KA).toBe(true);
  });

  describe.each(locales)('%s', (locale) => {
    it.each([
      { style: 'decimal' } as const,
      { style: 'decimal', maximumFractionDigits: 0 } as const,
      { style: 'currency', currency: 'GEL', maximumFractionDigits: 0 } as const,
      { style: 'currency', currency: 'GEL' } as const,
      { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } as const,
      { style: 'currency', currency: 'EUR' } as const,
    ])('matches Intl for %o', (options) => {
      for (const value of VALUES) {
        expect(createNumberFormat(locale, options).format(value), `${value}`).toBe(
          intl(locale, options, value),
        );
      }
    });
  });

  // The two rules most easily lost in translation, pinned explicitly so a future
  // edit cannot quietly "simplify" them away.
  it('groups Georgian only from five digits, with a non-breaking space', () => {
    const ka = createNumberFormat('ka');
    expect(ka.format(1234)).toBe('1234');
    expect(ka.format(12345)).toBe('12 345');
    expect(createNumberFormat('en').format(1234)).toBe('1,234');
  });

  it('puts the lari after the amount and the dollar before it', () => {
    expect(createNumberFormat('ka', { style: 'currency', currency: 'GEL' }).format(5)).toBe(
      '5,00 ₾',
    );
    expect(createNumberFormat('en', { style: 'currency', currency: 'USD' }).format(5)).toBe(
      '$5.00',
    );
  });

  // English CLDR has no lari symbol, so it writes the code — with a space, which
  // a bare symbol does not take.
  it('falls back to the ISO code, spaced, for a currency the locale has no symbol for', () => {
    expect(createNumberFormat('en', { style: 'currency', currency: 'GEL' }).format(5)).toBe(
      'GEL 5.00',
    );
    expect(createNumberFormat('en', { style: 'currency', currency: 'XYZ' }).format(5)).toBe(
      'XYZ 5.00',
    );
  });

  // The whole point: a locale tag the platform does not ship must not silently
  // become en-US the way `Intl` does it in a browser.
  it('falls back to the platform default for an unshipped locale', () => {
    expect(createNumberFormat('fr-FR', { style: 'currency', currency: 'GEL' }).format(1)).toBe(
      createNumberFormat('ka', { style: 'currency', currency: 'GEL' }).format(1),
    );
    expect(createNumberFormat('ka-GE').format(12345)).toBe(createNumberFormat('ka').format(12345));
  });

  it('rounds half away from zero, like Intl', () => {
    const money = { style: 'currency', currency: 'GEL', maximumFractionDigits: 0 } as const;
    expect(createNumberFormat('en', money).format(0.5)).toBe(intl('en', money, 0.5));
    expect(createNumberFormat('en', money).format(-0.5)).toBe(intl('en', money, -0.5));
  });

  // A display figure sets its unit apart from its numeral. Which side the unit
  // belongs on is the locale's business, not the caller's.
  describe('parts', () => {
    it('splits a currency into digits and its symbol, per locale', () => {
      expect(
        createNumberFormat('ka', { style: 'currency', currency: 'GEL' }).parts(1234.5),
      ).toEqual({ digits: '1234,50', unit: '₾', unitFirst: false });
      expect(
        createNumberFormat('en', { style: 'currency', currency: 'USD' }).parts(1234.5),
      ).toEqual({ digits: '1,234.50', unit: '$', unitFirst: true });
    });

    it('leaves a plain number whole, with no unit', () => {
      expect(createNumberFormat('en').parts(1234)).toEqual({
        digits: '1,234',
        unit: '',
        unitFirst: false,
      });
    });

    it('keeps the digits and unit reassemblable into the formatted string', () => {
      for (const locale of locales) {
        const fmt = createNumberFormat(locale, { style: 'currency', currency: 'GEL' });
        const { digits, unit, unitFirst } = fmt.parts(42);
        expect(fmt.format(42).replace(/[\s\u00a0]/g, '')).toBe(
          (unitFirst ? unit + digits : digits + unit).replace(/[\s\u00a0]/g, ''),
        );
      }
    });
  });
});
