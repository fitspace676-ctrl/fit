import { describe, expect, it } from 'vitest';
import { addZonedDays, zonedDayStart, zonedIsoDate, zonedParts } from './zoned-time.util';

// Tbilisi: UTC+4 all year, no daylight saving since 2005. The product's default.
const TBILISI = 'Asia/Tbilisi';
// Berlin: +1 in winter, +2 in summer. Here to prove the math is not a fixed
// offset in disguise — Tbilisi alone would pass a "just add four hours" bug.
const BERLIN = 'Europe/Berlin';

describe('zonedParts', () => {
  it('reads an instant as the gym sees it, not as the server does', () => {
    // 15:00 UTC is 19:00 in Tbilisi — the exact four-hour shift that put an
    // evening class in the afternoon column of the demand heatmap.
    expect(zonedParts(new Date('2026-08-07T15:00:00Z'), TBILISI)).toMatchObject({
      year: 2026,
      month: 8,
      day: 7,
      hour: 19,
    });
  });

  it('numbers weekdays from Monday, to match the heatmap rows', () => {
    // 2026-08-07 is a Friday.
    expect(zonedParts(new Date('2026-08-07T12:00:00Z'), TBILISI).weekday).toBe(4);
    expect(zonedParts(new Date('2026-08-09T12:00:00Z'), TBILISI).weekday).toBe(6);
  });

  // The case that made the old code wrong twice over: this instant is Thursday
  // in UTC but already Friday in Tbilisi, so it belongs to a different heatmap
  // ROW as well as a different column.
  it('rolls the weekday over with the local date', () => {
    const at = new Date('2026-08-06T21:00:00Z');
    expect(at.getUTCDay()).toBe(4); // Thursday, UTC
    expect(zonedParts(at, TBILISI)).toMatchObject({ day: 7, hour: 1, weekday: 4 });
  });

  it('renders local midnight as hour 0, never 24', () => {
    expect(zonedParts(new Date('2026-08-06T20:00:00Z'), TBILISI).hour).toBe(0);
  });
});

describe('zonedIsoDate', () => {
  // The revenue-per-day bug: money taken at 01:00 on the 7th in Tbilisi is
  // 21:00 on the 6th in UTC, and was counted against the wrong day.
  it('dates an instant by the gym calendar', () => {
    expect(zonedIsoDate(new Date('2026-08-06T21:00:00Z'), TBILISI)).toBe('2026-08-07');
    expect(zonedIsoDate(new Date('2026-08-06T21:00:00Z'), 'UTC')).toBe('2026-08-06');
  });
});

describe('zonedDayStart', () => {
  it('returns the instant a local day begins', () => {
    // Midnight in Tbilisi is 20:00 the previous day in UTC.
    expect(zonedDayStart('2026-08-07', TBILISI).toISOString()).toBe('2026-08-06T20:00:00.000Z');
    expect(zonedDayStart('2026-08-07', 'UTC').toISOString()).toBe('2026-08-07T00:00:00.000Z');
  });

  it('follows a zone across its own daylight-saving change', () => {
    // Berlin is +1 in January and +2 in July. A fixed-offset implementation gets
    // one of these two wrong, whichever it hardcodes.
    expect(zonedDayStart('2026-01-15', BERLIN).toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(zonedDayStart('2026-07-15', BERLIN).toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });

  // The reason the offset is measured twice. On the spring-forward day the
  // offset near UTC midnight (+1) is not the offset in force at the corrected
  // instant, and a single-pass implementation lands an hour out.
  it('gets the transition day itself right', () => {
    // Europe/Berlin springs forward at 02:00 local on 2026-03-29. The day still
    // begins at 00:00 local, which is 23:00 UTC on the 28th.
    expect(zonedDayStart('2026-03-29', BERLIN).toISOString()).toBe('2026-03-28T23:00:00.000Z');
    // And back an hour on 2026-10-25, which still begins at +2.
    expect(zonedDayStart('2026-10-25', BERLIN).toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });

  it('round-trips through zonedIsoDate', () => {
    for (const day of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(zonedIsoDate(zonedDayStart(day, BERLIN), BERLIN)).toBe(day);
    }
  });
});

describe('addZonedDays', () => {
  it('steps the calendar, including over a month end', () => {
    expect(addZonedDays('2026-08-31', 1, TBILISI)).toBe('2026-09-01');
    expect(addZonedDays('2026-02-28', 1, TBILISI)).toBe('2026-03-01');
  });

  // Adding 86_400_000ms across a DST boundary lands an hour out, and eventually
  // repeats or skips a date — which in a dense series is a duplicated or missing
  // bucket. Stepping the calendar cannot do that.
  it('never skips or repeats a date across a daylight-saving change', () => {
    const seen: string[] = [];
    let cursor = '2026-03-27';
    for (let i = 0; i < 5; i += 1) {
      seen.push(cursor);
      cursor = addZonedDays(cursor, 1, BERLIN);
    }
    expect(seen).toEqual(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);

    const autumn: string[] = [];
    cursor = '2026-10-23';
    for (let i = 0; i < 5; i += 1) {
      autumn.push(cursor);
      cursor = addZonedDays(cursor, 1, BERLIN);
    }
    expect(autumn).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  });
});
