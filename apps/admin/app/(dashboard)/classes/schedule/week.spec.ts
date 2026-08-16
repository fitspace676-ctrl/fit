import { describe, expect, it } from 'vitest';
import { addDays, dayWindow, resolveDayAnchor, toIsoDate } from './week';

/**
 * The day agenda's window maths. The rest of `week.ts` is exercised through the
 * board; these three are new and are the parts that decide *which day* the
 * agenda fetches — the failure they guard against (a gym east of UTC seeing
 * yesterday, or a day that runs 24 hours from UTC midnight) is invisible in the
 * UI until someone in Tbilisi opens the console at 01:00.
 */
describe('day anchors', () => {
  it('honours a well-formed ?week= date as the day itself, not its Monday', () => {
    // 2026-08-15 is a Saturday: a week anchor would snap it back to the 10th.
    expect(toIsoDate(resolveDayAnchor('2026-08-15', new Date('2026-01-01T00:00:00.000Z')))).toBe(
      '2026-08-15',
    );
  });

  it('falls back to today when the param is missing or unparseable', () => {
    const today = new Date('2026-08-15T00:00:00.000Z');
    expect(toIsoDate(resolveDayAnchor(undefined, today))).toBe('2026-08-15');
    expect(toIsoDate(resolveDayAnchor('not-a-date', today))).toBe('2026-08-15');
  });

  it('steps whole days in both directions, across a month boundary', () => {
    const first = new Date('2026-09-01T00:00:00.000Z');
    expect(toIsoDate(addDays(first, -1))).toBe('2026-08-31');
    expect(toIsoDate(addDays(first, 1))).toBe('2026-09-02');
  });
});

describe('dayWindow', () => {
  it('spans the gym-local day, not the UTC one', () => {
    // Tbilisi is UTC+4 year-round: its 15th runs 20:00Z on the 14th → 20:00Z on
    // the 15th. Reading the window in UTC would file the day's late classes
    // under tomorrow.
    expect(dayWindow(new Date('2026-08-15T00:00:00.000Z'), 'Asia/Tbilisi')).toEqual({
      from: '2026-08-14T20:00:00.000Z',
      to: '2026-08-15T20:00:00.000Z',
    });
  });

  it('is exactly one day long for a zone that is UTC', () => {
    expect(dayWindow(new Date('2026-08-15T00:00:00.000Z'), 'UTC')).toEqual({
      from: '2026-08-15T00:00:00.000Z',
      to: '2026-08-16T00:00:00.000Z',
    });
  });

  it('follows a DST shift rather than assuming a fixed offset', () => {
    // London moves to BST on 2026-03-29, so the 30th begins at 23:00Z the day
    // before while the 28th began at midnight.
    expect(dayWindow(new Date('2026-03-28T00:00:00.000Z'), 'Europe/London').from).toBe(
      '2026-03-28T00:00:00.000Z',
    );
    expect(dayWindow(new Date('2026-03-30T00:00:00.000Z'), 'Europe/London').from).toBe(
      '2026-03-29T23:00:00.000Z',
    );
  });
});
