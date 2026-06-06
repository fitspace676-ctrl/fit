import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { CreateReviewResponse } from '@fit/types';
import { ReviewsController } from './reviews.controller';
import type { ReviewsService } from './reviews.service';

function setup() {
  const create = vi.fn<() => Promise<CreateReviewResponse>>(() => Promise.resolve({ id: 'rv-1' }));
  const service = { create } as unknown as ReviewsService;
  return { controller: new ReviewsController(service), create };
}

describe('ReviewsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('POST /reviews', () => {
    it('parses the body and delegates the normalised data to the service', async () => {
      const result = await ctx.controller.create({
        classInstanceId: 'ci-1',
        rating: 5,
        comment: '  Great class  ',
      });

      expect(ctx.create).toHaveBeenCalledWith({
        classInstanceId: 'ci-1',
        rating: 5,
        comment: 'Great class',
      });
      expect(result).toEqual({ id: 'rv-1' });
    });

    it('coerces a numeric-string rating and drops an empty comment', async () => {
      await ctx.controller.create({ classInstanceId: 'ci-1', rating: '4', comment: '   ' });

      expect(ctx.create).toHaveBeenCalledWith({
        classInstanceId: 'ci-1',
        rating: 4,
        comment: undefined,
      });
    });

    it('rejects an out-of-range rating with 400 without hitting the service', async () => {
      const error = await ctx.controller
        .create({ classInstanceId: 'ci-1', rating: 6 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.create).not.toHaveBeenCalled();
    });

    it('rejects a missing classInstanceId with 400', async () => {
      const error = await ctx.controller.create({ rating: 5 }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.create).not.toHaveBeenCalled();
    });
  });
});
