import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { MeGoalsService } from './me-goals.service';

const GOAL_ROW = {
  id: 'goal-1',
  label: 'Bench press',
  current: 60,
  target: 100,
  unit: 'kg',
  position: 0,
};

function setup(
  opts: {
    userId?: string | null;
    gymId?: string;
    member?: { id: string } | null;
    goals?: Array<typeof GOAL_ROW>;
  } = {},
) {
  const memberFindFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue('member' in opts ? opts.member : { id: 'gm-1' });
  const goalFindMany = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(opts.goals ?? [GOAL_ROW]);
  const deleteMany = vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 });
  const createMany = vi.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({ count: 0 });

  const tx = {
    memberGoal: { deleteMany, createMany, findMany: goalFindMany },
  };
  const $transaction = vi
    .fn<(cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>>()
    .mockImplementation((cb) => cb(tx));

  const prisma = {
    client: {
      gymMember: { findFirst: memberFindFirst },
      memberGoal: { findMany: goalFindMany },
      $transaction,
    },
  } as unknown as TenantPrismaService;

  const tenant = {
    userId: 'userId' in opts ? opts.userId : 'user-1',
    gymId: opts.gymId ?? 'gym-1',
  } as unknown as TenantContext;

  return { service: new MeGoalsService(prisma, tenant), memberFindFirst, deleteMany, createMany };
}

describe('MeGoalsService', () => {
  describe('listMyGoals', () => {
    it('requires a member session', async () => {
      const { service } = setup({ userId: null });
      await expect(service.listMyGoals()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a signed-in user who is not a member of the gym', async () => {
      const { service } = setup({ member: null });
      await expect(service.listMyGoals()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('projects the caller goals to the wire shape', async () => {
      const { service } = setup();
      await expect(service.listMyGoals()).resolves.toEqual({
        goals: [{ id: 'goal-1', label: 'Bench press', current: 60, target: 100, unit: 'kg' }],
      });
    });
  });

  describe('replaceMyGoals', () => {
    it('requires a member session', async () => {
      const { service } = setup({ userId: null });
      await expect(service.replaceMyGoals({ goals: [] })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('deletes the old set and skips the insert when the new set is empty', async () => {
      const { service, deleteMany, createMany } = setup({ goals: [] });
      await service.replaceMyGoals({ goals: [] });
      expect(deleteMany).toHaveBeenCalledOnce();
      expect(createMany).not.toHaveBeenCalled();
    });

    it('stamps gymId, memberId and positional order on each created goal', async () => {
      const { service, createMany } = setup({ gymId: 'gym-9', member: { id: 'gm-9' } });

      await service.replaceMyGoals({
        goals: [
          { label: 'Squat', current: 80, target: 140, unit: 'kg' },
          { label: 'Run', current: 3, target: 10, unit: 'km' },
        ],
      });

      const data = (createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> }).data;
      expect(data).toEqual([
        {
          gymId: 'gym-9',
          memberId: 'gm-9',
          label: 'Squat',
          current: 80,
          target: 140,
          unit: 'kg',
          position: 0,
        },
        {
          gymId: 'gym-9',
          memberId: 'gm-9',
          label: 'Run',
          current: 3,
          target: 10,
          unit: 'km',
          position: 1,
        },
      ]);
    });
  });
});
