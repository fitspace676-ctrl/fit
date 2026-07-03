import { describe, expect, it } from 'vitest';
import { MAX_SCHEDULE_WINDOW_DAYS, adminScheduleQuerySchema } from './schedule-admin';

const FROM = '2026-06-01T00:00:00.000Z';
const TO = '2026-06-08T00:00:00.000Z';

/** An ISO instant `days` after `FROM`. */
function fromPlusDays(days: number): string {
  return new Date(new Date(FROM).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('adminScheduleQuerySchema', () => {
  it('accepts a well-formed week window', () => {
    const result = adminScheduleQuerySchema.safeParse({ from: FROM, to: TO });
    expect(result.success).toBe(true);
  });

  it('accepts optional trainer / location filters', () => {
    const result = adminScheduleQuerySchema.safeParse({
      from: FROM,
      to: TO,
      trainerId: 'tr-1',
      locationId: 'loc-2',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO bound', () => {
    const result = adminScheduleQuerySchema.safeParse({ from: 'nope', to: TO });
    expect(result.success).toBe(false);
  });

  it('rejects an inverted range on the from field', () => {
    const result = adminScheduleQuerySchema.safeParse({ from: TO, to: FROM });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['from']);
    }
  });

  it('allows a window exactly at the max span', () => {
    const result = adminScheduleQuerySchema.safeParse({
      from: FROM,
      to: fromPlusDays(MAX_SCHEDULE_WINDOW_DAYS),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a window wider than the max span on the to field', () => {
    const result = adminScheduleQuerySchema.safeParse({
      from: FROM,
      to: fromPlusDays(MAX_SCHEDULE_WINDOW_DAYS + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['to']);
    }
  });

  it('rejects an empty trainerId', () => {
    const result = adminScheduleQuerySchema.safeParse({ from: FROM, to: TO, trainerId: '' });
    expect(result.success).toBe(false);
  });
});
