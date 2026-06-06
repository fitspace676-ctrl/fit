import { describe, expect, it } from 'vitest';
import {
  setTrainerAvailabilitySchema,
  weeklyAvailabilitySchema,
  type WeeklyAvailability,
} from './trainer-availability';

/** Parse a week through the schema so tests share the editor's defaults. */
function week(input: Parameters<typeof weeklyAvailabilitySchema.parse>[0]): WeeklyAvailability {
  return weeklyAvailabilitySchema.parse(input);
}

describe('weeklyAvailabilitySchema', () => {
  it('fills a bare {} to a complete fully-unavailable seven-day week', () => {
    const result = week({});

    expect(Object.keys(result)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    for (const day of Object.values(result)) {
      expect(day).toEqual({ available: false, windows: [] });
    }
  });

  it('defaults absent days while keeping the days that were provided', () => {
    const result = week({
      wed: { available: true, windows: [{ start: '09:00', end: '12:00' }] },
    });

    expect(result.wed).toEqual({ available: true, windows: [{ start: '09:00', end: '12:00' }] });
    expect(result.mon).toEqual({ available: false, windows: [] });
  });

  it('sorts a day’s windows ascending by start time', () => {
    const result = week({
      mon: {
        available: true,
        windows: [
          { start: '14:00', end: '16:00' },
          { start: '09:00', end: '11:00' },
        ],
      },
    });

    expect(result.mon.windows).toEqual([
      { start: '09:00', end: '11:00' },
      { start: '14:00', end: '16:00' },
    ]);
  });

  it('clears windows on a day marked unavailable', () => {
    const result = week({
      mon: { available: false, windows: [{ start: '09:00', end: '12:00' }] },
    });

    expect(result.mon).toEqual({ available: false, windows: [] });
  });

  it('rejects an available day with no windows', () => {
    expect(() => week({ mon: { available: true, windows: [] } })).toThrow();
  });

  it('rejects overlapping windows', () => {
    expect(() =>
      week({
        mon: {
          available: true,
          windows: [
            { start: '09:00', end: '12:00' },
            { start: '11:00', end: '13:00' },
          ],
        },
      }),
    ).toThrow();
  });

  it('allows adjacent (touching) windows', () => {
    const result = week({
      mon: {
        available: true,
        windows: [
          { start: '09:00', end: '12:00' },
          { start: '12:00', end: '15:00' },
        ],
      },
    });

    expect(result.mon.windows).toHaveLength(2);
  });

  it('rejects an end time at or before the start time', () => {
    expect(() =>
      week({ mon: { available: true, windows: [{ start: '12:00', end: '09:00' }] } }),
    ).toThrow();
    expect(() =>
      week({ mon: { available: true, windows: [{ start: '09:00', end: '09:00' }] } }),
    ).toThrow();
  });

  it('rejects a malformed HH:MM time', () => {
    expect(() =>
      week({ mon: { available: true, windows: [{ start: '9:00', end: '17:00' }] } }),
    ).toThrow();
    expect(() =>
      week({ mon: { available: true, windows: [{ start: '24:00', end: '25:00' }] } }),
    ).toThrow();
  });

  it('rejects more than the per-day window cap', () => {
    const windows = Array.from({ length: 7 }, (_unused, i) => ({
      start: `0${i}:00`,
      end: `0${i}:30`,
    }));
    expect(() => week({ mon: { available: true, windows } })).toThrow();
  });
});

describe('setTrainerAvailabilitySchema', () => {
  it('defaults a missing availability to a fully-unavailable week', () => {
    const result = setTrainerAvailabilitySchema.parse({});

    expect(result.availability.mon).toEqual({ available: false, windows: [] });
  });
});
