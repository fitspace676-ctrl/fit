import { describe, expect, it } from 'vitest';
import {
  createServiceCategorySchema,
  createServiceSchema,
  listAdminServicesQuerySchema,
  updateServiceSchema,
} from './services-admin';

describe('createServiceSchema', () => {
  it('accepts a personal-training service without a name', () => {
    const parsed = createServiceSchema.parse({
      type: 'PERSONAL_TRAINING',
      staffId: 'gm-1',
      priceMinor: 5000,
    });
    expect(parsed).toMatchObject({
      type: 'PERSONAL_TRAINING',
      durationMinutes: 60,
      description: '',
      categoryId: null,
    });
  });

  it('carries the category id, and reads an empty one as none', () => {
    const base = { type: 'PERSONAL_TRAINING', staffId: 'gm-1', priceMinor: 5000 };
    expect(createServiceSchema.parse({ ...base, categoryId: 'cat-1' }).categoryId).toBe('cat-1');
    expect(createServiceSchema.parse({ ...base, categoryId: '' }).categoryId).toBeNull();
  });

  it('requires a name for a custom service', () => {
    expect(
      createServiceSchema.safeParse({ type: 'CUSTOM', staffId: 'gm-1', priceMinor: 5000 }).success,
    ).toBe(false);
    expect(
      createServiceSchema.safeParse({
        type: 'CUSTOM',
        name: 'Massage',
        staffId: 'gm-1',
        priceMinor: 5000,
      }).success,
    ).toBe(true);
  });

  // The recurrence section was removed on 2026-09-02: a service no longer
  // carries a schedule, and a client still sending one is not an error.
  it('ignores a schedule a stale client still sends', () => {
    const parsed = createServiceSchema.parse({
      type: 'PERSONAL_TRAINING',
      staffId: 'gm-1',
      priceMinor: 5000,
      schedule: { freq: 'WEEKLY' },
    });
    expect('schedule' in parsed).toBe(false);
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

describe('createServiceCategorySchema', () => {
  it('trims the name and bounds it to 60 characters', () => {
    expect(createServiceCategorySchema.parse({ name: '  Boxing ' })).toEqual({ name: 'Boxing' });
    expect(createServiceCategorySchema.safeParse({ name: '' }).success).toBe(false);
    expect(createServiceCategorySchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false);
  });
});
