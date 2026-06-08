import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@fit/db';
import {
  productVariantsSchema,
  type CreateProductData,
  type ListAdminProductsQuery,
  type ProductVariants,
  type UpdateProductData,
} from '@fit/types';
import { AdminProductsService } from './admin-products.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const VARIANTS: ProductVariants = productVariantsSchema.parse([
  { name: 'Small', sku: 'TS-S', priceAmount: 2500, stock: 10 },
  { name: 'Large', stock: 4 },
]);

/** A product row as the service's projection selects it. */
interface ProductRecord {
  id: string;
  name: string;
  description: string;
  priceAmount: number;
  currency: string;
  images: string[];
  variants: unknown;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface FindManyArgs {
  where?: { status?: unknown; OR?: unknown };
  orderBy?: unknown;
  skip?: number;
  take?: number;
}
interface WhereArgs {
  where?: { id?: unknown };
  data?: Record<string, unknown>;
}

const row = (over?: Partial<ProductRecord>): ProductRecord => ({
  id: 'p-1',
  name: 'Branded Tee',
  description: 'A soft cotton training tee.',
  priceAmount: 2999,
  currency: 'USD',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  variants: VARIANTS,
  status: ProductStatus.ACTIVE,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
  ...over,
});

function setup(overrides?: {
  findMany?: ProductRecord[];
  count?: number;
  findFirst?: ProductRecord | null;
}) {
  const findMany = vi.fn<(args: FindManyArgs) => Promise<ProductRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  const count = vi.fn<(args: WhereArgs) => Promise<number>>(() =>
    Promise.resolve(overrides?.count ?? 0),
  );
  const findFirst = vi.fn<(args: WhereArgs) => Promise<ProductRecord | null>>(() =>
    Promise.resolve(overrides?.findFirst ?? null),
  );
  const create = vi.fn<(args: WhereArgs) => Promise<ProductRecord>>(() => Promise.resolve(row()));
  const update = vi.fn<(args: WhereArgs) => Promise<ProductRecord>>(() => Promise.resolve(row()));

  const client: Record<string, unknown> = {
    product: { findMany, count, findFirst, create, update },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new AdminProductsService(prisma, tenant),
    findMany,
    count,
    findFirst,
    create,
    update,
  };
}

function query(overrides?: Partial<ListAdminProductsQuery>): ListAdminProductsQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateProductData>): CreateProductData => ({
  name: 'Branded Tee',
  description: 'A soft cotton training tee.',
  priceAmount: 2999,
  currency: 'USD',
  images: ['https://cdn.example.com/a.jpg'],
  variants: VARIANTS,
  status: 'ACTIVE',
  ...over,
});

const updateInput = (over?: Partial<UpdateProductData>): UpdateProductData => ({
  name: 'Branded Tee',
  description: 'Updated copy.',
  priceAmount: 3499,
  currency: 'EUR',
  images: ['https://cdn.example.com/c.jpg'],
  variants: VARIANTS,
  ...over,
});

describe('AdminProductsService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listProducts', () => {
    it('projects rows to denormalised AdminProductRows and echoes pagination totals', async () => {
      const { service } = setup({ findMany: [row()], count: 1 });

      const result = await service.listProducts(query());

      expect(result).toEqual({
        data: [
          {
            id: 'p-1',
            name: 'Branded Tee',
            priceAmount: 2999,
            currency: 'USD',
            imageUrl: 'https://cdn.example.com/a.jpg',
            variantCount: 2,
            status: 'ACTIVE',
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('reports a null imageUrl and zero variantCount for an empty product', async () => {
      const { service } = setup({ findMany: [row({ images: [], variants: [] })], count: 1 });

      const result = await service.listProducts(query());

      expect(result.data[0]).toMatchObject({ imageUrl: null, variantCount: 0 });
    });

    it('paginates server-side with skip/take derived from page + limit', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query({ page: 3, limit: 25 }));

      expect(findMany.mock.calls[0]?.[0]).toMatchObject({ skip: 50, take: 25 });
    });

    it('adds a status filter when provided', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query({ status: 'INACTIVE' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'INACTIVE' });
    });

    it('builds a case-insensitive name/description search', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query({ search: 'tee' }));

      expect(findMany.mock.calls[0]?.[0]?.where?.OR).toEqual([
        { name: { contains: 'tee', mode: 'insensitive' } },
        { description: { contains: 'tee', mode: 'insensitive' } },
      ]);
    });

    it('maps the sort column + direction to a Prisma orderBy', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ name: 'desc' });

      await service.listProducts(query({ sort: 'price', dir: 'asc' }));
      expect(findMany.mock.calls[1]?.[0]?.orderBy).toEqual({ priceAmount: 'asc' });

      await service.listProducts(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ status: 'asc' });

      await service.listProducts(query({ sort: 'createdAt', dir: 'desc' }));
      expect(findMany.mock.calls[3]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
    });
  });

  describe('listLowStock', () => {
    it('returns only variants at or below the threshold, most urgent first', async () => {
      // p-1: Small (10), Large (4); p-2: Big (2). At threshold 5, only Large + Big are low.
      const { service, findMany } = setup({
        findMany: [
          row(),
          row({
            id: 'p-2',
            name: 'Aqua Bottle',
            images: [],
            variants: productVariantsSchema.parse([{ name: 'Big', sku: 'AB-L', stock: 2 }]),
          }),
        ],
      });

      const result = await service.listLowStock({ threshold: 5 });

      // Only ACTIVE products are scanned.
      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ status: 'ACTIVE' });
      expect(result.threshold).toBe(5);
      // p-2 (lowestStock 2) sorts ahead of p-1 (lowestStock 4).
      expect(result.data.map((p) => p.id)).toEqual(['p-2', 'p-1']);
      expect(result.data[0]).toMatchObject({
        id: 'p-2',
        imageUrl: null,
        lowestStock: 2,
        variants: [{ variantIndex: 0, name: 'Big', sku: 'AB-L', stock: 2 }],
      });
      // The healthy "Small" variant (stock 10) is dropped from p-1's row.
      expect(result.data[1]!.variants).toEqual([
        { variantIndex: 1, name: 'Large', sku: '', stock: 4 },
      ]);
    });

    it('omits products whose every variant is above the threshold', async () => {
      const { service } = setup({ findMany: [row()] });

      const result = await service.listLowStock({ threshold: 3 });

      expect(result.data).toEqual([]);
    });

    it('treats a malformed variants value as no low stock', async () => {
      const { service } = setup({ findMany: [row({ variants: 'not-an-array' })] });

      const result = await service.listLowStock({ threshold: 5 });

      expect(result.data).toEqual([]);
    });
  });

  describe('getProduct', () => {
    it('returns the full detail projection with parsed variants + gallery', async () => {
      const { service } = setup({ findFirst: row() });

      const result = await service.getProduct('p-1');

      expect(result).toEqual({
        id: 'p-1',
        name: 'Branded Tee',
        priceAmount: 2999,
        currency: 'USD',
        imageUrl: 'https://cdn.example.com/a.jpg',
        variantCount: 2,
        status: 'ACTIVE',
        createdAt: '2026-02-01T00:00:00.000Z',
        description: 'A soft cotton training tee.',
        images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
        variants: VARIANTS,
        updatedAt: '2026-02-02T00:00:00.000Z',
      });
    });

    it('falls back to an empty variant list for a malformed stored value', async () => {
      const { service } = setup({ findFirst: row({ variants: 'not-an-array' }) });

      const result = await service.getProduct('p-1');

      expect(result.variants).toEqual([]);
    });

    it('throws 404 PRODUCT_NOT_FOUND for an unknown / cross-tenant id', async () => {
      const { service } = setup({ findFirst: null });

      await expect(service.getProduct('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createProduct', () => {
    it('stamps the tenant gymId and persists the profile fields + variants', async () => {
      const { service, create } = setup();

      await service.createProduct(createInput({ name: 'New Tee', status: 'INACTIVE' }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: 'gym-1',
        name: 'New Tee',
        priceAmount: 2999,
        currency: 'USD',
        status: 'INACTIVE',
        images: ['https://cdn.example.com/a.jpg'],
        variants: VARIANTS,
      });
    });
  });

  describe('updateProduct', () => {
    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateProduct('p-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'p-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: 'Branded Tee',
        description: 'Updated copy.',
        priceAmount: 3499,
        currency: 'EUR',
        images: ['https://cdn.example.com/c.jpg'],
        variants: VARIANTS,
      });
      expect(data).not.toHaveProperty('status');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateProduct('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('deactivateProduct / reactivateProduct', () => {
    it('sets the status to INACTIVE on deactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.deactivateProduct('p-1');

      expect(update.mock.calls[0]?.[0]).toMatchObject({
        where: { id: 'p-1' },
        data: { status: ProductStatus.INACTIVE },
      });
    });

    it('sets the status to ACTIVE on reactivate', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.reactivateProduct('p-1');

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ status: ProductStatus.ACTIVE });
    });

    it('throws 404 for an unknown / cross-tenant id without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.deactivateProduct('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
