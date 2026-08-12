import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type {
  CreatePackagePlanData,
  CreatePackagePlanResponse,
  GetAdminPackagePlanResponse,
  ListAdminPackagePlansResponse,
} from '@fit/types';
import { AdminPackagePlansController } from './admin-package-plans.controller';
import type { AdminPackagePlansService } from './admin-package-plans.service';

const detail = (over?: Partial<GetAdminPackagePlanResponse>): GetAdminPackagePlanResponse => ({
  id: 'pp-1',
  name: '10 Session Pack',
  priceAmount: 50000,
  currency: 'USD',
  billingInterval: 'ONE_TIME',
  sessionCount: 10,
  featureCount: 0,
  popular: false,
  status: 'ACTIVE',
  createdAt: '2026-03-01T00:00:00.000Z',
  description: '',
  features: [],
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...over,
});

function setup() {
  const listPackagePlans = vi.fn<() => Promise<ListAdminPackagePlansResponse>>(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
  );
  const getPackagePlan = vi.fn<() => Promise<GetAdminPackagePlanResponse>>(() =>
    Promise.resolve(detail()),
  );
  const createPackagePlan = vi.fn<
    (input: CreatePackagePlanData) => Promise<CreatePackagePlanResponse>
  >(() => Promise.resolve(detail()));
  const updatePackagePlan = vi.fn<() => Promise<CreatePackagePlanResponse>>(() =>
    Promise.resolve(detail()),
  );
  const service = {
    listPackagePlans,
    getPackagePlan,
    createPackagePlan,
    updatePackagePlan,
  } as unknown as AdminPackagePlansService;
  return {
    controller: new AdminPackagePlansController(service),
    listPackagePlans,
    getPackagePlan,
    createPackagePlan,
    updatePackagePlan,
  };
}

describe('AdminPackagePlansController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/packages', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.list({ search: 'pack' });

      expect(ctx.listPackagePlans).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'pack', page: 1, limit: 20, sort: 'name', dir: 'asc' }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.list({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listPackagePlans).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/packages', () => {
    it('validates + transforms the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.create({
        name: '  10 Session Pack  ',
        // A client-sent currency is not part of the contract — the gym's own is
        // stamped service-side — so it must be dropped here, not forwarded.
        currency: 'usd',
        sessionCount: '10',
      });

      // Name trimmed, sessionCount coerced, defaults applied.
      expect(ctx.createPackagePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '10 Session Pack',
          priceAmount: 0,
          billingInterval: 'MONTH',
          sessionCount: 10,
          popular: false,
          status: 'ACTIVE',
          features: [],
        }),
      );
      expect(ctx.createPackagePlan.mock.calls[0]?.[0]).not.toHaveProperty('currency');
    });

    it('rejects a missing name with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.create({ description: 'x' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createPackagePlan).not.toHaveBeenCalled();
    });

    it('rejects an invalid billing interval with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: '10 Session Pack', billingInterval: 'weekly' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createPackagePlan).not.toHaveBeenCalled();
    });

    it('rejects a negative price with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: '10 Session Pack', priceAmount: -1 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createPackagePlan).not.toHaveBeenCalled();
    });

    it('rejects an empty feature label with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: '10 Session Pack', features: ['   '] })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createPackagePlan).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/packages/:id', () => {
    it('validates the body and forwards the id', async () => {
      ctx = setup();
      await ctx.controller.update('pp-1', { name: 'Renamed' });

      expect(ctx.updatePackagePlan).toHaveBeenCalledWith(
        'pp-1',
        expect.objectContaining({ name: 'Renamed' }),
      );
    });
  });
});
