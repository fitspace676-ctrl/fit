import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  CreateSubscriptionPlanResponse,
  GetAdminSubscriptionPlanResponse,
  ListAdminSubscriptionPlansResponse,
} from '@fit/types';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import type { AdminSubscriptionPlansService } from './admin-subscription-plans.service';

const detail = (
  over?: Partial<GetAdminSubscriptionPlanResponse>,
): GetAdminSubscriptionPlanResponse => ({
  id: 'sp-1',
  name: 'Monthly Unlimited',
  priceAmount: 5000,
  currency: 'USD',
  interval: 'MONTH',
  featureCount: 0,
  freezeDaysPerPeriod: 30,
  subscriberCount: 0,
  popular: false,
  status: 'ACTIVE',
  createdAt: '2026-03-01T00:00:00.000Z',
  description: '',
  features: [],
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...over,
});

function setup() {
  const listSubscriptionPlans = vi.fn<() => Promise<ListAdminSubscriptionPlansResponse>>(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
  );
  const getSubscriptionPlan = vi.fn<() => Promise<GetAdminSubscriptionPlanResponse>>(() =>
    Promise.resolve(detail()),
  );
  const createSubscriptionPlan = vi.fn<() => Promise<CreateSubscriptionPlanResponse>>(() =>
    Promise.resolve(detail()),
  );
  const updateSubscriptionPlan = vi.fn<() => Promise<CreateSubscriptionPlanResponse>>(() =>
    Promise.resolve(detail()),
  );
  const service = {
    listSubscriptionPlans,
    getSubscriptionPlan,
    createSubscriptionPlan,
    updateSubscriptionPlan,
  } as unknown as AdminSubscriptionPlansService;
  return {
    controller: new AdminSubscriptionPlansController(service),
    listSubscriptionPlans,
    getSubscriptionPlan,
    createSubscriptionPlan,
    updateSubscriptionPlan,
  };
}

describe('AdminSubscriptionPlansController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/subscriptions', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.list({ search: 'month' });

      expect(ctx.listSubscriptionPlans).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'month', page: 1, limit: 20, sort: 'name', dir: 'asc' }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.list({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listSubscriptionPlans).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/subscriptions', () => {
    it('validates + transforms the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.create({
        name: '  Monthly Unlimited  ',
        currency: 'usd',
        priceAmount: '5000',
      });

      // Name trimmed, currency upper-cased, priceAmount coerced, defaults applied.
      expect(ctx.createSubscriptionPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Monthly Unlimited',
          currency: 'USD',
          priceAmount: 5000,
          interval: 'MONTH',
          popular: false,
          status: 'ACTIVE',
          features: [],
        }),
      );
    });

    it('rejects a missing name with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.create({ description: 'x' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createSubscriptionPlan).not.toHaveBeenCalled();
    });

    it('rejects an invalid interval with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Monthly Unlimited', interval: 'ONE_TIME' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createSubscriptionPlan).not.toHaveBeenCalled();
    });

    it('rejects a negative price with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Monthly Unlimited', priceAmount: -1 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createSubscriptionPlan).not.toHaveBeenCalled();
    });

    it('rejects an empty feature label with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Monthly Unlimited', features: ['   '] })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createSubscriptionPlan).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/subscriptions/:id', () => {
    it('validates the body and forwards the id', async () => {
      ctx = setup();
      await ctx.controller.update('sp-1', { name: 'Renamed' });

      expect(ctx.updateSubscriptionPlan).toHaveBeenCalledWith(
        'sp-1',
        expect.objectContaining({ name: 'Renamed' }),
      );
    });
  });
});
