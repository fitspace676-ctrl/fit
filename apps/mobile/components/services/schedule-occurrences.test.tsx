// The recurrence expander and the two date modules under it.
//
// A `.test.tsx` rather than a `.spec.ts` for the reason stated in
// `components/trainers/trainer-filters.test.tsx`: `vitest.config.ts` includes
// only `lib/**`, `hooks/**` and `app/**`, so a spec under `components/` would be
// run by neither runner.
import type { ServiceSchedule } from '@fit/types';

import {
  addDays,
  calendarCarrier,
  formatCalendarDate,
  formatTimeRange,
  groupByDay,
  isSameDay,
  localDayKey,
  startOfWeek,
  wallClock,
  weekDays,
  weekWindow,
  WEEK_DAYS,
} from './date-format';
import { todayLocal, upcomingOccurrences } from './schedule-occurrences';

function schedule(overrides: Partial<ServiceSchedule> = {}): ServiceSchedule {
  return {
    freq: 'WEEKLY',
    weekdays: ['TU', 'TH'],
    startDate: '2026-08-01',
    startTime: '19:00',
    until: null,
    ...overrides,
  };
}

describe('upcomingOccurrences', () => {
  it('lists the weekdays a weekly schedule falls on', () => {
    // 2026-08-03 is a Monday.
    const rows = upcomingOccurrences(schedule(), '2026-08-03', { horizonDays: 14, limit: 12 });
    expect(rows.map((row) => row.date)).toEqual([
      '2026-08-04',
      '2026-08-06',
      '2026-08-11',
      '2026-08-13',
    ]);
    expect(rows.every((row) => row.time === '19:00')).toBe(true);
  });

  it('starts from today when the schedule began in the past', () => {
    const rows = upcomingOccurrences(schedule({ startDate: '2020-01-01' }), '2026-08-03', {
      horizonDays: 7,
    });
    expect(rows[0]?.date).toBe('2026-08-04');
  });

  it('starts from the schedule when it has not begun yet', () => {
    const rows = upcomingOccurrences(schedule({ startDate: '2026-09-01' }), '2026-08-03', {
      horizonDays: 3,
    });
    // The scan begins on 2026-09-01 (a Tuesday), not on today.
    expect(rows[0]?.date).toBe('2026-09-01');
  });

  it('treats `until` as INCLUSIVE', () => {
    const rows = upcomingOccurrences(schedule({ until: '2026-08-06' }), '2026-08-03', {
      horizonDays: 28,
    });
    expect(rows.map((row) => row.date)).toEqual(['2026-08-04', '2026-08-06']);
  });

  it('expands DAILY into every day inside the horizon', () => {
    const rows = upcomingOccurrences(schedule({ freq: 'DAILY', weekdays: [] }), '2026-08-03', {
      horizonDays: 4,
    });
    expect(rows).toHaveLength(4);
  });

  it('yields a ONCE schedule only while it is still ahead', () => {
    const once = schedule({ freq: 'ONCE', weekdays: [], startDate: '2026-08-05' });
    expect(upcomingOccurrences(once, '2026-08-03')).toHaveLength(1);
    expect(upcomingOccurrences(once, '2026-08-05')).toHaveLength(1);
    expect(upcomingOccurrences(once, '2026-08-06')).toHaveLength(0);
  });

  it('stops at `limit`, and counts horizon in DAYS SCANNED not rows found', () => {
    const rows = upcomingOccurrences(schedule({ freq: 'DAILY', weekdays: [] }), '2026-08-03', {
      horizonDays: 60,
      limit: 3,
    });
    expect(rows).toHaveLength(3);
  });
});

describe('todayLocal', () => {
  it('is a zero-padded YYYY-MM-DD in the device calendar', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('calendar dates are NOT shifted', () => {
  it('renders the day the gym typed, in every zone', () => {
    // The bug this pins: running a bare `YYYY-MM-DD` through `wallClock` moves
    // a UTC-midnight carrier backwards for any negative offset, so `2026-08-06`
    // would print "Aug 5" for every member west of Greenwich.
    expect(formatCalendarDate('en', '2026-08-06')).toBe('Aug 6, 2026');
    expect(calendarCarrier('2026-08-06').toISOString()).toBe('2026-08-06T00:00:00.000Z');
  });
});

describe('wallClock and the day key', () => {
  it('reads an instant in the device zone, not in UTC', () => {
    const iso = '2026-08-06T15:30:00.000Z';
    const shifted = wallClock(iso);
    const expected = new Date(iso);
    expect(shifted.getUTCHours()).toBe(expected.getHours());
    expect(shifted.getUTCMinutes()).toBe(expected.getMinutes());
  });

  it('keys a Date and its own ISO string to the same day', () => {
    const now = new Date();
    expect(localDayKey(now)).toBe(localDayKey(now.toISOString()));
    expect(isSameDay(now, new Date(now.getTime()))).toBe(true);
  });
});

describe('formatTimeRange', () => {
  it('joins the two times with an en dash', () => {
    const start = new Date(2026, 7, 6, 18, 30).toISOString();
    const end = new Date(2026, 7, 6, 19, 30).toISOString();
    expect(formatTimeRange('ka', start, end)).toBe('18:30 – 19:30');
  });

  it('is empty for an unparseable instant rather than throwing', () => {
    expect(formatTimeRange('en', 'not-a-date', 'nor-this')).toBe('');
  });
});

describe('groupByDay', () => {
  it('groups by local day, days ascending and items ascending within a day', () => {
    const late = new Date(2026, 7, 6, 20, 0).toISOString();
    const early = new Date(2026, 7, 6, 8, 0).toISOString();
    const next = new Date(2026, 7, 7, 9, 0).toISOString();

    // Deliberately out of order: the API's ordering is not part of the contract.
    const groups = groupByDay([next, late, early], (iso) => iso);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toEqual([early, late]);
    expect(groups[1]?.items).toEqual([next]);
  });

  it('drops an unparseable instant instead of creating an empty heading', () => {
    expect(groupByDay(['nope'], (iso) => iso)).toHaveLength(0);
  });
});

describe('the week window', () => {
  it('starts on Monday, whatever day it is given', () => {
    // 2026-08-06 is a Thursday; 2026-08-09 a Sunday.
    expect(startOfWeek(new Date(2026, 7, 6)).getDate()).toBe(3);
    expect(startOfWeek(new Date(2026, 7, 9)).getDate()).toBe(3);
    expect(startOfWeek(new Date(2026, 7, 3)).getDate()).toBe(3);
  });

  it('is seven local midnights, Monday to Sunday', () => {
    const days = weekDays(startOfWeek(new Date(2026, 7, 6)));
    expect(days).toHaveLength(WEEK_DAYS);
    expect(days.map((day) => day.getDate())).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(days.every((day) => day.getHours() === 0)).toBe(true);
  });

  it('is a half-open [from, to) of exactly seven days — inside the API cap of 62', () => {
    const start = startOfWeek(new Date(2026, 7, 6));
    const { from, to } = weekWindow(start);
    const spanDays = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
    expect(spanDays).toBe(WEEK_DAYS);
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });

  it('steps a whole week at a time without drifting off midnight', () => {
    const start = startOfWeek(new Date(2026, 7, 6));
    const next = addDays(start, WEEK_DAYS);
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(0);
  });
});
