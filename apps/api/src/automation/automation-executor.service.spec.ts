import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationActionType, AutomationTriggerType } from '@fit/db';
import { AutomationExecutorService } from './automation-executor.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A rule as the executor's `RULE_SELECT` projects it (plus optional triggerConfig). */
interface FireRule {
  id: string;
  triggerType: AutomationTriggerType;
  actionType: AutomationActionType;
  actionConfig: { body: string };
  triggerConfig?: { days?: number };
}

function activeRule(over: Partial<FireRule> = {}): FireRule {
  return {
    id: 'rule-1',
    triggerType: AutomationTriggerType.member_joined,
    actionType: AutomationActionType.email,
    actionConfig: { body: 'Welcome' },
    ...over,
  };
}

function setup(overrides?: {
  ruleFindMany?: unknown[];
  runFindFirst?: unknown;
  gymFindMany?: unknown[];
  subFindMany?: unknown[];
  runCreateThrows?: boolean;
  ruleFindManyThrows?: boolean;
}) {
  const ruleFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() => {
    if (overrides?.ruleFindManyThrows) return Promise.reject(new Error('db down'));
    return Promise.resolve(overrides?.ruleFindMany ?? []);
  });
  const runFindFirst = vi.fn<(args: AnyArgs) => Promise<unknown>>(() =>
    Promise.resolve(overrides?.runFindFirst ?? null),
  );
  const runCreate = vi.fn<(args: AnyArgs) => Promise<unknown>>((args) => {
    if (overrides?.runCreateThrows && args.data?.status === 'SUCCESS') {
      return Promise.reject(new Error('write failed'));
    }
    return Promise.resolve({ id: 'run-x', ...args.data });
  });
  const gymFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.gymFindMany ?? []),
  );
  const subFindMany = vi.fn<(args: AnyArgs) => Promise<unknown[]>>(() =>
    Promise.resolve(overrides?.subFindMany ?? []),
  );

  const client = {
    automationRule: { findMany: ruleFindMany },
    automationRun: { findFirst: runFindFirst, create: runCreate },
    gym: { findMany: gymFindMany },
    subscription: { findMany: subFindMany },
  };

  const prisma = { client } as unknown as PrismaService;
  const redisSet = vi.fn(() => Promise.resolve('OK'));
  const redis = { client: { set: redisSet } } as unknown as RedisService;

  return {
    service: new AutomationExecutorService(prisma, redis),
    ruleFindMany,
    runFindFirst,
    runCreate,
    gymFindMany,
    subFindMany,
    redisSet,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('AutomationExecutorService.dispatchForGym', () => {
  it('records a SUCCESS run per active rule on the trigger', async () => {
    const { service, ruleFindMany, runCreate } = setup({
      ruleFindMany: [activeRule({ id: 'r1' }), activeRule({ id: 'r2', actionType: 'sms' })],
    });
    const count = await service.dispatchForGym('gym-1', 'member_joined', {
      entityId: 'm-1',
      entityType: 'member',
    });

    expect(count).toBe(2);
    const where = ruleFindMany.mock.calls[0]?.[0]?.where as Record<string, unknown>;
    expect(where).toMatchObject({ gymId: 'gym-1', active: true, isTemplate: false });
    const first = runCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(first.status).toBe('SUCCESS');
    expect(first.entityId).toBe('m-1');
    expect(first.entityType).toBe('member');
  });

  it('returns 0 without throwing when the rules query fails', async () => {
    const { service, runCreate } = setup({ ruleFindManyThrows: true });
    const count = await service.dispatchForGym('gym-1', 'member_joined');
    expect(count).toBe(0);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('records a FAILED breadcrumb when the run write throws, and never rethrows', async () => {
    const { service, runCreate } = setup({
      ruleFindMany: [activeRule()],
      runCreateThrows: true,
    });
    const count = await service.dispatchForGym('gym-1', 'member_joined');
    expect(count).toBe(0);
    // First call is the SUCCESS attempt (throws), second is the FAILED breadcrumb.
    expect(runCreate).toHaveBeenCalledTimes(2);
    expect((runCreate.mock.calls[1]?.[0]?.data as Record<string, unknown>).status).toBe('FAILED');
  });
});

describe('AutomationExecutorService.fireRule', () => {
  it('skips a rule already fired for the entity since dedupeSince', async () => {
    const { service, runCreate } = setup({ runFindFirst: { id: 'existing' } });
    const recorded = await service.fireRule('gym-1', activeRule(), {
      entityId: 'sub-1',
      dedupeSince: new Date('2026-07-08T00:00:00.000Z'),
    });
    expect(recorded).toBe(false);
    expect(runCreate).not.toHaveBeenCalled();
  });

  it('records when no prior run exists in the dedupe window', async () => {
    const { service, runCreate } = setup({ runFindFirst: null });
    const recorded = await service.fireRule('gym-1', activeRule(), {
      entityId: 'sub-1',
      dedupeSince: new Date('2026-07-08T00:00:00.000Z'),
    });
    expect(recorded).toBe(true);
    expect(runCreate).toHaveBeenCalledOnce();
  });
});

describe('AutomationExecutorService.scanMembershipExpiring', () => {
  it('records a run per expiring subscription in the rule window', async () => {
    const { service, subFindMany, runCreate } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ id: 'exp', triggerType: 'membership_expiring', triggerConfig: { days: 7 } }),
      ],
      subFindMany: [{ id: 'sub-1' }, { id: 'sub-2' }],
    });
    const now = new Date('2026-07-08T12:00:00.000Z');
    const summary = await service.scanMembershipExpiring({ now });

    expect(summary.gymsProcessed).toBe(1);
    expect(summary.rulesMatched).toBe(1);
    expect(summary.runsRecorded).toBe(2);

    // The window is the whole UTC day 7 days ahead: [2026-07-15, 2026-07-16).
    const where = subFindMany.mock.calls[0]?.[0]?.where as {
      currentPeriodEnd: { gte: Date; lt: Date };
    };
    expect(where.currentPeriodEnd.gte.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(where.currentPeriodEnd.lt.toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(runCreate).toHaveBeenCalledTimes(2);
  });

  it('skips a subscription already recorded today, counting it as skipped', async () => {
    const { service } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ id: 'exp', triggerType: 'membership_expiring', triggerConfig: { days: 7 } }),
      ],
      subFindMany: [{ id: 'sub-1' }],
      runFindFirst: { id: 'already' },
    });
    const summary = await service.scanMembershipExpiring({
      now: new Date('2026-07-08T12:00:00.000Z'),
    });
    expect(summary.runsRecorded).toBe(0);
    expect(summary.runsSkipped).toBe(1);
  });

  it('ignores a rule missing its days config', async () => {
    const { service, subFindMany } = setup({
      gymFindMany: [{ id: 'gym-1' }],
      ruleFindMany: [
        activeRule({ id: 'exp', triggerType: 'membership_expiring', triggerConfig: {} }),
      ],
    });
    const summary = await service.scanMembershipExpiring({
      now: new Date('2026-07-08T12:00:00.000Z'),
    });
    expect(summary.rulesMatched).toBe(0);
    expect(subFindMany).not.toHaveBeenCalled();
  });
});
