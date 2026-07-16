import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import { AdminProductCategoriesService } from './admin-product-categories.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A category row as the service's projection selects it. */
interface CategoryRecord {
  id: string;
  name: string;
  _count: { products: number };
}

interface Args {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  orderBy?: unknown;
  select?: unknown;
}

const row = (over?: Partial<CategoryRecord>): CategoryRecord => ({
  id: 'c-1',
  name: 'Protein',
  _count: { products: 3 },
  ...over,
});

/** The error Prisma raises when `@@unique([gymId, name])` is violated. */
const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });

function setup(overrides?: {
  findMany?: CategoryRecord[];
  findUnique?: { id: string } | null;
  productCount?: number;
  createRejects?: Error;
  updateRejects?: Error;
}) {
  const findMany = vi.fn<(args: Args) => Promise<CategoryRecord[]>>(() =>
    Promise.resolve(overrides?.findMany ?? []),
  );
  // Present by default: most cases operate on a category that exists in this gym.
  const findUnique = vi.fn<(args: Args) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.findUnique === undefined ? { id: 'c-1' } : overrides.findUnique),
  );
  const create = vi.fn<(args: Args) => Promise<CategoryRecord>>(() =>
    overrides?.createRejects ? Promise.reject(overrides.createRejects) : Promise.resolve(row()),
  );
  const update = vi.fn<(args: Args) => Promise<CategoryRecord>>(() =>
    overrides?.updateRejects
      ? Promise.reject(overrides.updateRejects)
      : Promise.resolve(row({ name: 'Supplements' })),
  );
  const deleteFn = vi.fn<(args: Args) => Promise<CategoryRecord>>(() => Promise.resolve(row()));
  const productCount = vi.fn<(args: Args) => Promise<number>>(() =>
    Promise.resolve(overrides?.productCount ?? 0),
  );

  const client: Record<string, unknown> = {
    productCategory: { findMany, findUnique, create, update, delete: deleteFn },
    product: { count: productCount },
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new AdminProductCategoriesService(prisma, tenant),
    findMany,
    findUnique,
    create,
    update,
    deleteFn,
    productCount,
  };
}

describe('AdminProductCategoriesService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('listCategories', () => {
    it('returns each category with its product count, ordered by name', async () => {
      const ctx = setup({
        findMany: [row(), row({ id: 'c-2', name: 'Drinks', _count: { products: 0 } })],
      });

      const result = await ctx.service.listCategories();

      expect(result.data).toEqual([
        { id: 'c-1', name: 'Protein', productCount: 3 },
        { id: 'c-2', name: 'Drinks', productCount: 0 },
      ]);
      expect(ctx.findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ name: 'asc' });
    });

    it('is an empty list for a gym that has not organised its catalogue', async () => {
      const ctx = setup({ findMany: [] });
      await expect(ctx.service.listCategories()).resolves.toEqual({ data: [] });
    });
  });

  describe('createCategory', () => {
    it('stamps the caller gym and returns the new category', async () => {
      const ctx = setup();

      const result = await ctx.service.createCategory({ name: 'Protein' });

      expect(ctx.create.mock.calls[0]?.[0]?.data).toEqual({ gymId: 'gym-1', name: 'Protein' });
      expect(result).toEqual({ id: 'c-1', name: 'Protein', productCount: 3 });
    });

    it('turns a duplicate name into a 409 rather than leaking the Prisma error', async () => {
      const ctx = setup({ createRejects: duplicate() });

      await expect(ctx.service.createCategory({ name: 'Protein' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rethrows an unrelated failure untouched', async () => {
      const boom = new Error('connection reset');
      const ctx = setup({ createRejects: boom });

      await expect(ctx.service.createCategory({ name: 'Protein' })).rejects.toBe(boom);
    });
  });

  describe('renameCategory', () => {
    it('renames a category in the caller gym', async () => {
      const ctx = setup();

      const result = await ctx.service.renameCategory('c-1', { name: 'Supplements' });

      expect(ctx.update.mock.calls[0]?.[0]?.data).toEqual({ name: 'Supplements' });
      expect(result.name).toBe('Supplements');
    });

    it('is a 404 for a category outside the caller gym', async () => {
      const ctx = setup({ findUnique: null });

      await expect(ctx.service.renameCategory('other', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(ctx.update).not.toHaveBeenCalled();
    });

    it('turns a colliding name into a 409', async () => {
      const ctx = setup({ updateRejects: duplicate() });

      await expect(ctx.service.renameCategory('c-1', { name: 'Drinks' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('deleteCategory', () => {
    it('reports how many products the delete un-shelved, counted before the delete', async () => {
      const ctx = setup({ productCount: 3 });

      const result = await ctx.service.deleteCategory('c-1');

      // Counted while the link still exists — `SetNull` clears it as the delete runs.
      expect(ctx.productCount.mock.calls[0]?.[0]?.where).toEqual({ categoryId: 'c-1' });
      expect(ctx.productCount.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
        ctx.deleteFn.mock.invocationCallOrder[0] ?? 0,
      );
      expect(result).toEqual({ unshelved: 3 });
    });

    it('is a 404 for a category outside the caller gym, and deletes nothing', async () => {
      const ctx = setup({ findUnique: null });

      await expect(ctx.service.deleteCategory('other')).rejects.toBeInstanceOf(NotFoundException);
      expect(ctx.deleteFn).not.toHaveBeenCalled();
    });
  });
});
