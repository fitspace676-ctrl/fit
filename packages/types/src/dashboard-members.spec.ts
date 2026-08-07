import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPIRING_WINDOW,
  DEFAULT_MEMBERS_GRANULARITY,
  DEFAULT_RETENTION_WINDOW,
  MEMBERSHIP_STATUSES,
  dashboardMembersQuerySchema,
  dashboardMembersResponseSchema,
} from './dashboard-members';

describe('dashboardMembersQuerySchema', () => {
  it('defaults an absent query', () => {
    expect(dashboardMembersQuerySchema.parse({})).toEqual({
      granularity: DEFAULT_MEMBERS_GRANULARITY,
      retentionWindow: DEFAULT_RETENTION_WINDOW,
      expiringWindow: DEFAULT_EXPIRING_WINDOW,
    });
  });

  // A hand-edited URL must land on the defaults, not a 400 — the rule every
  // dashboard query in this repo follows.
  it('falls back to the defaults on unknown values', () => {
    expect(
      dashboardMembersQuerySchema.parse({
        granularity: 'hourly',
        retentionWindow: '45',
        expiringWindow: '99',
      }),
    ).toEqual({ granularity: 'daily', retentionWindow: '30', expiringWindow: '7' });
  });

  it('keeps valid values', () => {
    expect(
      dashboardMembersQuerySchema.parse({
        granularity: 'monthly',
        retentionWindow: '90',
        expiringWindow: '30',
      }),
    ).toEqual({ granularity: 'monthly', retentionWindow: '90', expiringWindow: '30' });
  });
});

describe('MEMBERSHIP_STATUSES', () => {
  // The spec shows all six, not the four the request named: PAST_DUE is a
  // problem staff must react to, and CANCELED is not the same as EXPIRED.
  it('carries all six subscription states, in lifecycle order', () => {
    expect(MEMBERSHIP_STATUSES).toEqual([
      'trial',
      'active',
      'past-due',
      'frozen',
      'canceled',
      'expired',
    ]);
  });
});

describe('dashboardMembersResponseSchema', () => {
  it('accepts a fully populated response', () => {
    const parsed = dashboardMembersResponseSchema.parse({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
      currency: 'GEL',
      kpis: { activeMembers: 42, newSignups: 5, churned: 2, avgLtv: 18_000 },
      activeOverTime: [{ label: '2026-08-01', value: 42 }],
      signupsVsChurn: [{ label: '2026-08-01', signups: 5, churned: 2 }],
      retention: [{ label: '2026-08-01', value: 91.5 }],
      byStatus: [{ status: 'active', count: 30 }],
    });
    expect(parsed.kpis.avgLtv).toBe(18_000);
    expect(parsed.retention[0]?.value).toBe(91.5);
  });

  // A bucket with no denominator is not 0% retention — it is no retention. The
  // chart has to be able to tell them apart, so `null` has to survive the wire.
  it('accepts a null retention value', () => {
    const parsed = dashboardMembersResponseSchema.parse({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
      currency: 'GEL',
      kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
      activeOverTime: [],
      signupsVsChurn: [],
      retention: [{ label: '2026-08-01', value: null }],
      byStatus: [],
    });
    expect(parsed.retention[0]?.value).toBeNull();
  });

  it('rejects a status slice naming a state the enum does not define', () => {
    const result = dashboardMembersResponseSchema.safeParse({
      granularity: 'daily',
      retentionWindow: '30',
      expiringWindow: '7',
      currency: 'GEL',
      kpis: { activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 },
      activeOverTime: [],
      signupsVsChurn: [],
      retention: [],
      byStatus: [{ status: 'lapsed', count: 1 }],
    });
    expect(result.success).toBe(false);
  });
});
