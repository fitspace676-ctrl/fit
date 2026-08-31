import { describe, expect, it } from 'vitest';
import {
  CLOSED_LABEL,
  MIDNIGHT_CLOSE,
  MIDNIGHT_CLOSE_LABEL,
  createLocationSchema,
  dayHoursSchema,
  formatDayHours,
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

describe('formatDayHours', () => {
  it('renders an open day as an en-dashed range', () => {
    expect(formatDayHours(dayHoursSchema.parse({ open: '06:00', close: '23:00' }))).toBe(
      '06:00\u201323:00',
    );
  });

  it('renders a midnight close as the end of the day, not the start of it', () => {
    // The whole reason this helper is shared: the console rendered `06:00-00:00`
    // while the public projection rendered `06:00-24:00` for the same branch.
    // `00:00` is the storage encoding; on a card it reads as ending before it starts.
    expect(formatDayHours(dayHoursSchema.parse({ open: '06:00', close: MIDNIGHT_CLOSE }))).toBe(
      `06:00\u2013${MIDNIGHT_CLOSE_LABEL}`,
    );
  });

  it('renders a shut day as the Closed label and ignores its times', () => {
    // `dayHoursSchema` does not validate a closed day's times, so nor does this.
    expect(
      formatDayHours(dayHoursSchema.parse({ closed: true, open: '18:00', close: '09:00' })),
    ).toBe(CLOSED_LABEL);
  });

  it('renders a defaulted day, so a bare {} still has a label', () => {
    expect(formatDayHours(dayHoursSchema.parse({}))).toBe('09:00\u201317:00');
  });
});
