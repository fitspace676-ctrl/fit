import { describe, expect, it } from 'vitest';
import {
  MIDNIGHT_CLOSE,
  createLocationSchema,
  dayHoursSchema,
  isValidDayWindow,
  locationHoursSchema,
} from './locations-admin';

describe('isValidDayWindow', () => {
  it('accepts a normal same-day window', () => {
    expect(isValidDayWindow('09:00', '17:00')).toBe(true);
  });

  it('accepts a close of 00:00 as midnight at the END of the day', () => {
    // The reason this exists: `00:00` is lexically the earliest time of day, so a
    // plain `close > open` compare rejected the one value a gym open until
    // midnight would type — leaving 23:59 as the only way to say it.
    expect(isValidDayWindow('09:00', MIDNIGHT_CLOSE)).toBe(true);
    expect(isValidDayWindow('23:00', MIDNIGHT_CLOSE)).toBe(true);
  });

  it('still rejects a window that closes before it opens', () => {
    expect(isValidDayWindow('18:00', '09:00')).toBe(false);
  });

  it('still rejects a zero-length window', () => {
    expect(isValidDayWindow('09:00', '09:00')).toBe(false);
  });
});

describe('dayHoursSchema', () => {
  it('parses a day that closes at midnight', () => {
    expect(dayHoursSchema.parse({ open: '09:00', close: '00:00' })).toMatchObject({
      closed: false,
      open: '09:00',
      close: '00:00',
    });
  });

  it('rejects a closing time before the opening time', () => {
    expect(dayHoursSchema.safeParse({ open: '18:00', close: '09:00' }).success).toBe(false);
  });

  it('ignores the times on a closed day', () => {
    expect(dayHoursSchema.safeParse({ closed: true, open: '18:00', close: '09:00' }).success).toBe(
      true,
    );
  });
});

describe('locationHoursSchema', () => {
  it('accepts a whole week that runs to midnight', () => {
    const week = Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
        day,
        { closed: false, open: '09:00', close: MIDNIGHT_CLOSE },
      ]),
    );

    expect(locationHoursSchema.parse(week).sun.close).toBe(MIDNIGHT_CLOSE);
  });
});

describe('createLocationSchema', () => {
  it('accepts a branch open until midnight', () => {
    const parsed = createLocationSchema.safeParse({
      name: 'Main Floor',
      hours: { mon: { open: '06:00', close: MIDNIGHT_CLOSE } },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.hours.mon.close).toBe(MIDNIGHT_CLOSE);
  });
});
