import { describe, expect, it, vi } from 'vitest';
import {
  activeMemberWhere,
  frozenMemberWhere,
  liveSubscriptionWhere,
  membershipPlanMix,
} from './live-membership.util';
import type { TenantPrismaService } from './prisma/tenant-prisma.service';

const now = new Date('2026-11-24T12:00:00Z');

describe('live membership query contract', () => {
  it('requires an ACTIVE non-deleted MEMBER account at the selected home branch', () => {
    const where = activeMemberWhere(now, 'branch-1');
    expect(where).toEqual({
      role: 'MEMBER',
      deletedAt: null,
      status: 'ACTIVE',
      locationId: 'branch-1',
      subscriptions: { some: liveSubscriptionWhere(now) },
    });
    // A live subscription must never let a suspended or deleted account through.
    expect(where.status).not.toBe('SUSPENDED');
    expect(where.deletedAt).toBeNull();
    expect(activeMemberWhere(now)).not.toHaveProperty('locationId');
  });

  it.each(['TRIAL', 'ACTIVE', 'PAST_DUE'])('accepts a current %s subscription', (status) => {
    expect(liveSubscriptionWhere(now)).toMatchObject({
      status: { in: expect.arrayContaining([status]) as unknown },
      currentPeriodStart: { lte: now },
      currentPeriodEnd: { gte: now },
    });
  });

  it.each(['FROZEN', 'EXPIRED', 'CANCELED'])(
    'does not grant active membership for %s',
    (status) => {
      const where = liveSubscriptionWhere(now);
      expect(JSON.stringify(where.status)).not.toContain(status);
    },
  );

  it('excludes lapsed and future periods even if the billing status is still ACTIVE', () => {
    expect(liveSubscriptionWhere(now)).toMatchObject({
      currentPeriodStart: { lte: now },
      currentPeriodEnd: { gte: now },
    });
    expect(activeMemberWhere(now).subscriptions).toEqual({ some: liveSubscriptionWhere(now) });
  });
});

describe('frozen member query contract', () => {
  it('is a frozen membership on an account not suspended, with nothing in force', () => {
    expect(frozenMemberWhere(now, 'branch-1')).toEqual({
      role: 'MEMBER',
      deletedAt: null,
      locationId: 'branch-1',
      status: { not: 'SUSPENDED' },
      subscriptions: { some: { status: 'FROZEN' } },
      // Never overlaps the active population: active + frozen = paying.
      NOT: { status: 'ACTIVE', subscriptions: { some: liveSubscriptionWhere(now) } },
    });
  });
});

describe('shared paying-member mix', () => {
  it('counts active then frozen people once each, so the slices sum to active + frozen', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { memberId: 'a', planId: 'p1', status: 'ACTIVE', plan: { name: 'Monthly' } },
      // `a` also holds a frozen membership: still counted once, as active.
      { memberId: 'a', planId: 'p2', status: 'FROZEN', plan: { name: 'Annual' } },
      { memberId: 'b', planId: 'p1', status: 'PAST_DUE', plan: { name: 'Monthly' } },
      { memberId: 'c', planId: null, status: 'FROZEN', plan: null },
    ]);
    const db = { subscription: { findMany } } as unknown as TenantPrismaService['client'];
    const result = await membershipPlanMix(db, 'branch-1', now);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          member: { role: 'MEMBER', deletedAt: null, locationId: 'branch-1' },
          OR: [
            { ...liveSubscriptionWhere(now), member: { status: 'ACTIVE' } },
            { status: 'FROZEN', member: { status: { not: 'SUSPENDED' } } },
          ],
        },
        orderBy: [{ currentPeriodEnd: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(result).toMatchObject({ total: 3, active: 2, frozen: 1 });
    expect(result.total).toBe(result.active + result.frozen);
    expect(result.plans).toEqual([
      { planId: 'p1', name: 'Monthly', count: 2, color: '#7C3AED' },
      { planId: null, name: 'No plan', count: 1, color: '#EC4899' },
    ]);
  });

  it('returns an empty mix when no membership is in force', async () => {
    const db = {
      subscription: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as TenantPrismaService['client'];
    expect(await membershipPlanMix(db, undefined, now)).toEqual({
      total: 0,
      plans: [],
      active: 0,
      frozen: 0,
    });
  });
});
