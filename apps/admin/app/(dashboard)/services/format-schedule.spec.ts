import { describe, expect, it } from 'vitest';
import type { ServiceSchedule } from '@fit/types';
import { formatServiceSchedule, type ScheduleCopy } from './format-schedule';

/** English copy, as `admin.services.schedule` spells it. */
const copy: ScheduleCopy = {
  weekly: (days) => `Every ${days}`,
  daily: 'Daily',
  once: (date) => `Once · ${date}`,
  until: (date) => `until ${date}`,
  weekday: (day) =>
    ({ MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' })[day],
  date: (iso) => iso,
};

const weekly: ServiceSchedule = {
  freq: 'WEEKLY',
  weekdays: ['MO', 'WE'],
  startDate: '2026-09-01',
  startTime: '18:00',
  until: null,
};

describe('formatServiceSchedule', () => {
  it('spells a weekly schedule', () => {
    expect(formatServiceSchedule(weekly, copy)).toBe('Every Mon, Wed · 18:00');
  });

  it('spells a daily schedule', () => {
    expect(formatServiceSchedule({ ...weekly, freq: 'DAILY', weekdays: [] }, copy)).toBe(
      'Daily · 18:00',
    );
  });

  it('spells a one-off with its date', () => {
    expect(formatServiceSchedule({ ...weekly, freq: 'ONCE', weekdays: [] }, copy)).toBe(
      'Once · 2026-09-01 · 18:00',
    );
  });

  it('appends the end date when set', () => {
    expect(formatServiceSchedule({ ...weekly, until: '2026-12-31' }, copy)).toBe(
      'Every Mon, Wed · 18:00 · until 2026-12-31',
    );
  });

  it('never uses a long dash', () => {
    expect(formatServiceSchedule({ ...weekly, until: '2026-12-31' }, copy)).not.toMatch(/[—–]/);
  });
});
