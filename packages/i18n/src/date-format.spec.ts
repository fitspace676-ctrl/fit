import { describe, expect, it } from 'vitest';
import { createDateTimeFormat, type DateTimeFormatOptions } from './date-format';
import { locales } from '../index';

// Same spine as `number-format.spec.ts`: this formatter exists because browsers
// cannot be trusted with `ka`, but Node's ICU can — so every case asserts our
// output against `Intl`'s.
const NODE_HAS_KA = new Intl.DateTimeFormat('ka').resolvedOptions().locale.startsWith('ka');

/** Dates that between them cover every weekday, both halves of the clock, and
 * a single-digit day, a double-digit day and a year boundary. */
const DATES = [
  new Date('2026-08-06T14:30:00Z'), // Thursday afternoon
  new Date('2026-08-03T09:05:00Z'), // Monday morning
  new Date('2026-08-09T00:00:00Z'), // Sunday midnight
  new Date('2026-01-31T23:59:00Z'), // Saturday, last minute
  new Date('2026-12-25T12:00:00Z'), // Friday noon
  new Date('2027-03-01T00:15:00Z'),
];

/** Every option shape the codebase actually asks for. */
const SHAPES: DateTimeFormatOptions[] = [
  { year: 'numeric', month: 'short', day: 'numeric' },
  { month: 'short', day: 'numeric' },
  { weekday: 'short' },
  { weekday: 'short', day: 'numeric', month: 'short' },
  { weekday: 'long', day: 'numeric', month: 'long' },
  { month: 'long', year: 'numeric' },
  { hour: '2-digit', minute: '2-digit' },
  { dateStyle: 'medium' },
  { day: 'numeric', month: 'short' },
  { day: '2-digit', month: '2-digit', year: 'numeric' },
];

describe('createDateTimeFormat', () => {
  it('runs against a Node that actually has Georgian data', () => {
    expect(NODE_HAS_KA).toBe(true);
  });

  describe.each(locales)('%s', (locale) => {
    it.each(SHAPES)('matches Intl for %o', (options) => {
      const ours = createDateTimeFormat(locale, options);
      const intl = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' });
      for (const date of DATES) {
        expect(ours.format(date), date.toISOString()).toBe(intl.format(date));
      }
    });
  });

  // The two differences a Georgian user notices first, pinned explicitly.
  it('writes the Georgian date day-first and the English one month-first', () => {
    const date = new Date('2026-08-06T14:30:00Z');
    const shape = { year: 'numeric', month: 'short', day: 'numeric' } as const;
    expect(createDateTimeFormat('ka', shape).format(date)).toBe('6 აგვ. 2026');
    expect(createDateTimeFormat('en', shape).format(date)).toBe('Aug 6, 2026');
  });

  it('keeps Georgian on a 24-hour clock and English on a 12-hour one', () => {
    const date = new Date('2026-08-06T14:30:00Z');
    const shape = { hour: '2-digit', minute: '2-digit' } as const;
    expect(createDateTimeFormat('ka', shape).format(date)).toBe('14:30');
    expect(createDateTimeFormat('en', shape).format(date)).toBe('02:30 PM');
  });

  // Everything in the reporting layer is UTC; a formatter that quietly used the
  // viewer's zone would move a bucket to the wrong day.
  it('reads every field in UTC regardless of the host zone', () => {
    const midnight = new Date('2026-08-06T00:30:00Z');
    expect(createDateTimeFormat('en', { day: 'numeric', month: 'short' }).format(midnight)).toBe(
      'Aug 6',
    );
  });

  it('falls back to the platform default for an unshipped locale', () => {
    const date = new Date('2026-08-06T14:30:00Z');
    const shape = { month: 'short', day: 'numeric' } as const;
    expect(createDateTimeFormat('fr-FR', shape).format(date)).toBe(
      createDateTimeFormat('ka', shape).format(date),
    );
    expect(createDateTimeFormat('ka-GE', shape).format(date)).toBe(
      createDateTimeFormat('ka', shape).format(date),
    );
  });
});
