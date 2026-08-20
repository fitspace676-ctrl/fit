import { describe, expect, it } from 'vitest';
import { formatClassDateTime, formatNextClass } from './format';

// Tbilisi is UTC+4 with no DST — an instant at 07:35Z is 11:35 on the gym wall.
const TZ = 'Asia/Tbilisi';

/** Translator stub covering the two relative keys the formatter reads. */
const t = (key: string): string => (key === 'relative.today' ? 'დღეს' : 'ხვალ');

describe('formatNextClass', () => {
  // 2026-08-24 is a Monday.
  const monday = '2026-08-24T07:35:00.000Z';

  it('formats a future weekday on the gym clock, per locale', () => {
    const now = new Date('2026-08-20T10:00:00.000Z');
    expect(formatNextClass(monday, t, 'ka', TZ, now)).toBe('ორშ 11:35');
    expect(formatNextClass(monday, t, 'en', TZ, now)).toBe('Mon 11:35');
  });

  it('says today/tomorrow on the gym day, not the viewer day', () => {
    // 21:30Z on the 23rd is already 01:30 on the 24th in Tbilisi — so a class
    // on the 24th gym-day is "tomorrow" relative to a now on the 23rd gym-day.
    const now = new Date('2026-08-23T10:00:00.000Z');
    expect(formatNextClass(monday, t, 'ka', TZ, now)).toBe('ხვალ 11:35');
    const sameDay = new Date('2026-08-23T21:30:00.000Z'); // 24th, 01:30 gym time
    expect(formatNextClass(monday, t, 'ka', TZ, sameDay)).toBe('დღეს 11:35');
  });

  it('returns empty for an invalid instant', () => {
    expect(formatNextClass('nonsense', t, 'ka', TZ, new Date())).toBe('');
  });
});

describe('formatClassDateTime', () => {
  const monday = '2026-08-24T07:35:00.000Z';

  it('formats the full date-time on the gym clock, per locale', () => {
    expect(formatClassDateTime(monday, 'ka', TZ)).toBe('ორშ, 24 აგვ, 11:35');
    expect(formatClassDateTime(monday, 'en', TZ)).toBe('Mon, Aug 24, 11:35');
  });

  it('returns an em dash for absent or invalid instants', () => {
    expect(formatClassDateTime(null, 'ka', TZ)).toBe('-');
    expect(formatClassDateTime('nonsense', 'ka', TZ)).toBe('-');
  });
});
