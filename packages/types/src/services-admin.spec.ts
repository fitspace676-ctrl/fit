import { describe, expect, it } from 'vitest';
import {
  createServiceSchema,
  listAdminServicesQuerySchema,
  serviceScheduleSchema,
  updateServiceSchema,
} from './services-admin';

const schedule = {
  freq: 'WEEKLY',
  weekdays: ['MO', 'WE'],
  startDate: '2026-09-01',
  startTime: '18:00',
};

describe('serviceScheduleSchema', () => {
  it('accepts a weekly schedule with weekdays', () => {
    expect(serviceScheduleSchema.parse(schedule)).toEqual({ ...schedule, until: null });
  });

  it('rejects a weekly schedule with no weekdays', () => {
    const result = serviceScheduleSchema.safeParse({ ...schedule, weekdays: [] });
    expect(result.success).toBe(false);
  });

  it('rejects an "until" before the start date', () => {
    const result = serviceScheduleSchema.safeParse({ ...schedule, until: '2026-08-01' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed time', () => {
    expect(serviceScheduleSchema.safeParse({ ...schedule, startTime: '6pm' }).success).toBe(false);
  });
});

describe('createServiceSchema', () => {
  it('accepts a personal-training service without a name or schedule', () => {
    const parsed = createServiceSchema.parse({
      type: 'PERSONAL_TRAINING',
      staffId: 'gm-1',
      priceMinor: 5000,
    });
    expect(parsed).toMatchObject({
      type: 'PERSONAL_TRAINING',
      durationMinutes: 60,
      description: '',
    });
  });

  it('requires a name and a schedule for a custom service', () => {
    expect(
      createServiceSchema.safeParse({ type: 'CUSTOM', staffId: 'gm-1', priceMinor: 5000 }).success,
    ).toBe(false);
    expect(
      createServiceSchema.safeParse({
        type: 'CUSTOM',
        name: 'Massage',
        staffId: 'gm-1',
        priceMinor: 5000,
        schedule,
      }).success,
    ).toBe(true);
  });

  it('bounds duration to 15–480 minutes', () => {
    const base = { type: 'PERSONAL_TRAINING', staffId: 'gm-1', priceMinor: 100 };
    expect(createServiceSchema.safeParse({ ...base, durationMinutes: 10 }).success).toBe(false);
    expect(createServiceSchema.safeParse({ ...base, durationMinutes: 480 }).success).toBe(true);
  });
});

describe('updateServiceSchema', () => {
  it('has every field optional and no type', () => {
    expect(updateServiceSchema.parse({})).toEqual({});
    expect('type' in updateServiceSchema.shape).toBe(false);
  });
});

describe('listAdminServicesQuerySchema', () => {
  it('defaults to page 1, limit 20, ACTIVE, sorted by name asc', () => {
    expect(listAdminServicesQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      status: 'ACTIVE',
      sort: 'name',
      dir: 'asc',
    });
  });

  it('coerces page numbers from query strings', () => {
    expect(listAdminServicesQuerySchema.parse({ page: '3', limit: '5' })).toMatchObject({
      page: 3,
      limit: 5,
    });
  });
});
