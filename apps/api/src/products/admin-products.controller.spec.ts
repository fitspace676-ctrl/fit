import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type {
  CreateProductData,
  CreateProductResponse,
  GetAdminProductResponse,
  ListAdminProductsResponse,
  ListLowStockResponse,
  AdjustStockResponse,
  ListStockMovementsResponse,
  StockMovementRow,
} from '@fit/types';
import { AdminProductsController } from './admin-products.controller';
import type { AdminProductsService } from './admin-products.service';
import type { ProductStockService } from './product-stock.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const movementRow = (over?: Partial<StockMovementRow>): StockMovementRow => ({
  id: 'm-1',
  variantIndex: null,
  variantLabel: '',
  delta: 3,
  resultingStock: 7,
  reason: 'RECEIVE',
  note: '',
  actorName: 'Alex Owner',
  orderId: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  ...over,
});

const detail = (over?: Partial<GetAdminProductResponse>): GetAdminProductResponse => ({
  id: 'p-1',
  name: 'Branded Tee',
  priceAmount: 2999,
  costAmount: null,
  currency: 'USD',
  imageUrl: null,
  variantCount: 0,
  totalStock: 0,
  lowestStock: null,
  stock: null,
  lowStockThreshold: null,
  status: 'ACTIVE',
  category: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  description: '',
  images: [],
  variants: [],
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...over,
});

function setup(callerRole = 'OWNER') {
  const listProducts = vi.fn<() => Promise<ListAdminProductsResponse>>(() =>
    Promise.resolve({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      summary: {
        productCount: 0,
        activeCount: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        lowStockThreshold: 5,
      },
    }),
  );
  const getProduct = vi.fn<() => Promise<GetAdminProductResponse>>(() => Promise.resolve(detail()));
  const listLowStock = vi.fn<() => Promise<ListLowStockResponse>>(() =>
    Promise.resolve({ data: [], threshold: 5 }),
  );
  const createProduct = vi.fn<(input: CreateProductData) => Promise<CreateProductResponse>>(() =>
    Promise.resolve(detail()),
  );
  const updateProduct = vi.fn<() => Promise<CreateProductResponse>>(() =>
    Promise.resolve(detail()),
  );
  const setProductCategory = vi.fn<() => Promise<CreateProductResponse>>(() =>
    Promise.resolve(detail()),
  );
  const service = {
    listProducts,
    getProduct,
    listLowStock,
    createProduct,
    updateProduct,
    setProductCategory,
  } as unknown as AdminProductsService;
  const adjust = vi.fn<() => Promise<AdjustStockResponse>>(() =>
    Promise.resolve({
      variantIndex: null,
      stock: 7,
      movement: movementRow(),
    }),
  );
  const listMovements = vi.fn<() => Promise<ListStockMovementsResponse>>(() =>
    Promise.resolve({ data: [], total: 0, page: 1, limit: 20 }),
  );
  const stock = { adjust, listMovements } as unknown as ProductStockService;
  return {
    controller: new AdminProductsController(service, stock, {
      role: callerRole,
    } as unknown as TenantContext),
    listProducts,
    getProduct,
    listLowStock,
    createProduct,
    updateProduct,
    setProductCategory,
    adjust,
    listMovements,
  };
}

describe('AdminProductsController', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(() => vi.clearAllMocks());

  describe('GET /admin/products', () => {
    it('parses + defaults the query and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.list({ search: 'tee' });

      expect(ctx.listProducts).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'tee', page: 1, limit: 20, sort: 'name', dir: 'asc' }),
      );
    });

    it('rejects a non-numeric page with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.list({ page: 'abc' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listProducts).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/products/low-stock', () => {
    it('defaults the threshold and delegates to the service', async () => {
      ctx = setup();
      await ctx.controller.lowStock({});

      expect(ctx.listLowStock).toHaveBeenCalledWith({ threshold: 5 });
    });

    it('coerces a string threshold from the query', async () => {
      ctx = setup();
      await ctx.controller.lowStock({ threshold: '12' });

      expect(ctx.listLowStock).toHaveBeenCalledWith({ threshold: 12 });
    });

    it('rejects a negative threshold with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.lowStock({ threshold: '-1' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.listLowStock).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/products', () => {
    it('validates + transforms the body before delegating', async () => {
      ctx = setup();
      await ctx.controller.create({
        name: '  Branded Tee  ',
        // A client-sent currency is not part of the contract — the gym's own is
        // stamped service-side — so it must be dropped here, not forwarded.
        currency: 'usd',
        variants: [{ name: 'Small', stock: '3' }],
      });

      // Name trimmed, variant stock coerced, status + price defaulted.
      expect(ctx.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Branded Tee',
          priceAmount: 0,
          status: 'ACTIVE',
          variants: [{ name: 'Small', sku: '', priceAmount: null, stock: 3 }],
        }),
      );
      expect(ctx.createProduct.mock.calls[0]?.[0]).not.toHaveProperty('currency');
    });

    it('refuses a price from a caller without product:pricing with 403', async () => {
      ctx = setup('TRAINER');
      await expect(
        ctx.controller.create({ name: 'Tee', priceAmount: 1500, variants: [] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(ctx.createProduct).not.toHaveBeenCalled();
    });

    it('lets a body without pricing fields through the pricing check', async () => {
      ctx = setup('TRAINER');
      await ctx.controller.create({ name: 'Tee', variants: [] });
      expect(ctx.createProduct).toHaveBeenCalledOnce();
    });

    it('rejects a missing name with 400 without hitting the service', async () => {
      ctx = setup();
      const error = await ctx.controller.create({ description: 'x' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createProduct).not.toHaveBeenCalled();
    });

    it('rejects an invalid image URL with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Branded Tee', images: ['not-a-url'] })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createProduct).not.toHaveBeenCalled();
    });

    it('rejects a negative price with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Branded Tee', priceAmount: -1 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createProduct).not.toHaveBeenCalled();
    });

    it('rejects a variant with no name with 400', async () => {
      ctx = setup();
      const error = await ctx.controller
        .create({ name: 'Branded Tee', variants: [{ stock: 1 }] })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(ctx.createProduct).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/products/:id', () => {
    it('validates the body and forwards the id', async () => {
      ctx = setup();
      await ctx.controller.update('p-1', { name: 'Renamed' });

      expect(ctx.updateProduct).toHaveBeenCalledWith(
        'p-1',
        expect.objectContaining({ name: 'Renamed' }),
      );
    });
  });

  describe('PATCH /admin/products/:id/category', () => {
    it('forwards the shelf the product is filed onto', async () => {
      ctx = setup();
      await ctx.controller.setCategory('p-1', { categoryId: 'c-1' });

      expect(ctx.setProductCategory).toHaveBeenCalledWith('p-1', { categoryId: 'c-1' });
    });

    it('forwards a null to take the product off its shelf', async () => {
      ctx = setup();
      await ctx.controller.setCategory('p-1', { categoryId: null });

      expect(ctx.setProductCategory).toHaveBeenCalledWith('p-1', { categoryId: null });
    });

    it('rejects a body with no categoryId — absent is not the same as unfiled', async () => {
      ctx = setup();

      await expect(ctx.controller.setCategory('p-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(ctx.setProductCategory).not.toHaveBeenCalled();
    });
  });
});
