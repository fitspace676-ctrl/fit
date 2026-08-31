import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import type { MediaCleanupService } from '../storage/media-cleanup.service';

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

/** A `ProductStock` row — what one branch holds for one product, since Stage 4. */
interface BranchRecord {
  id: string;
  productId: string;
  locationId: string;
  stock: number | null;
  variants: number[];
  lowStockThreshold: number | null;
}

const branchRow = (over?: Partial<BranchRecord>): BranchRecord => ({
  id: 'ps-1',
  productId: 'p-1',
  locationId: 'loc-1',
  stock: null,
  variants: [],
  lowStockThreshold: null,
  ...over,
});

function setup(overrides?: {
  findMany?: ProductRecord[];
  count?: number;
  findFirst?: ProductRecord | null;
  /** What a `productCategory.findUnique` resolves to — `null` models another gym's id. */
  category?: { id: string } | null;
  /** The `ProductStock` rows the branch reads and the form's fan-out see. */
  branchRows?: BranchRecord[];
  /** The gym's default branch; `null` models a gym that has not elected one. */
  defaultLocation?: { id: string; name: string } | null;
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

  // Since Stage 4 the authoritative counts live on `ProductStock`, one row per
  // (product, branch), and `Product.stock` is their roll-up. The rows are held as
  // MUTABLE state so a test can assert where a figure actually landed, and
  // `updateMany` honours its own `stock: { gte: … }` bound the way Postgres does.
  const branchRows: BranchRecord[] = (overrides?.branchRows ?? []).map((r) => ({
    ...r,
    variants: [...r.variants],
  }));
  const branchFindMany = vi.fn((_args: unknown) => Promise.resolve(branchRows));
  const branchCreate = vi.fn((args: { data: Record<string, unknown> }) => {
    branchRows.push(
      branchRow({
        id: `ps-${branchRows.length + 1}`,
        productId: args.data.productId as string,
        locationId: args.data.locationId as string,
        stock: (args.data.stock as number | null) ?? null,
        variants: (args.data.variants as number[]) ?? [],
      }),
    );
    return Promise.resolve({});
  });
  const branchUpdate = vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
    const target = branchRows.find((r) => r.id === args.where.id);
    if (target) {
      if ('variants' in args.data) {
        target.variants = args.data.variants as number[];
      }
      if ('stock' in args.data) {
        const next = args.data.stock as number | null | { increment: number };
        target.stock =
          next !== null && typeof next === 'object' ? (target.stock ?? 0) + next.increment : next;
      }
    }
    return Promise.resolve({});
  });
  const branchUpdateMany = vi.fn(
    (args: {
      where: { id: string; stock: { gte: number } };
      data: { stock: { decrement: number } };
    }) => {
      const target = branchRows.find((r) => r.id === args.where.id);
      if (!target || target.stock === null || target.stock < args.where.stock.gte) {
        return Promise.resolve({ count: 0 });
      }
      target.stock -= args.data.stock.decrement;
      return Promise.resolve({ count: 1 });
    },
  );
  const locationFindFirst = vi.fn((_args: unknown) =>
    Promise.resolve(
      overrides?.defaultLocation === undefined
        ? { id: 'loc-1', name: 'Riverside' }
        : overrides.defaultLocation,
    ),
  );

  const client: Record<string, unknown> = {
    product: { findMany, count, findFirst, create, update },
    productCategory: { findUnique: categoryFindUnique },
    productStock: {
      findMany: branchFindMany,
      create: branchCreate,
      update: branchUpdate,
      updateMany: branchUpdateMany,
    },
    location: { findFirst: locationFindFirst },
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

  // Media cleanup is a best-effort side effect; stub it so these tests stay about
  // the service's own writes.
  const media = {
    discardUnreferenced: vi.fn(() => Promise.resolve()),
  } as unknown as MediaCleanupService;

  return {
    service: new AdminProductsService(prisma, tenant, locale, media),
    findMany,
    count,
    findFirst,
    create,
    update,
    categoryFindUnique,
    movementCreate,
    movementCreateMany,
    branchRows,
    branchCreate,
    branchUpdate,
    locationFindFirst,
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
        variants: [{ variantIndex: 0, name: 'Big', sku: 'AB-L', stock: 2, threshold: 5 }],
      });
      // The healthy "Small" variant (stock 10) is dropped from p-1's row.
      expect(result.data[1]!.variants).toEqual([
        { variantIndex: 1, name: 'Large', sku: '', stock: 4, threshold: 5 },
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

    it('judges each position against its own cushion when no ceiling is given', async () => {
      // Without an explicit `threshold` the report walks the three rungs. p-1 sets
      // its own cushion of 3, so its Large (4) is fine; p-2 sets none and falls to
      // the gym default of 5, so its Big (2) is low. A single flat number could not
      // have produced both answers.
      const { service } = setup({
        findMany: [
          row({ lowStockThreshold: 3 }),
          row({
            id: 'p-2',
            name: 'Aqua Bottle',
            images: [],
            variants: productVariantsSchema.parse([{ name: 'Big', sku: 'AB-L', stock: 2 }]),
          }),
        ],
      });

      const result = await service.listLowStock({});

      expect(result.threshold).toBeNull();
      expect(result.data.map((product) => product.id)).toEqual(['p-2']);
      expect(result.data[0]!.variants[0]!.threshold).toBe(5);
    });

    it('reads a branch shelf, and lets that branch override the cushion', async () => {
      // The flagship turns over faster, so it carries its own reorder point of 8 —
      // the FIRST rung, ahead of the product's and the gym's.
      const ctx = setup({
        findMany: [row({ lowStockThreshold: 3 })],
        branchRows: [branchRow({ variants: [10, 6], lowStockThreshold: 8 })],
      });

      const result = await ctx.service.listLowStock({ locationId: 'loc-1' });

      expect(result.locationId).toBe('loc-1');
      expect(result.locationName).toBe('Riverside');
      expect(result.data[0]!.variants).toEqual([
        { variantIndex: 1, name: 'Large', sku: '', stock: 6, threshold: 8 },
      ]);
    });

    it('says nothing about a branch that has recorded no count at all', async () => {
      // The Stage 4 migration leaves every non-default branch with no row. Reading
      // that as zero would scream about every line at that branch on deploy morning,
      // drowning the real signal — so an unrecorded position has no shortfall.
      const ctx = setup({ findMany: [row()], branchRows: [] });

      const result = await ctx.service.listLowStock({ locationId: 'loc-2' });

      expect(result.data).toEqual([]);
    });

    it('404s an unknown branch rather than quietly answering for the whole gym', async () => {
      const ctx = setup({ findMany: [row()], defaultLocation: null });
      ctx.locationFindFirst.mockResolvedValueOnce(null);

      await expect(ctx.service.listLowStock({ locationId: 'nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listInventory', () => {
    const inventoryQuery = { page: 1, limit: 50 };

    it('aggregates across branches when none is selected, one row per position', async () => {
      // The all-branches view is the roll-up on `Product`, so the row count, the
      // pager and every tile keep the values they had before stock went per branch.
      const ctx = setup({ findMany: [row({ costAmount: 100 })] });

      const result = await ctx.service.listInventory(inventoryQuery);

      expect(result.total).toBe(2);
      expect(result.data.map((position) => position.stock)).toEqual([10, 4]);
      expect(result.summary).toMatchObject({
        positionCount: 2,
        trackedCount: 2,
        totalUnits: 14,
        totalValue: 1400,
        lowCount: 1,
        locationId: null,
        locationName: null,
      });
      // No branch is selected, so the branch rung is never consulted.
      expect(result.data[0]!.lowStockThreshold).toBe(5);
    });

    it('counts one branch’s shelves when it is selected, keeping the same rows', async () => {
      const ctx = setup({
        findMany: [row({ costAmount: 100 })],
        branchRows: [branchRow({ variants: [6, 1], lowStockThreshold: 2 })],
      });

      const result = await ctx.service.listInventory({ ...inventoryQuery, locationId: 'loc-1' });

      // Same two positions, different figures — the table does not expand by branch.
      expect(result.total).toBe(2);
      expect(result.data.map((position) => position.stock)).toEqual([6, 1]);
      expect(result.data[0]!.lowStockThreshold).toBe(2);
      expect(result.summary).toMatchObject({
        totalUnits: 7,
        totalValue: 700,
        lowCount: 1,
        locationId: 'loc-1',
        locationName: 'Riverside',
      });
    });

    it('reports a branch with no row as uncounted, not as empty', async () => {
      // `null` is "nothing recorded here"; `0` would assert somebody counted and
      // found none. Only the second belongs in the out-of-stock tile.
      const ctx = setup({ findMany: [row({ costAmount: 100 })], branchRows: [] });

      const result = await ctx.service.listInventory({ ...inventoryQuery, locationId: 'loc-2' });

      expect(result.data.map((position) => position.stock)).toEqual([null, null]);
      expect(result.summary).toMatchObject({
        trackedCount: 0,
        outCount: 0,
        totalUnits: 0,
        valuedPositions: 0,
      });
    });

    it('reads a slot past the end of a counted branch as a real zero', async () => {
      // The branch IS counted; that variant simply has not arrived here yet.
      const ctx = setup({ findMany: [row()], branchRows: [branchRow({ variants: [6] })] });

      const result = await ctx.service.listInventory({ ...inventoryQuery, locationId: 'loc-1' });

      expect(result.data.map((position) => position.stock)).toEqual([6, 0]);
      expect(result.summary).toMatchObject({ trackedCount: 2, outCount: 1 });
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

    it('lands a corrected base count on the default branch, and the roll-up with it', async () => {
      const ctx = setup({
        findFirst: row({ variants: [], stock: 4 }),
        branchRows: [branchRow({ stock: 4 })],
      });

      await ctx.service.updateProduct('p-1', updateInput({ variants: [], stock: 11 }));

      // The roll-up moves by the delta, claimed rather than written back…
      expect(ctx.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { stock: { increment: 7 } } }),
      );
      // …and the units actually land on a shelf, because a figure with no branch
      // row behind it is exactly the drift `Product.stock` must never carry.
      expect(ctx.branchRows[0]!.stock).toBe(11);
      expect(ctx.movementCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        locationId: 'loc-1',
        variantIndex: null,
        // 11 counted against the 4 on the row — not against whatever the form drew.
        delta: 7,
        // The count AT that branch, which is what the ledger means since Stage 4.
        resultingStock: 11,
        reason: 'ADJUSTMENT',
        actorId: 'u-1',
      });
    });

    it('refuses a correction bigger than the default branch holds', async () => {
      // The gym holds 9, but only 2 of them are here. Clamping, or quietly reaching
      // into the other branch's shelf, would be the untargeted write Stage 4 removes.
      const ctx = setup({
        findFirst: row({ variants: [], stock: 9 }),
        branchRows: [branchRow({ stock: 2 })],
      });

      await expect(
        ctx.service.updateProduct('p-1', updateInput({ variants: [], stock: 1 })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.branchRows[0]!.stock).toBe(2);
    });

    it('starts counting a previously untracked product from zero, on the default branch', async () => {
      const ctx = setup({ findFirst: row({ variants: [], stock: null }) });

      await ctx.service.updateProduct('p-1', updateInput({ variants: [], stock: 6 }));

      // NULL → tracked is a mode switch, not a claim: both sides are written
      // absolutely from the same figure, so they are equal by construction.
      expect(ctx.branchCreate.mock.calls[0]![0].data).toMatchObject({
        locationId: 'loc-1',
        stock: 6,
      });
      expect(ctx.update).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: 6 } }));
      expect(ctx.movementCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        delta: 6,
        resultingStock: 6,
      });
    });

    it('refuses an opening count at a gym with no default branch', async () => {
      // The operator typed a figure that has nowhere to go. Creating the product
      // untracked would discard it silently; writing it to the column alone would
      // leave units no branch row accounts for.
      const ctx = setup({ findFirst: row({ variants: [], stock: null }), defaultLocation: null });

      await expect(
        ctx.service.updateProduct('p-1', updateInput({ variants: [], stock: 6 })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records nothing when the base count is unchanged', async () => {
      const { service, movementCreate } = setup({ findFirst: row({ variants: [], stock: 4 }) });

      await service.updateProduct('p-1', updateInput({ variants: [], stock: 4 }));

      expect(movementCreate).not.toHaveBeenCalled();
    });

    it('turns tracking off on a cleared count without inventing a write-off', async () => {
      // "We stopped counting this" is a change of mode, not stock leaving the
      // shelf; a movement here would put a loss in the ledger that never happened.
      const ctx = setup({
        findFirst: row({ variants: [], stock: 4 }),
        branchRows: [branchRow({ stock: 4 })],
      });

      await ctx.service.updateProduct('p-1', updateInput({ variants: [], stock: null }));

      expect(ctx.update).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: null } }));
      // "We stopped counting this" is a fact about the product, so every branch row
      // stops counting too — otherwise the roll-up says nothing while rows say 4.
      expect(ctx.branchRows[0]!.stock).toBeNull();
      expect(ctx.movementCreate).not.toHaveBeenCalled();
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
