import { describe, expect, it } from 'vitest';
import { MIDNIGHT_CLOSE, locationHoursSchema, type LocationHours } from '@fit/types';
import { formatHoursSummary, isOpenAt } from './format-hours';

/** A week where every day carries the same window, so only the clock matters. */
function week(open: string, close: string, closed = false): LocationHours {
  return locationHoursSchema.parse(
    Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
        day,
        { closed, open, close },
      ]),
    ),
  );
}

/** A local instant at `HH:MM` on a Wednesday, so the weekday lookup is stable. */
function at(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(2026, 7, 12, h, m, 0);
}

describe('isOpenAt', () => {
  it('is open inside a normal window and closed outside it', () => {
    const hours = week('09:00', '17:00');

    expect(isOpenAt(hours, at('08:59'))).toBe(false);
    expect(isOpenAt(hours, at('09:00'))).toBe(true);
    expect(isOpenAt(hours, at('16:59'))).toBe(true);
    // The window is half-open: at the closing minute the branch is shut.
    expect(isOpenAt(hours, at('17:00'))).toBe(false);
  });

  it('treats a 00:00 close as the end of the day, not the start', () => {
    // Read literally, `00:00` is the earliest time of day and a naive compare
    // reports a gym open 09:00–00:00 as shut all day. It runs to midnight.
    const hours = week('09:00', MIDNIGHT_CLOSE);

    expect(isOpenAt(hours, at('08:59'))).toBe(false);
    expect(isOpenAt(hours, at('09:00'))).toBe(true);
    expect(isOpenAt(hours, at('23:59'))).toBe(true);
  });

  it('is never open on a day marked closed', () => {
    expect(isOpenAt(week('09:00', MIDNIGHT_CLOSE, true), at('12:00'))).toBe(false);
  });
});

describe('formatHoursSummary', () => {
  it('collapses a run of identical days and renders midnight as the end of the day', () => {
    const hours = locationHoursSchema.parse({
      mon: { open: '06:00', close: MIDNIGHT_CLOSE },
      tue: { open: '06:00', close: MIDNIGHT_CLOSE },
      wed: { open: '06:00', close: MIDNIGHT_CLOSE },
      thu: { open: '06:00', close: MIDNIGHT_CLOSE },
      fri: { open: '06:00', close: MIDNIGHT_CLOSE },
      sat: { open: '08:00', close: '22:00' },
      sun: { closed: true },
    });

    // The same strings the public `GET /locations` projection publishes for this
    // week — the roster cell and the visitor's card must not disagree.
    expect(formatHoursSummary(hours)).toBe('Mon\u2013Fri 06:00\u201324:00, Sat 08:00\u201322:00');
  });

  it('reports a week with every day shut', () => {
    expect(formatHoursSummary(week('09:00', '17:00', true))).toBe('Closed all week');
  });
});
