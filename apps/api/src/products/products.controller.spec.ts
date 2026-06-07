import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { ListProductsResponse } from '@fit/types';
import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

function setup() {
  const listProducts = vi.fn<() => Promise<ListProductsResponse>>(() =>
    Promise.resolve({ products: [] }),
  );
  const products = { listProducts } as unknown as ProductsService;
  return { controller: new ProductsController(products), listProducts };
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
  });
});
