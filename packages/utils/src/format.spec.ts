import { describe, expect, it } from 'vitest';
import { DEFAULT_CURRENCY, formatCurrency, formatDate, formatNumber } from './format';

// A fixed instant so assertions don't depend on the machine's clock or zone.
const SAMPLE = new Date('2026-06-02T00:00:00.000Z');

describe('formatDate', () => {
  it('renders the date in the requested locale', () => {
    const en = formatDate(SAMPLE, 'en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    expect(en).toBe('June 2, 2026');

    const ka = formatDate(SAMPLE, 'ka', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    expect(ka).toContain('2026');
    expect(ka).not.toBe(en);
  });

  it('accepts epoch-ms numbers and ISO strings', () => {
    const opts: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeZone: 'UTC' };
    expect(formatDate(SAMPLE.getTime(), 'en', opts)).toBe(formatDate(SAMPLE, 'en', opts));
    expect(formatDate('2026-06-02T00:00:00.000Z', 'en', opts)).toBe(formatDate(SAMPLE, 'en', opts));
  });
});

describe('formatNumber', () => {
  it('groups thousands per locale', () => {
    expect(formatNumber(1234567.5, 'en')).toBe('1,234,567.5');
  });
});

describe('formatCurrency', () => {
  it('defaults to GEL', () => {
    expect(DEFAULT_CURRENCY).toBe('GEL');
    const formatted = formatCurrency(49.99, 'en');
    expect(formatted).toContain('49.99');
    expect(formatted).toMatch(/GEL|₾/);
  });

  it('honours an explicit currency', () => {
    expect(formatCurrency(1000, 'en', 'USD')).toBe('$1,000.00');
  });
});
