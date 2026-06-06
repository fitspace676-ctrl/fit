import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewStatus } from '@fit/db';
import type { AdminReview, ListAdminTrainerReviewsResponse } from '@fit/types';
import { AdminReviewsController } from './admin-reviews.controller';
import type { ReviewsService } from './reviews.service';

const REVIEW: AdminReview = {
  id: 'rv-1',
  rating: 5,
  comment: 'Great class',
  status: ReviewStatus.HIDDEN,
  authorName: 'Ada Lovelace',
  authorEmail: 'ada@example.com',
  classInstanceId: 'ci-1',
  classTitle: 'Spin',
  createdAt: '2026-01-02T10:00:00.000Z',
};

const LIST: ListAdminTrainerReviewsResponse = { data: [], total: 0, page: 1, limit: 20 };

function setup() {
  const listForModeration = vi.fn<() => Promise<ListAdminTrainerReviewsResponse>>(() =>
    Promise.resolve(LIST),
  );
  const hide = vi.fn<() => Promise<AdminReview>>(() => Promise.resolve(REVIEW));
  const unhide = vi.fn<() => Promise<AdminReview>>(() =>
    Promise.resolve({ ...REVIEW, status: ReviewStatus.VISIBLE }),
  );
  const service = { listForModeration, hide, unhide } as unknown as ReviewsService;
  return { controller: new AdminReviewsController(service), listForModeration, hide, unhide };
}

describe('AdminReviewsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/trainers/:id/reviews', () => {
    it('validates + defaults the query and delegates to the service', async () => {
      const result = await ctx.controller.list('tr-1', {});

      expect(ctx.listForModeration).toHaveBeenCalledWith('tr-1', { page: 1, limit: 20 });
      expect(result).toEqual(LIST);
    });

    it('passes a status filter through when supplied', async () => {
      await ctx.controller.list('tr-1', { status: 'HIDDEN' });

      expect(ctx.listForModeration).toHaveBeenCalledWith('tr-1', {
        page: 1,
        limit: 20,
        status: ReviewStatus.HIDDEN,
      });
    });
  });

  describe('POST /admin/reviews/:id/hide | /unhide', () => {
    it('hides a review and wraps the result', async () => {
      const result = await ctx.controller.hide('rv-1');

      expect(ctx.hide).toHaveBeenCalledWith('rv-1');
      expect(result).toEqual({ review: REVIEW });
    });

    it('unhides a review and wraps the result', async () => {
      const result = await ctx.controller.unhide('rv-1');

      expect(ctx.unhide).toHaveBeenCalledWith('rv-1');
      expect(result.review.status).toBe(ReviewStatus.VISIBLE);
    });
  });
});
