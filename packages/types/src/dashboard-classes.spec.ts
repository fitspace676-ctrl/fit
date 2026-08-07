import { describe, expect, it } from 'vitest';
import {
  dashboardClassesQuerySchema,
  dashboardClassesResponseSchema,
  DEFAULT_CLASSES_GRANULARITY,
  HEATMAP_COLS,
  HEATMAP_ROWS,
} from './dashboard-classes';

function response() {
  return {
    granularity: 'daily',
    kpis: { classesHeld: 12, seatsBooked: 80, noShowRate: 12.5, utilizationRate: 66.7 },
    bookingsOverTime: [{ label: '2026-08-01', value: 80 }],
    attendanceOverTime: [{ label: '2026-08-01', value: 87.5 }],
    utilizationOverTime: [{ label: '2026-08-01', value: 66.7 }],
    ptSessionsOverTime: [{ label: '2026-08-01', value: 4 }],
    topClassTypes: [{ name: 'Yoga', seatsBooked: 40, sessions: 5, utilizationRate: 80 }],
    demandByHour: Array.from({ length: HEATMAP_ROWS }, () =>
      new Array<number>(HEATMAP_COLS).fill(0),
    ),
    markedCoverage: 62.5,
  };
}

describe('dashboard classes contract', () => {
  it('falls back to the default on an unknown granularity', () => {
    expect(dashboardClassesQuerySchema.parse({ granularity: 'hourly' }).granularity).toBe(
      DEFAULT_CLASSES_GRANULARITY,
    );
  });

  it('accepts an omitted query entirely', () => {
    expect(dashboardClassesQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_CLASSES_GRANULARITY,
    });
  });

  it('describes a seven-by-twenty-four grid', () => {
    expect([HEATMAP_ROWS, HEATMAP_COLS]).toEqual([7, 24]);
  });

  it('round-trips a full response', () => {
    expect(dashboardClassesResponseSchema.parse(response())).toEqual(response());
  });

  // `null` is "nothing to measure"; `0` is "measured, and it was zero". A rate
  // that collapses the two would report a 0% attendance nobody observed.
  it('keeps a null rate distinct from zero', () => {
    const parsed = dashboardClassesResponseSchema.parse({
      ...response(),
      kpis: { classesHeld: 0, seatsBooked: 0, noShowRate: null, utilizationRate: null },
      attendanceOverTime: [{ label: '2026-08-01', value: null }],
      markedCoverage: null,
    });
    expect(parsed.kpis.noShowRate).toBeNull();
    expect(parsed.attendanceOverTime[0]?.value).toBeNull();
    expect(parsed.markedCoverage).toBeNull();
  });

  it('refuses a response missing a KPI', () => {
    const broken = response();
    // @ts-expect-error deleting a required key is the point of the case
    delete broken.kpis.utilizationRate;
    expect(dashboardClassesResponseSchema.safeParse(broken).success).toBe(false);
  });
});
