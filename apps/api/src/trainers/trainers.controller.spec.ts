import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { GetTrainerResponse, ListTrainersResponse } from '@fit/types';
import type { PortalBranchService } from '../common/portal-branch.service';
import { TrainersController } from './trainers.controller';
import type { TrainersService } from './trainers.service';

function setup() {
  const listTrainers = vi.fn<() => Promise<ListTrainersResponse>>(() =>
    Promise.resolve({ trainers: [] }),
  );
  const getTrainer = vi.fn<() => Promise<GetTrainerResponse>>(() =>
    Promise.reject(new NotFoundException('Trainer t-1 not found')),
  );
  const trainers = { listTrainers, getTrainer } as unknown as TrainersService;
  const resolve = vi.fn<PortalBranchService['resolve']>(() => Promise.resolve(undefined));
  const portalBranch = { resolve } as unknown as PortalBranchService;
  return {
    controller: new TrainersController(trainers, portalBranch),
    listTrainers,
    getTrainer,
    resolve,
  };
}

describe('TrainersController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /trainers', () => {
    it('parses the query and delegates the validated gymId to the service', async () => {
      const result = await ctx.controller.list({ gymId: 'gym-1' });

      expect(ctx.listTrainers).toHaveBeenCalledWith({ gymId: 'gym-1' });
      expect(result).toEqual({ trainers: [] });
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listTrainers).not.toHaveBeenCalled();
    });

    it('rejects an empty gymId with 400', async () => {
      const error = await ctx.controller.list({ gymId: '' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listTrainers).not.toHaveBeenCalled();
    });

    it('narrows a signed-in member to the branch resolved from their session', async () => {
      ctx.resolve.mockResolvedValueOnce('loc-home');

      await ctx.controller.list({ gymId: 'gym-1' }, 'Bearer tok');

      expect(ctx.resolve).toHaveBeenCalledWith({ gymId: 'gym-1', authorization: 'Bearer tok' });
      expect(ctx.listTrainers).toHaveBeenCalledWith({ gymId: 'gym-1', locationId: 'loc-home' });
    });

    it('lists every branch for an anonymous visitor', async () => {
      await ctx.controller.list({ gymId: 'gym-1' });

      expect(ctx.listTrainers.mock.calls[0]).toEqual([{ gymId: 'gym-1', locationId: undefined }]);
    });

    it('hands a same-gym override to the resolver and lists that branch', async () => {
      ctx.resolve.mockResolvedValueOnce('loc-2');

      await ctx.controller.list({ gymId: 'gym-1', locationId: 'loc-2' });

      expect(ctx.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ gymId: 'gym-1', locationId: 'loc-2' }),
      );
      expect(ctx.listTrainers).toHaveBeenCalledWith({ gymId: 'gym-1', locationId: 'loc-2' });
    });

    it("404s another gym's branch without listing anything", async () => {
      ctx.resolve.mockRejectedValueOnce(new NotFoundException());

      const error = await ctx.controller
        .list({ gymId: 'gym-1', locationId: 'loc-other-gym' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(ctx.listTrainers).not.toHaveBeenCalled();
    });
  });

  describe('GET /trainers/:id', () => {
    it('parses the query and delegates the id + validated gymId to the service', async () => {
      const error = await ctx.controller.getOne('t-1', { gymId: 'gym-1' }).catch((e: unknown) => e);

      // The stubbed service 404s until the trainer model lands; what matters
      // here is the controller forwarded the well-formed args unchanged.
      expect(ctx.getTrainer).toHaveBeenCalledWith('t-1', { gymId: 'gym-1' });
      expect(error).toBeInstanceOf(NotFoundException);
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.getOne('t-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.getTrainer).not.toHaveBeenCalled();
    });

    it('rejects an empty gymId with 400', async () => {
      const error = await ctx.controller.getOne('t-1', { gymId: '' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.getTrainer).not.toHaveBeenCalled();
    });
  });
});
