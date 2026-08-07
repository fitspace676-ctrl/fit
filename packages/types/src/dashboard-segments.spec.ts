import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_SEGMENTS,
  dashboardSegmentSchema,
  DEFAULT_DASHBOARD_SEGMENT,
} from './dashboard-segments';

// The catalogue cases that used to live here are GONE with the catalogue itself,
// not merely untested: there is no widget list, no picker and no configurable
// segment left to assert about. `git log -- packages/types/src/dashboard-segments.spec.ts`
// has them if the idea ever returns.
describe('dashboard segments', () => {
  it('lists every tab in display order, overview first', () => {
    expect([...DASHBOARD_SEGMENTS]).toEqual([
      'overview',
      'sales',
      'members',
      'revenue',
      'classes',
      'staff',
    ]);
    expect(DEFAULT_DASHBOARD_SEGMENT).toBe('overview');
  });

  // `?segment=` is user-editable, and the shell parses rather than casts it.
  it('parses a known tab and refuses anything else', () => {
    expect(dashboardSegmentSchema.safeParse('staff').success).toBe(true);
    expect(dashboardSegmentSchema.safeParse('leads').success).toBe(false);
    expect(dashboardSegmentSchema.safeParse(null).success).toBe(false);
  });
});
