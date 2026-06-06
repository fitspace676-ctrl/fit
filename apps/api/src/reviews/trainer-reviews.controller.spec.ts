import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListTrainerReviewsResponse } from '@fit/types';
import { TrainerReviewsController } from './trainer-reviews.controller';
import type { PublicReviewsService } from './public-reviews.service';

const RESULT: ListTrainerReviewsResponse = {
  reviews: [],
  avgRating: 0,
  total: 0,
  page: 1,
  limit: 10,
};

function setup() {
  const listForTrainer = vi.fn<() => Promise<ListTrainerReviewsResponse>>(() =>
    Promise.resolve(RESULT),
  );
  const service = { listForTrainer } as unknown as PublicReviewsService;
  return { controller: new TrainerReviewsController(service), listForTrainer };
}

describe('TrainerReviewsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /trainers/:id/reviews', () => {
    it('validates the query, defaults pagination, and delegates to the service', async () => {
      const result = await ctx.controller.list('tr-1', { gymId: 'gym-1' });

      expect(ctx.listForTrainer).toHaveBeenCalledWith('tr-1', {
        gymId: 'gym-1',
        page: 1,
        limit: 10,
      });
      expect(result).toEqual(RESULT);
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.list('tr-1', {}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listForTrainer).not.toHaveBeenCalled();
    });

    it('coerces numeric-string page/limit', async () => {
      await ctx.controller.list('tr-1', { gymId: 'gym-1', page: '2', limit: '25' });

      expect(ctx.listForTrainer).toHaveBeenCalledWith('tr-1', {
        gymId: 'gym-1',
        page: 2,
        limit: 25,
      });
    });
  });
});
