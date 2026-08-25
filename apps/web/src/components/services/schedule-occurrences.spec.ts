import { describe, expect, it } from 'vitest';
import type { ServiceSchedule } from '@fit/types';
import { upcomingOccurrences } from './schedule-occurrences';

// 2026-09-01 is a Tuesday.
const weekly: ServiceSchedule = {
  freq: 'WEEKLY',
  weekdays: ['MO', 'WE'],
  startDate: '2026-09-01',
  startTime: '18:00',
  until: null,
};

describe('upcomingOccurrences', () => {
  it('lists the chosen weekdays from the start date, in order', () => {
    expect(upcomingOccurrences(weekly, '2026-08-25', { limit: 3 })).toEqual([
      { date: '2026-09-02', time: '18:00' },
      { date: '2026-09-07', time: '18:00' },
      { date: '2026-09-09', time: '18:00' },
    ]);
  });

  it('starts from today once the schedule is already running', () => {
    const [first] = upcomingOccurrences(weekly, '2026-09-08', { limit: 1 });
    expect(first).toEqual({ date: '2026-09-09', time: '18:00' });
  });

  it('stops at the end date (inclusive)', () => {
    expect(upcomingOccurrences({ ...weekly, until: '2026-09-07' }, '2026-09-01')).toEqual([
      { date: '2026-09-02', time: '18:00' },
      { date: '2026-09-07', time: '18:00' },
    ]);
  });

  it('runs every day for a daily schedule and respects the horizon', () => {
    const daily = { ...weekly, freq: 'DAILY' as const, weekdays: [] };
    expect(upcomingOccurrences(daily, '2026-09-01', { horizonDays: 3 })).toEqual([
      { date: '2026-09-01', time: '18:00' },
      { date: '2026-09-02', time: '18:00' },
      { date: '2026-09-03', time: '18:00' },
    ]);
  });

  it('shows a one-off only while it is still ahead', () => {
    const once = { ...weekly, freq: 'ONCE' as const, weekdays: [] };
    expect(upcomingOccurrences(once, '2026-08-25')).toEqual([
      { date: '2026-09-01', time: '18:00' },
    ]);
    expect(upcomingOccurrences(once, '2026-09-02')).toEqual([]);
  });
});
