import { describe, expect, it, vi } from 'vitest';
import { activeMemberWhere, liveSubscriptionWhere, membershipPlanMix } from './live-membership.util';
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
      status: { in: expect.arrayContaining([status]) },
      currentPeriodStart: { lte: now },
      currentPeriodEnd: { gte: now },
    });
  });

  it.each(['FROZEN', 'EXPIRED', 'CANCELED'])('does not grant active membership for %s', (status) => {
    const where = liveSubscriptionWhere(now);
    expect(where.status).not.toEqual(expect.objectContaining({ in: expect.arrayContaining([status]) }));
  });

  it('excludes lapsed and future periods even if the billing status is still ACTIVE', () => {
    expect(liveSubscriptionWhere(now)).toMatchObject({
      currentPeriodStart: { lte: now },
      currentPeriodEnd: { gte: now },
    });
    expect(activeMemberWhere(now).subscriptions).toEqual({ some: liveSubscriptionWhere(now) });
  });
});

describe('shared paying-member mix', () => {
  it('includes frozen, filters deleted/non-member owners, and counts each person once', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { memberId: 'a', planId: 'p1', plan: { name: 'Monthly' } },
      { memberId: 'a', planId: 'p2', plan: { name: 'Trial' } },
      { memberId: 'b', planId: 'p1', plan: { name: 'Monthly' } },
      { memberId: 'c', planId: null, plan: null },
    ]);
    const db = { subscription: { findMany } } as unknown as TenantPrismaService['client'];
    const result = await membershipPlanMix(db, 'branch-1', now);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [liveSubscriptionWhere(now), { status: 'FROZEN' }],
        member: { role: 'MEMBER', deletedAt: null, locationId: 'branch-1' },
      },
      orderBy: [{ currentPeriodEnd: 'desc' }, { id: 'asc' }],
    }));
    expect(result.total).toBe(3);
    expect(result.plans).toEqual([
      { planId: 'p1', name: 'Monthly', count: 2, color: '#7C3AED' },
      { planId: null, name: 'No plan', count: 1, color: '#EC4899' },
    ]);
  });

  it('returns an empty mix when no membership is in force', async () => {
    const db = {
      subscription: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as TenantPrismaService['client'];
    expect(await membershipPlanMix(db, undefined, now)).toEqual({ total: 0, plans: [] });
  });
});
