import { describe, expect, it, vi } from 'vitest';
import { AutomationFactsService, ageAt } from './automation-facts.service';
import type { PrismaService } from '../prisma/prisma.service';

const now = new Date('2026-07-08T12:00:00Z');
function setup(
  options: {
    missing?: boolean;
    live?: boolean;
    history?: boolean;
    override?: 'GUEST';
    checkin?: boolean;
  } = {},
) {
  const member = vi.fn().mockResolvedValue(
    options.missing
      ? null
      : {
          gender: 'FEMALE',
          dateOfBirth: new Date('1996-07-09'),
          status: 'ACTIVE',
          kindOverride: options.override ?? null,
          locationId: 'loc-1',
          tags: ['vip'],
          joinedAt: new Date('2026-06-08T12:00:00Z'),
        },
  );
  const sub = vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(
      where.status
        ? options.live
          ? {
              planId: 'plan-1',
              status: 'ACTIVE',
              currentPeriodEnd: new Date('2026-07-10T12:00:00Z'),
            }
          : null
        : options.history
          ? { id: 'old-sub' }
          : null,
    ),
  );
  const last = vi
    .fn()
    .mockResolvedValue(options.checkin ? { checkedInAt: new Date('2026-07-06T12:00:00Z') } : null);
  const count = vi.fn().mockResolvedValue(options.checkin ? 12 : 0);
  const prisma = {
    client: {
      gymMember: { findFirst: member },
      subscription: { findFirst: sub },
      checkIn: { findFirst: last, count },
    },
  } as unknown as PrismaService;
  return { service: new AutomationFactsService(prisma), member, sub, last, count };
}

describe('AutomationFactsService', () => {
  it('returns tenant-scoped facts and computes age, days and membership kind', async () => {
    const { service, member, sub, last, count } = setup({
      live: true,
      history: true,
      checkin: true,
    });
    expect(await service.loadConditionFacts('gym-1', 'member-1', now)).toEqual({
      member_gender: 'FEMALE',
      member_age: 29,
      member_status: 'ACTIVE',
      member_kind: 'MEMBER',
      member_branch: 'loc-1',
      member_tags: ['vip'],
      member_joined_days_ago: 30,
      member_last_checkin_days_ago: 2,
      member_checkin_count: 12,
      subscription_plan: 'plan-1',
      subscription_status: 'ACTIVE',
      subscription_days_until_expiry: 2,
    });
    for (const mock of [member, sub, last, count]) {
      for (const [args] of mock.mock.calls)
        expect((args as { where: { gymId: string } }).where.gymId).toBe('gym-1');
    }
  });
  it.each([
    [{}, 'GUEST'],
    [{ history: true }, 'INACTIVE'],
    [{ live: true, override: 'GUEST' }, 'GUEST'],
  ] as const)('derives kind from subscriptions or explicit override: %j', async (options, kind) => {
    const result = await setup(options).service.loadConditionFacts('gym-1', 'member-1', now);
    expect(result?.member_kind).toBe(kind);
    expect(result?.member_last_checkin_days_ago).toBeNull();
  });
  it('returns null without querying related data for another gym or deleted member', async () => {
    const { service, member, sub, last, count } = setup({ missing: true });
    expect(await service.loadConditionFacts('gym-2', 'member-1', now)).toBeNull();
    expect(member).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gymId: 'gym-2', id: 'member-1', deletedAt: null } }),
    );
    expect(sub).not.toHaveBeenCalled();
    expect(last).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
  it('handles birthday boundaries and missing birthdays in UTC', () => {
    expect(ageAt(new Date('1996-07-08'), now)).toBe(30);
    expect(ageAt(new Date('1996-07-09'), now)).toBe(29);
    expect(ageAt(null, now)).toBeNull();
  });
});
