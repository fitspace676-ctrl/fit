import { describe, expect, it } from 'vitest';
import {
  formatZoned,
  formatZonedShortDate,
  formatZonedTime,
  zonedDayKey,
  zonedRelativeDay,
} from './date-utils';

/**
 * The gym's clock, pinned.
 *
 * These read as fussy until you know what they are guarding. A class is a
 * WALL-CLOCK COMMITMENT at the gym: "Monday 18:00 at Main Floor" is the same
 * appointment whether the member opens the page in Tbilisi or from a phone in
 * Berlin. Three different wrong answers are available to any call site that
 * forgets that — UTC, the viewer's zone, or a mix of the two in one string —
 * and each of them looks completely plausible on screen. The dashboard shipped
 * the UTC one and stated a 12:00 class as 08:00, one click away from the classes
 * page stating it correctly, until this suite existed.
 *
 * `Asia/Tbilisi` is UTC+4 with no DST, which makes the offsets below readable.
 * The DST case uses Europe/Berlin, where the offset actually moves.
 */

const TBILISI = 'Asia/Tbilisi'; // UTC+4, no DST
const BERLIN = 'Europe/Berlin'; // UTC+1 / +2

describe('formatZonedTime', () => {
  it('reads an instant on the gym clock, not UTC', () => {
    // 08:00Z is 12:00 on a Tbilisi wall clock.
    expect(formatZonedTime('2026-08-18T08:00:00.000Z', TBILISI)).toBe('12:00');
  });

  it('pads both halves so a column of times does not jitter', () => {
    expect(formatZonedTime('2026-08-18T05:03:00.000Z', TBILISI)).toBe('09:03');
  });

  it('renders midnight as 00:00 rather than 24:00', () => {
    // The formatter is built with `hourCycle: 'h23'` precisely for this: some
    // engines answer "24" for midnight under `hour12: false`, which would sort a
    // 00:15 class to the bottom of the day instead of the top.
    expect(formatZonedTime('2026-08-17T20:00:00.000Z', TBILISI)).toBe('00:00');
  });

  it('follows the zone across a DST change', () => {
    // Berlin is +02:00 in August and +01:00 in December; the same UTC clock time
    // is therefore a different wall clock in each.
    expect(formatZonedTime('2026-08-18T10:00:00.000Z', BERLIN)).toBe('12:00');
    expect(formatZonedTime('2026-12-18T10:00:00.000Z', BERLIN)).toBe('11:00');
  });
});

describe('zonedDayKey', () => {
  it('puts a late-evening UTC instant on the gym’s NEXT day', () => {
    // 21:30Z on the 17th is 01:30 on the 18th in Tbilisi.
    expect(zonedDayKey('2026-08-17T21:30:00.000Z', TBILISI)).toBe('2026-08-18');
  });

  it('keeps the same instant on the 17th for a UTC reader', () => {
    expect(zonedDayKey('2026-08-17T21:30:00.000Z', 'UTC')).toBe('2026-08-17');
  });
});

describe('zonedRelativeDay', () => {
  const labels = { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' };

  it('says Today for a class later on the gym’s current day', () => {
    // Now: 01:30 on Aug 18 at the gym. The class: 12:00 on Aug 18 at the gym.
    const now = new Date('2026-08-17T21:30:00.000Z');
    expect(zonedRelativeDay('2026-08-18T08:00:00.000Z', now, TBILISI, 'en', labels)).toBe('Today');
  });

  it('does not follow the VIEWER past midnight', () => {
    // The regression this replaced: `now` is still Aug 17 in UTC, so the old
    // local/UTC mix called the same class "Tomorrow" while its own clock label
    // said it was today.
    const now = new Date('2026-08-17T21:30:00.000Z');
    expect(zonedRelativeDay('2026-08-18T08:00:00.000Z', now, TBILISI, 'en', labels)).not.toBe(
      'Tomorrow',
    );
  });

  it('says Tomorrow one gym-day out', () => {
    const now = new Date('2026-08-18T08:00:00.000Z');
    expect(zonedRelativeDay('2026-08-19T08:00:00.000Z', now, TBILISI, 'en', labels)).toBe(
      'Tomorrow',
    );
  });

  it('says Yesterday one gym-day back when the caller supplies the word', () => {
    const now = new Date('2026-08-18T08:00:00.000Z');
    expect(zonedRelativeDay('2026-08-17T08:00:00.000Z', now, TBILISI, 'en', labels)).toBe(
      'Yesterday',
    );
  });

  it('falls through to the weekday when the caller has no Yesterday', () => {
    const now = new Date('2026-08-18T08:00:00.000Z');
    const withoutYesterday = { today: 'Today', tomorrow: 'Tomorrow' };
    // Aug 17 2026 is a Monday.
    expect(zonedRelativeDay('2026-08-17T08:00:00.000Z', now, TBILISI, 'en', withoutYesterday)).toBe(
      'Mon',
    );
  });

  it('names the weekday on the GYM’s calendar, not UTC', () => {
    const now = new Date('2026-08-10T08:00:00.000Z');
    // 20:30Z Friday Aug 14 is already Saturday Aug 15 in Tbilisi.
    expect(zonedRelativeDay('2026-08-14T20:30:00.000Z', now, TBILISI, 'en', labels)).toBe('Sat');
    expect(zonedRelativeDay('2026-08-14T20:30:00.000Z', now, 'UTC', 'en', labels)).toBe('Fri');
  });
});

describe('formatZoned / formatZonedShortDate', () => {
  it('prints the gym’s calendar date for a late-evening instant', () => {
    // The field ORDER is `@fit/i18n`'s business and differs per locale; what
    // this pins is the DAY, which is the thing the zone decides.
    expect(formatZonedShortDate('2026-08-17T21:30:00.000Z', TBILISI, 'en')).toBe('Aug 18');
    expect(formatZonedShortDate('2026-08-17T21:30:00.000Z', 'UTC', 'en')).toBe('Aug 17');
  });

  it('localises through the @fit/i18n tables while staying on the gym clock', () => {
    // The wall-clock-as-UTC carrier is what keeps the Georgian month/weekday
    // tables working; if that broke, this would come back in English.
    const ka = formatZoned('2026-08-17T21:30:00.000Z', TBILISI, 'ka', {
      day: 'numeric',
      month: 'long',
    });
    expect(ka).toContain('18');
    expect(ka).not.toMatch(/[A-Za-z]/);
  });
});
