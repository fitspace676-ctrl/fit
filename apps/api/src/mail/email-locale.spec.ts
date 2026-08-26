import { describe, expect, it } from 'vitest';
import {
  formatEmailDate,
  formatEmailMoney,
  parseAcceptLanguage,
  resolveEmailLocale,
} from './email-locale';

describe('resolveEmailLocale', () => {
  it('maps the gym language onto a supported email locale, English for anything else', () => {
    expect(resolveEmailLocale('ka')).toBe('ka');
    expect(resolveEmailLocale('en')).toBe('en');
    expect(resolveEmailLocale('ru')).toBe('en');
    expect(resolveEmailLocale(null)).toBe('en');
  });
});

describe('parseAcceptLanguage', () => {
  it('reads the first supported language tag in preference order', () => {
    expect(parseAcceptLanguage('ka')).toBe('ka');
    expect(parseAcceptLanguage('ka-GE,ka;q=0.9,en;q=0.8')).toBe('ka');
    expect(parseAcceptLanguage('en-US,en;q=0.9')).toBe('en');
    expect(parseAcceptLanguage(['ka-GE'])).toBe('ka');
  });

  it('returns null when nothing supported is named, so the caller can fall back', () => {
    expect(parseAcceptLanguage(undefined)).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
    expect(parseAcceptLanguage('ru-RU,ru;q=0.9')).toBeNull();
  });
});

describe('formatEmailMoney', () => {
  it('formats in the locale of the mail', () => {
    expect(formatEmailMoney(1499, 'USD')).toBe('$14.99');
    expect(formatEmailMoney(1499, 'USD', 'en')).toBe('$14.99');
    expect(formatEmailMoney(12000, 'GEL', 'ka')).toMatch(/120/);
  });

  it('falls back to a plain figure for an unknown currency code', () => {
    expect(formatEmailMoney(1499, 'XXXX', 'ka')).toBe('14.99 XXXX');
  });
});

describe('formatEmailDate', () => {
  it('spells out a business day in the mail language, without shifting the day', () => {
    expect(formatEmailDate('2026-08-25', 'en')).toBe('August 25, 2026');
    expect(formatEmailDate('2026-08-25', 'ka')).toContain('25 აგვისტო');
  });

  it('returns anything that is not a plain date untouched', () => {
    expect(formatEmailDate('today', 'ka')).toBe('today');
  });
});
