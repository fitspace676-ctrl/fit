import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ListProductsResponse } from '@fit/types';
import type { PortalBranchService } from '../common/portal-branch.service';
import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

function setup() {
  const listProducts = vi.fn<() => Promise<ListProductsResponse>>(() =>
    Promise.resolve({ products: [] }),
  );
  const products = { listProducts } as unknown as ProductsService;
  const resolve = vi.fn<PortalBranchService['resolve']>(() => Promise.resolve(undefined));
  const portalBranch = { resolve } as unknown as PortalBranchService;
  return { controller: new ProductsController(products, portalBranch), listProducts, resolve };
}

describe('ProductsController', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => vi.clearAllMocks());

  describe('GET /products', () => {
    it('parses the query and delegates the validated gymId to the service', async () => {
      const result = await ctx.controller.list({ gymId: 'gym-1' });

      expect(ctx.listProducts).toHaveBeenCalledWith({ gymId: 'gym-1' });
      expect(result).toEqual({ products: [] });
    });

    it('rejects a missing gymId with 400 without hitting the service', async () => {
      const error = await ctx.controller.list({}).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listProducts).not.toHaveBeenCalled();
    });

    it('rejects an empty gymId with 400', async () => {
      const error = await ctx.controller.list({ gymId: '' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listProducts).not.toHaveBeenCalled();
    });

    it('narrows a signed-in member to the branch resolved from their session', async () => {
      ctx.resolve.mockResolvedValueOnce('loc-home');

      await ctx.controller.list({ gymId: 'gym-1' }, 'Bearer tok');

      expect(ctx.resolve).toHaveBeenCalledWith({ gymId: 'gym-1', authorization: 'Bearer tok' });
      expect(ctx.listProducts).toHaveBeenCalledWith({ gymId: 'gym-1', locationId: 'loc-home' });
    });

    it('lists every branch for an anonymous visitor', async () => {
      await ctx.controller.list({ gymId: 'gym-1' });

      expect(ctx.resolve).toHaveBeenCalledWith({ gymId: 'gym-1', authorization: undefined });
      expect(ctx.listProducts.mock.calls[0]).toEqual([{ gymId: 'gym-1', locationId: undefined }]);
    });

    it('hands a same-gym override to the resolver and lists that branch', async () => {
      ctx.resolve.mockResolvedValueOnce('loc-2');

      await ctx.controller.list({ gymId: 'gym-1', locationId: 'loc-2' }, 'Bearer tok');

      expect(ctx.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ gymId: 'gym-1', locationId: 'loc-2' }),
      );
      expect(ctx.listProducts).toHaveBeenCalledWith({ gymId: 'gym-1', locationId: 'loc-2' });
    });

    it("404s another gym's branch without listing anything", async () => {
      ctx.resolve.mockRejectedValueOnce(new NotFoundException());

      const error = await ctx.controller
        .list({ gymId: 'gym-1', locationId: 'loc-other-gym' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(ctx.listProducts).not.toHaveBeenCalled();
    });
  });
});
