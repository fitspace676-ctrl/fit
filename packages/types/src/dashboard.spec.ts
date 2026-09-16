import { describe, expect, it } from 'vitest';
import {
  dashboardOverviewQuerySchema,
  dashboardSecondaryKpisSchema,
  dashboardRecentMemberSchema,
} from './dashboard';

describe('dashboardOverviewQuerySchema', () => {
  it('carries an optional branch, absent on "all locations"', () => {
    expect(dashboardOverviewQuerySchema.parse({ locationId: 'loc_1' }).locationId).toBe('loc_1');
    expect(dashboardOverviewQuerySchema.parse({}).locationId).toBeUndefined();
  });

  // The file's own degradation contract: a stale branch in a bookmarked URL falls
  // back to every branch rather than 400-ing the dashboard.
  it('degrades an unusable branch id to all branches', () => {
    expect(dashboardOverviewQuerySchema.parse({ locationId: '' }).locationId).toBeUndefined();
  });
});

describe('dashboardSecondaryKpisSchema', () => {
  it('accepts the six secondary KPI figures', () => {
    const parsed = dashboardSecondaryKpisSchema.parse({
      activeMembers: 120,
      revenueThisMonth: { value: 500000, deltaPct: 25 },
      overduePayments: 7,
      classesToday: 9,
      expiringSoon: 15,
      renewalsDue: 30,
    });
    expect(parsed.revenueThisMonth.deltaPct).toBe(25);
    expect(parsed.activeMembers).toBe(120);
  });

  it('rejects a negative count', () => {
    expect(() =>
      dashboardSecondaryKpisSchema.parse({
        activeMembers: -1,
        revenueThisMonth: { value: 0, deltaPct: null },
        overduePayments: 0,
        classesToday: 0,
        expiringSoon: 0,
        renewalsDue: 0,
      }),
    ).toThrow();
  });
});

describe('dashboardRecentMemberSchema', () => {
  it('accepts a member with no plan and no expiry', () => {
    const parsed = dashboardRecentMemberSchema.parse({
      id: 'gm_1',
      name: 'Sarah Johnson',
      email: 'sarah.j@email.com',
      planName: null,
      status: 'ACTIVE',
      joinedAt: '2026-07-01T10:00:00.000Z',
      expiresAt: null,
    });
    expect(parsed.planName).toBeNull();
    expect(parsed.expiresAt).toBeNull();
  });
});
