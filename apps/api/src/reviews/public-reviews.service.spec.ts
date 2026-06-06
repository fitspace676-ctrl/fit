import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewStatus } from '@fit/db';
import { PublicReviewsService } from './public-reviews.service';
import type { PrismaService } from '../prisma/prisma.service';

const GYM_ID = 'gym-1';
const TRAINER_ID = 'tr-1';

interface QueryArgs {
  where?: Record<string, unknown>;
  skip?: number;
  take?: number;
}

const reviewRow = (over?: Record<string, unknown>) => ({
  id: 'rv-1',
  rating: 5,
  comment: 'Excellent coaching',
  createdAt: new Date('2026-01-03T09:00:00.000Z'),
  member: { user: { name: 'Ada Lovelace' } },
  ...over,
});

function setup() {
  const review = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
    count: vi.fn<(args: QueryArgs) => Promise<number>>(),
    aggregate: vi.fn<(args: QueryArgs) => Promise<unknown>>(),
  };
  const client = { review };
  const prisma = { client } as unknown as PrismaService;
  return { service: new PublicReviewsService(prisma), review };
}

describe('PublicReviewsService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('listForTrainer', () => {
    it("returns only the gym's VISIBLE reviews with the rounded live aggregate", async () => {
      ctx.review.findMany.mockResolvedValueOnce([
        reviewRow(),
        reviewRow({ id: 'rv-2', comment: null, member: { user: { name: null } } }),
      ]);
      ctx.review.count.mockResolvedValueOnce(7);
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: 4.333333 } });

      const result = await ctx.service.listForTrainer(TRAINER_ID, {
        gymId: GYM_ID,
        page: 1,
        limit: 10,
      });

      // The query is constrained to the trainer, the explicit gym, and VISIBLE only.
      expect(ctx.review.findMany.mock.calls[0]?.[0]?.where).toEqual({
        trainerId: TRAINER_ID,
        gymId: GYM_ID,
        status: ReviewStatus.VISIBLE,
      });
      expect(result).toMatchObject({ total: 7, avgRating: 4.3, page: 1, limit: 10 });
      expect(result.reviews[0]).toEqual({
        id: 'rv-1',
        rating: 5,
        comment: 'Excellent coaching',
        authorName: 'Ada Lovelace',
        createdAt: '2026-01-03T09:00:00.000Z',
      });
      // A member with no display name falls back to a generic label, never an email.
      expect(result.reviews[1]?.authorName).toBe('Member');
      expect(result.reviews[1]?.comment).toBeNull();
    });

    it('is a normal empty result (0 average) for a trainer with no reviews', async () => {
      ctx.review.findMany.mockResolvedValueOnce([]);
      ctx.review.count.mockResolvedValueOnce(0);
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: null } });

      const result = await ctx.service.listForTrainer(TRAINER_ID, {
        gymId: GYM_ID,
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({ reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 });
    });

    it('paginates with skip/take derived from page + limit', async () => {
      ctx.review.findMany.mockResolvedValueOnce([]);
      ctx.review.count.mockResolvedValueOnce(0);
      ctx.review.aggregate.mockResolvedValueOnce({ _avg: { rating: null } });

      await ctx.service.listForTrainer(TRAINER_ID, { gymId: GYM_ID, page: 3, limit: 10 });

      expect(ctx.review.findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 20, take: 10 });
    });
  });
});
