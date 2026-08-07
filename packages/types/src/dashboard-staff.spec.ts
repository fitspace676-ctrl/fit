import { describe, expect, it } from 'vitest';
import {
  dashboardStaffQuerySchema,
  dashboardStaffResponseSchema,
  DEFAULT_STAFF_GRANULARITY,
  TOP_TRAINERS,
} from './dashboard-staff';

function response() {
  return {
    granularity: 'daily',
    kpis: {
      trainersDelivering: 4,
      sessionsDelivered: 62,
      utilizationRate: 48.5,
      scheduledHoursPerWeek: 210,
    },
    sessionsOverTime: [{ label: '2026-08-01', classes: 8, pt: 3 }],
    trainers: [{ name: 'Ana', classes: 8, pt: 3, sessions: 11, hours: 12.5, utilizationRate: 62 }],
    shiftCoverage: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      hours: 30,
      staffCount: 4,
    })),
    gaps: {
      leaveStaffDays: 3,
      staffWithoutShifts: 1,
      trainersWithoutAvailability: 2,
      classesWithoutTrainer: 0,
      invalidShiftSlots: 0,
    },
  };
}

describe('dashboard staff contract', () => {
  it('falls back to the default on an unknown granularity', () => {
    expect(dashboardStaffQuerySchema.parse({ granularity: 'hourly' }).granularity).toBe(
      DEFAULT_STAFF_GRANULARITY,
    );
  });

  it('accepts an omitted query entirely', () => {
    expect(dashboardStaffQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_STAFF_GRANULARITY,
    });
  });

  it('caps the trainer ranking at eight', () => {
    expect(TOP_TRAINERS).toBe(8);
  });

  it('round-trips a full response', () => {
    expect(dashboardStaffResponseSchema.parse(response())).toEqual(response());
  });

  // A trainer with no availability set has nothing to divide by. Reporting that
  // as 0% would call every unconfigured trainer idle.
  it('keeps a null utilization distinct from zero', () => {
    const parsed = dashboardStaffResponseSchema.parse({
      ...response(),
      kpis: { ...response().kpis, utilizationRate: null },
      trainers: [{ name: 'Bo', classes: 1, pt: 0, sessions: 1, hours: 1, utilizationRate: null }],
    });
    expect(parsed.kpis.utilizationRate).toBeNull();
    expect(parsed.trainers[0]?.utilizationRate).toBeNull();
  });

  it('refuses a response missing a gap count', () => {
    const broken = response();
    // @ts-expect-error deleting a required key is the point of the case
    delete broken.gaps.invalidShiftSlots;
    expect(dashboardStaffResponseSchema.safeParse(broken).success).toBe(false);
  });
});
