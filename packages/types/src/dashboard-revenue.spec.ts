import { describe, expect, it } from 'vitest';
import {
  dashboardRevenueQuerySchema,
  dashboardRevenueResponseSchema,
  DEFAULT_PROJECTION_WINDOW,
  DEFAULT_REVENUE_GRANULARITY,
  PROJECTION_WINDOW_DAYS,
} from './dashboard-revenue';

/** A complete response, reused by the cases below. */
function response() {
  return {
    granularity: 'daily',
    projectionWindow: '7',
    currency: 'GEL',
    kpis: { totalRevenue: 120_00, mrr: 80_00, revenuePerMember: 40_00, outstandingTotal: 15_00 },
    revenueOverTime: [{ label: '2026-08-01', recurring: 80_00, oneOff: 40_00 }],
    mrrOverTime: [{ label: '2026-08-01', value: 80_00 }],
    projected: {
      total: 60_00,
      points: [{ label: '2026-08-07', value: 60_00 }],
      atRiskCount: 1,
      atRiskTotal: 20_00,
    },
    outstanding: {
      count: 2,
      total: 15_00,
      overdueCount: 1,
      overdueTotal: 5_00,
      failedCount: 1,
      failedTotal: 10_00,
    },
    byLocation: [{ location: 'Vake', value: 40_00 }],
  };
}

describe('dashboard revenue contract', () => {
  // A hand-edited URL must land on the tab's defaults, not a 400 — the same
  // forgiving rule the sales and members queries apply.
  it('falls back to the defaults on an unknown query value', () => {
    const parsed = dashboardRevenueQuerySchema.parse({
      granularity: 'hourly',
      projectionWindow: '365',
    });
    expect(parsed.granularity).toBe(DEFAULT_REVENUE_GRANULARITY);
    expect(parsed.projectionWindow).toBe(DEFAULT_PROJECTION_WINDOW);
  });

  it('accepts an omitted query entirely', () => {
    expect(dashboardRevenueQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_REVENUE_GRANULARITY,
      projectionWindow: DEFAULT_PROJECTION_WINDOW,
    });
  });

  it('carries an optional branch, absent on "all locations"', () => {
    expect(dashboardRevenueQuerySchema.parse({ locationId: 'loc_1' }).locationId).toBe('loc_1');
    expect(dashboardRevenueQuerySchema.parse({}).locationId).toBeUndefined();
    expect(dashboardRevenueQuerySchema.parse({ locationId: '' }).locationId).toBeUndefined();
  });

  it('maps every projection window to a day count', () => {
    expect(PROJECTION_WINDOW_DAYS).toEqual({ '7': 7, '30': 30 });
  });

  it('round-trips a full response', () => {
    expect(dashboardRevenueResponseSchema.parse(response())).toEqual(response());
  });

  // `null` is "single-location gym, question not applicable"; `[]` is
  // "multi-location with no revenue". The card is dropped for the first and
  // rendered empty for the second, so the two must stay distinguishable.
  it('keeps a null location breakdown distinct from an empty one', () => {
    expect(
      dashboardRevenueResponseSchema.parse({ ...response(), byLocation: null }).byLocation,
    ).toBe(null);
    expect(
      dashboardRevenueResponseSchema.parse({ ...response(), byLocation: [] }).byLocation,
    ).toEqual([]);
  });

  it('refuses a response missing a KPI', () => {
    const broken = response();
    // @ts-expect-error deleting a required key is the point of the case
    delete broken.kpis.mrr;
    expect(dashboardRevenueResponseSchema.safeParse(broken).success).toBe(false);
  });
});
