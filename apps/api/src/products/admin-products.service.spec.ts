import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@fit/db';
import {
  productVariantsSchema,
  type CreateProductData,
  UNCATEGORISED_FILTER,
  type ListAdminProductsQuery,
  type ProductVariants,
  type UpdateProductData,
} from '@fit/types';
import { AdminProductsService } from './admin-products.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import type { GymLocaleService } from '../gyms/gym-locale.service';

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
  costAmount: number | null;
  currency: string;
  images: string[];
  variants: unknown;
  /** Base-position count; `null` is untracked, the column's default. */
  stock: number | null;
  /** Per-product reorder cushion; `null` uses the shared default. */
  lowStockThreshold: number | null;
  status: ProductStatus;
  category: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FindManyArgs {
  where?: { status?: unknown; OR?: unknown; categoryId?: unknown };
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
  costAmount: null,
  currency: 'USD',
  images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'],
  variants: VARIANTS,
  stock: null,
  lowStockThreshold: null,
  status: ProductStatus.ACTIVE,
  category: null,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-02T00:00:00.000Z'),
  ...over,
});

function setup(overrides?: {
  findMany?: ProductRecord[];
  count?: number;
  findFirst?: ProductRecord | null;
  /** What a `productCategory.findUnique` resolves to — `null` models another gym's id. */
  category?: { id: string } | null;
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

  const categoryFindUnique = vi.fn<(args: WhereArgs) => Promise<{ id: string } | null>>(() =>
    Promise.resolve(overrides?.category === undefined ? { id: 'c-1' } : overrides.category),
  );

  // The ledger writes that ride along with a count change. `createMany` covers
  // opening counts, `create` the single correction an edit can make.
  const movementCreate = vi.fn<(args: WhereArgs) => Promise<unknown>>(() => Promise.resolve({}));
  const movementCreateMany = vi.fn<(args: { data: unknown[] }) => Promise<unknown>>(() =>
    Promise.resolve({ count: 0 }),
  );

  const client: Record<string, unknown> = {
    product: { findMany, count, findFirst, create, update },
    productCategory: { findUnique: categoryFindUnique },
    stockMovement: { create: movementCreate, createMany: movementCreateMany },
  };
  // Counts and the movements explaining them are written together, so the mock
  // runs the callback against the same client rather than a second snapshot.
  client.$transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(client);

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;
  // The gym prices in GEL; a created product must be stamped with that, not USD.
  const locale = {
    get: () => Promise.resolve({ language: 'en', currency: 'GEL', timezone: 'Asia/Tbilisi' }),
  } as unknown as GymLocaleService;

  return {
    service: new AdminProductsService(prisma, tenant, locale),
    findMany,
    count,
    findFirst,
    create,
    update,
    categoryFindUnique,
    movementCreate,
    movementCreateMany,
  };
}

function query(overrides?: Partial<ListAdminProductsQuery>): ListAdminProductsQuery {
  return { page: 1, limit: 20, sort: 'name', dir: 'asc', ...overrides };
}

const createInput = (over?: Partial<CreateProductData>): CreateProductData => ({
  name: 'Branded Tee',
  description: 'A soft cotton training tee.',
  priceAmount: 2999,
  costAmount: null,
  images: ['https://cdn.example.com/a.jpg'],
  variants: VARIANTS,
  stock: null,
  lowStockThreshold: null,
  status: 'ACTIVE',
  categoryId: null,
  ...over,
});

const updateInput = (over?: Partial<UpdateProductData>): UpdateProductData => ({
  name: 'Branded Tee',
  description: 'Updated copy.',
  priceAmount: 3499,
  costAmount: null,
  images: ['https://cdn.example.com/c.jpg'],
  variants: VARIANTS,
  stock: null,
  lowStockThreshold: null,
  categoryId: null,
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
            costAmount: null,
            currency: 'USD',
            imageUrl: 'https://cdn.example.com/a.jpg',
            variantCount: 2,
            totalStock: 14,
            lowestStock: 4,
            stock: null,
            lowStockThreshold: null,
            status: 'ACTIVE',
            category: null,
            createdAt: '2026-02-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        summary: {
          productCount: 1,
          activeCount: 1,
          lowStockCount: 1,
          outOfStockCount: 0,
          lowStockThreshold: 5,
        },
      });
    });

    it('projects the joined category, and null for an unfiled product', async () => {
      const { service } = setup({
        findMany: [row({ category: { id: 'c-1', name: 'Protein' } }), row({ id: 'p-2' })],
        count: 2,
      });

      const result = await service.listProducts(query());

      expect(result.data[0]?.category).toEqual({ id: 'c-1', name: 'Protein' });
      expect(result.data[1]?.category).toBeNull();
    });

    it('reports a null imageUrl, zero variantCount and untracked stock for an empty product', async () => {
      const { service } = setup({ findMany: [row({ images: [], variants: [] })], count: 1 });

      const result = await service.listProducts(query());

      expect(result.data[0]).toMatchObject({
        imageUrl: null,
        variantCount: 0,
        totalStock: 0,
        lowestStock: null,
      });
    });

    it('summarizes status + stock across the whole filtered set, most-urgent variant per product', async () => {
      // p-1: Small (10), Large (4) → lowest 4 (low). p-2: Big (0) → out. p-3: healthy.
      // p-4: INACTIVE → excluded from every bucket. p-5: no variants → untracked.
      const scan = [
        row(),
        row({ id: 'p-2', variants: productVariantsSchema.parse([{ name: 'Big', stock: 0 }]) }),
        row({ id: 'p-3', variants: productVariantsSchema.parse([{ name: 'Ok', stock: 50 }]) }),
        row({ id: 'p-4', status: ProductStatus.INACTIVE }),
        row({ id: 'p-5', variants: [] }),
      ];
      const { service } = setup({ findMany: scan, count: 5 });

      const result = await service.listProducts(query());

      expect(result.summary).toEqual({
        productCount: 5,
        activeCount: 4,
        lowStockCount: 1,
        outOfStockCount: 1,
        lowStockThreshold: 5,
      });
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

    it('narrows to one category when a categoryId is given', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query({ categoryId: 'c-1' }));

      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ categoryId: 'c-1' });
    });

    it('narrows to the unfiled products for the uncategorised sentinel', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query({ categoryId: UNCATEGORISED_FILTER }));

      // The sentinel must become a NULL match, never a literal id lookup.
      expect(findMany.mock.calls[0]?.[0]?.where).toMatchObject({ categoryId: null });
    });

    it('does not constrain by category when the filter is omitted', async () => {
      const { service, findMany } = setup();

      await service.listProducts(query());

      expect(findMany.mock.calls[0]?.[0]?.where).not.toHaveProperty('categoryId');
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

      // Each listProducts fires two findMany calls (the page query, then the
      // whole-set summary scan), so the page query lands on the even indices.
      await service.listProducts(query({ sort: 'name', dir: 'desc' }));
      expect(findMany.mock.calls[0]?.[0]?.orderBy).toEqual({ name: 'desc' });

      await service.listProducts(query({ sort: 'price', dir: 'asc' }));
      expect(findMany.mock.calls[2]?.[0]?.orderBy).toEqual({ priceAmount: 'asc' });

      await service.listProducts(query({ sort: 'status', dir: 'asc' }));
      expect(findMany.mock.calls[4]?.[0]?.orderBy).toEqual({ status: 'asc' });

      await service.listProducts(query({ sort: 'createdAt', dir: 'desc' }));
      expect(findMany.mock.calls[6]?.[0]?.orderBy).toEqual({ createdAt: 'desc' });
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
        costAmount: null,
        currency: 'USD',
        imageUrl: 'https://cdn.example.com/a.jpg',
        variantCount: 2,
        totalStock: 14,
        lowestStock: 4,
        stock: null,
        lowStockThreshold: null,
        status: 'ACTIVE',
        category: null,
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
        costAmount: null,
        // Stamped from the gym's own locale, not from the request body.
        currency: 'GEL',
        status: 'INACTIVE',
        images: ['https://cdn.example.com/a.jpg'],
        variants: VARIANTS,
      });
    });

    it('shelves the product under a category in the caller gym', async () => {
      const { service, create, categoryFindUnique } = setup({ category: { id: 'c-1' } });

      await service.createProduct(createInput({ categoryId: 'c-1' }));

      expect(categoryFindUnique.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'c-1' });
      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ categoryId: 'c-1' });
    });

    it('rejects a category outside the caller gym instead of writing the foreign key', async () => {
      // The scoped client reads another gym's category as absent. Without this check
      // the raw FK would still satisfy the database and shelve across tenants.
      const { service, create } = setup({ category: null });

      await expect(service.createProduct(createInput({ categoryId: 'other-gym' }))).rejects.toThrow(
        NotFoundException,
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('skips the category lookup entirely when uncategorised', async () => {
      const { service, create, categoryFindUnique } = setup();

      await service.createProduct(createInput({ categoryId: null }));

      expect(categoryFindUnique).not.toHaveBeenCalled();
      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ categoryId: null });
    });

    it('persists the opening count and the reorder cushion for a variant-less product', async () => {
      // These arrive on every create body and used to be dropped on the floor: a
      // product created with 25 on the shelf was stored as untracked.
      const { service, create } = setup();

      await service.createProduct(createInput({ variants: [], stock: 25, lowStockThreshold: 7 }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ stock: 25, lowStockThreshold: 7 });
    });

    it('records the opening count as a RECEIVE movement', async () => {
      const { service, movementCreateMany } = setup();

      await service.createProduct(createInput({ variants: [], stock: 25 }));

      expect(movementCreateMany.mock.calls[0]?.[0]?.data).toEqual([
        expect.objectContaining({
          gymId: 'gym-1',
          variantIndex: null,
          variantLabel: '',
          delta: 25,
          resultingStock: 25,
          reason: 'RECEIVE',
          actorId: 'u-1',
        }),
      ]);
    });

    it('opens a movement per variant that starts above zero, and none for an empty shelf', async () => {
      const { service, movementCreateMany } = setup();

      await service.createProduct(
        createInput({
          variants: productVariantsSchema.parse([
            { name: 'Small', stock: 4 },
            { name: 'Large', stock: 0 },
          ]),
        }),
      );

      expect(movementCreateMany.mock.calls[0]?.[0]?.data).toEqual([
        expect.objectContaining({ variantIndex: 0, variantLabel: 'Small', delta: 4 }),
      ]);
    });

    it('leaves the base column null for a product that counts per variant', async () => {
      // The two tracking modes are alternatives; a base count alongside variant
      // counts would be a second, contradictory answer to "how many?".
      const { service, create, movementCreateMany } = setup();

      await service.createProduct(createInput({ variants: VARIANTS, stock: 99 }));

      expect(create.mock.calls[0]?.[0]?.data).toMatchObject({ stock: null });
      // …and the opening rows are the variants', not a base one.
      const rows = movementCreateMany.mock.calls[0]?.[0]?.data ?? [];
      expect(rows).toHaveLength(2);
    });

    it('writes no movement for a product created untracked or empty', async () => {
      const { service, movementCreateMany } = setup();

      await service.createProduct(createInput({ variants: [], stock: null }));
      await service.createProduct(createInput({ variants: [], stock: 0 }));

      expect(movementCreateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('rejects a category outside the caller gym instead of writing the foreign key', async () => {
      const { service, update } = setup({ findFirst: row(), category: null });

      await expect(
        service.updateProduct('p-1', updateInput({ categoryId: 'other-gym' })),
      ).rejects.toThrow(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it('re-shelves the product, and un-shelves it on null', async () => {
      const ctx = setup({ findFirst: row(), category: { id: 'c-2' } });

      await ctx.service.updateProduct('p-1', updateInput({ categoryId: 'c-2' }));
      expect(ctx.update.mock.calls[0]?.[0]?.data).toMatchObject({ categoryId: 'c-2' });

      vi.clearAllMocks();
      const bare = setup({ findFirst: row() });
      await bare.service.updateProduct('p-1', updateInput({ categoryId: null }));
      expect(bare.update.mock.calls[0]?.[0]?.data).toMatchObject({ categoryId: null });
    });

    it('updates the profile fields (not status) and returns the detail', async () => {
      const { service, findFirst, update } = setup({ findFirst: row() });

      await service.updateProduct('p-1', updateInput());

      expect(findFirst.mock.calls[0]?.[0]?.where).toMatchObject({ id: 'p-1' });
      const data = update.mock.calls[0]?.[0]?.data ?? {};
      expect(data).toMatchObject({
        name: 'Branded Tee',
        description: 'Updated copy.',
        priceAmount: 3499,
        images: ['https://cdn.example.com/c.jpg'],
        variants: VARIANTS,
      });
      expect(data).not.toHaveProperty('status');
      // An existing product keeps the currency it was created in.
      expect(data).not.toHaveProperty('currency');
    });

    it('throws 404 for an unknown / cross-tenant id', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(service.updateProduct('missing', updateInput())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('carries variant counts over from the row instead of taking the form’s copy', async () => {
      // The form was rendered before this save. Submitting the counts it drew
      // reverted any adjustment made in between — silently, and with no movement
      // to explain why the ledger and the count then disagreed.
      const { service, update, movementCreate } = setup({
        findFirst: row({
          variants: productVariantsSchema.parse([
            { name: 'Small', sku: 'TS-S', priceAmount: 2500, stock: 3 },
            { name: 'Large', stock: 4 },
          ]),
        }),
      });

      await service.updateProduct('p-1', updateInput({ variants: VARIANTS }));

      // VARIANTS carries the stale 10; the row's 3 wins, and the renamed/repriced
      // fields from the form still land.
      expect(update.mock.calls[0]?.[0]?.data?.variants).toEqual([
        expect.objectContaining({ name: 'Small', sku: 'TS-S', priceAmount: 2500, stock: 3 }),
        expect.objectContaining({ name: 'Large', stock: 4 }),
      ]);
      expect(movementCreate).not.toHaveBeenCalled();
    });

    it('persists a corrected base count as a delta against the live figure', async () => {
      const { service, update, movementCreate } = setup({
        findFirst: row({ variants: [], stock: 4 }),
      });

      await service.updateProduct('p-1', updateInput({ variants: [], stock: 11 }));

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ stock: 11 });
      expect(movementCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        variantIndex: null,
        // 11 counted against the 4 on the row — not against whatever the form drew.
        delta: 7,
        resultingStock: 11,
        reason: 'ADJUSTMENT',
        actorId: 'u-1',
      });
    });

    it('starts counting a previously untracked product from zero', async () => {
      const { service, movementCreate } = setup({ findFirst: row({ variants: [], stock: null }) });

      await service.updateProduct('p-1', updateInput({ variants: [], stock: 6 }));

      expect(movementCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        delta: 6,
        resultingStock: 6,
      });
    });

    it('records nothing when the base count is unchanged', async () => {
      const { service, movementCreate } = setup({ findFirst: row({ variants: [], stock: 4 }) });

      await service.updateProduct('p-1', updateInput({ variants: [], stock: 4 }));

      expect(movementCreate).not.toHaveBeenCalled();
    });

    it('turns tracking off on a cleared count without inventing a write-off', async () => {
      // "We stopped counting this" is a change of mode, not stock leaving the
      // shelf; a movement here would put a loss in the ledger that never happened.
      const { service, update, movementCreate } = setup({
        findFirst: row({ variants: [], stock: 4 }),
      });

      await service.updateProduct('p-1', updateInput({ variants: [], stock: null }));

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ stock: null });
      expect(movementCreate).not.toHaveBeenCalled();
    });

    it('opens a count for a variant this edit added', async () => {
      const { service, movementCreateMany } = setup({
        findFirst: row({ variants: productVariantsSchema.parse([{ name: 'Small', stock: 3 }]) }),
      });

      await service.updateProduct(
        'p-1',
        updateInput({
          variants: productVariantsSchema.parse([
            { name: 'Small', stock: 999 },
            { name: 'Medium', stock: 8 },
          ]),
        }),
      );

      expect(movementCreateMany.mock.calls[0]?.[0]?.data).toEqual([
        expect.objectContaining({ variantIndex: 1, variantLabel: 'Medium', delta: 8 }),
      ]);
    });

    it('persists the reorder cushion', async () => {
      const { service, update } = setup({ findFirst: row() });

      await service.updateProduct('p-1', updateInput({ lowStockThreshold: 5 }));

      expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ lowStockThreshold: 5 });
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

  describe('setProductCategory', () => {
    it('writes the category and nothing else', async () => {
      // The whole point of the endpoint: filing a product must not replay any
      // other field, so a colleague's concurrent edit survives the move.
      const { service, update } = setup({ findFirst: row() });

      await service.setProductCategory('p-1', { categoryId: 'c-1' });

      expect(update.mock.calls[0]?.[0]).toEqual({
        where: { id: 'p-1' },
        data: { categoryId: 'c-1' },
      });
    });

    it('takes a product off its shelf when given null', async () => {
      const { service, update, categoryFindUnique } = setup({ findFirst: row() });

      await service.setProductCategory('p-1', { categoryId: null });

      expect(update.mock.calls[0]?.[0]?.data).toEqual({ categoryId: null });
      // Nothing to resolve — null is not a shelf that could be another gym's.
      expect(categoryFindUnique).not.toHaveBeenCalled();
    });

    it('throws 404 for an unknown / cross-tenant product without updating', async () => {
      const { service, update } = setup({ findFirst: null });

      await expect(
        service.setProductCategory('missing', { categoryId: 'c-1' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it("throws 404 for another gym's category rather than filing onto it", async () => {
      const { service, update } = setup({ findFirst: row(), category: null });

      await expect(service.setProductCategory('p-1', { categoryId: 'c-9' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});

describe('AdminProductsService — base-position stock', () => {
  it("reports a variant-less product's base count as its total and lowest", async () => {
    const { service } = setup({
      findMany: [row({ variants: [], stock: 3, lowStockThreshold: null })],
      count: 1,
    });

    const result = await service.listProducts(query());

    expect(result.data[0]).toMatchObject({ totalStock: 3, lowestStock: 3, stock: 3 });
  });

  it('keeps an uncounted product untracked rather than calling it out of stock', async () => {
    // `null` and `0` are different facts, and the badge renders them differently:
    // nobody has counted it, versus it is counted and empty.
    const { service } = setup({
      findMany: [row({ variants: [], stock: null })],
      count: 1,
    });

    const result = await service.listProducts(query());

    expect(result.data[0]).toMatchObject({ totalStock: 0, lowestStock: null, stock: null });
  });

  it("honours a product's own threshold over the shared default in the KPI tally", async () => {
    // 8 units is comfortable against the default cushion of 5, but this product
    // sells fast and asked to be warned at 10.
    const { service } = setup({
      findMany: [row({ variants: [], stock: 8, lowStockThreshold: 10 })],
      count: 1,
    });

    const result = await service.listProducts(query());

    expect(result.summary).toMatchObject({ lowStockCount: 1, outOfStockCount: 0 });
  });

  it('ignores the base column for a product that counts per variant', async () => {
    // Two counts would be two answers to "how many do I have?" — the variants win.
    const { service } = setup({
      findMany: [row({ variants: VARIANTS, stock: 99 })],
      count: 1,
    });

    const result = await service.listProducts(query());

    expect(result.data[0]).toMatchObject({ totalStock: 14, stock: null });
  });
});
