import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AdjustStockData } from '@fit/types';
import { ProductStockService } from './product-stock.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const VARIANTS = [
  { name: 'Small', sku: 'S', priceAmount: null, stock: 4 },
  { name: 'Large', sku: 'L', priceAmount: null, stock: 9 },
];

const movementRow = {
  id: 'm-1',
  variantIndex: null,
  variantLabel: '',
  delta: 3,
  resultingStock: 3,
  reason: 'RECEIVE',
  note: '',
  actorId: 'u-1',
  orderId: null,
  createdAt: new Date('2026-02-01T00:00:00.000Z'),
  location: { name: 'Riverside' },
};

/** The `ProductStock` row a branch holds, as the mock stores it. */
interface BranchRow {
  stock: number | null;
  variants: number[];
}

/**
 * Build the service over a hand-rolled Prisma mock. `$transaction` runs its
 * callback against the same mock client, so the assertions see exactly the writes
 * the real transaction would carry.
 *
 * The branch row and the product's roll-up are held as MUTABLE state, and the
 * mock's `updateMany` honours its own `stock: { gte: … }` bound, because that is
 * the behaviour under test since Stage 4: the count lives on the branch row, the
 * product column follows it by the same delta, and a claim that cannot be satisfied
 * reports `count: 0` rather than writing a negative.
 *
 * `branch` of `null` is a branch that has never counted this product — a missing
 * row, not a zero.
 */
function setup(product: Record<string, unknown> | null, branch: BranchRow | null = null) {
  const state = {
    product: product ? { ...product } : null,
    branch: branch ? { ...branch, variants: [...branch.variants] } : null,
  };

  const productFindFirst = vi.fn(() => Promise.resolve(state.product));
  const productUpdate = vi.fn((args: { data: Record<string, unknown> }) => {
    if (state.product) {
      const patch = args.data;
      if ('variants' in patch) {
        state.product.variants = patch.variants;
      }
      if ('stock' in patch) {
        const next = patch.stock as number | null | { increment: number };
        state.product.stock =
          next !== null && typeof next === 'object'
            ? ((state.product.stock as number | null) ?? 0) + next.increment
            : next;
      }
    }
    return Promise.resolve({});
  });

  const branchFindFirst = vi.fn(() => Promise.resolve(state.branch));
  const branchUpdateMany = vi.fn(
    (args: { where: { stock: { gte: number } }; data: { stock: { decrement: number } } }) => {
      const held = state.branch?.stock ?? null;
      if (held === null || held < args.where.stock.gte) {
        return Promise.resolve({ count: 0 });
      }
      state.branch!.stock = held - args.data.stock.decrement;
      return Promise.resolve({ count: 1 });
    },
  );
  const branchUpsert = vi.fn(
    (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
      if (!state.branch) {
        state.branch = {
          stock: (args.create.stock as number | null) ?? null,
          variants: (args.create.variants as number[]) ?? [],
        };
        return Promise.resolve({});
      }
      const patch = args.update;
      if ('variants' in patch) {
        state.branch.variants = patch.variants as number[];
      }
      if ('stock' in patch) {
        const next = patch.stock as { increment: number };
        state.branch.stock = (state.branch.stock ?? 0) + next.increment;
      }
      return Promise.resolve({});
    },
  );

  const locationFindFirst = vi.fn(() => Promise.resolve({ id: 'loc-1', name: 'Riverside' }));
  const movementCreate = vi.fn((_args: unknown) => Promise.resolve(movementRow));
  const movementFindMany = vi.fn(() => Promise.resolve([movementRow]));
  const movementCount = vi.fn(() => Promise.resolve(1));
  const userFindMany = vi.fn(() =>
    Promise.resolve([{ id: 'u-1', name: 'Alex Owner', email: 'alex@example.com' }]),
  );

  const client = {
    product: { findFirst: productFindFirst, update: productUpdate },
    productStock: {
      findFirst: branchFindFirst,
      updateMany: branchUpdateMany,
      upsert: branchUpsert,
    },
    location: { findFirst: locationFindFirst },
    stockMovement: {
      create: movementCreate,
      findMany: movementFindMany,
      count: movementCount,
    },
    user: { findMany: userFindMany },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { userId: 'u-1' } as unknown as TenantContext;

  return {
    service: new ProductStockService(prisma, tenant),
    state,
    productUpdate,
    branchUpdateMany,
    branchUpsert,
    locationFindFirst,
    movementCreate,
    movementFindMany,
    movementCount,
  };
}

/** The `data` the service handed `stockMovement.create` on its first call. */
function movementData(ctx: ReturnType<typeof setup>): Record<string, unknown> {
  const args = ctx.movementCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
  return args.data;
}

const body = (over: Partial<AdjustStockData> = {}): AdjustStockData => ({
  locationId: 'loc-1',
  variantIndex: null,
  reason: 'RECEIVE',
  note: '',
  ...over,
});

describe('ProductStockService.adjust', () => {
  it('applies a delta to the branch shelf and moves the roll-up by the same delta', async () => {
    // The gym holds 9 across two branches; this one holds 4. A delivery of 3 lands
    // here, so the branch reads 7 and the gym-wide total 12 — the two move together
    // or they stop reconciling.
    const ctx = setup(
      { id: 'p-1', gymId: 'gym-1', variants: [], stock: 9 },
      { stock: 4, variants: [] },
    );

    const result = await ctx.service.adjust('p-1', body({ delta: 3 }));

    expect(result.stock).toBe(7);
    expect(result.totalStock).toBe(12);
    expect(result.locationId).toBe('loc-1');
    expect(ctx.branchUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { stock: { increment: 3 } } }),
    );
    expect(ctx.productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: 3 } } }),
    );
    expect(movementData(ctx)).toMatchObject({
      locationId: 'loc-1',
      variantIndex: null,
      delta: 3,
      resultingStock: 7,
      reason: 'RECEIVE',
      actorId: 'u-1',
    });
  });

  it('claims a draw-down with a bound rather than writing back a computed figure', async () => {
    const ctx = setup(
      { id: 'p-1', gymId: 'gym-1', variants: [], stock: 9 },
      { stock: 4, variants: [] },
    );

    const result = await ctx.service.adjust('p-1', body({ delta: -3, reason: 'WRITE_OFF' }));

    expect(result.stock).toBe(1);
    const claim = ctx.branchUpdateMany.mock.calls[0]![0];
    expect(claim.where).toMatchObject({ stock: { gte: 3 } });
    expect(claim.data).toEqual({ stock: { decrement: 3 } });
    expect(ctx.productUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: -3 } } }),
    );
  });

  it('derives the delta for an absolute recount from the branch count, not the roll-up', async () => {
    // The console rendered 4; this branch's shelf actually holds 11. The recorded
    // delta must be computed here (+7) against the BRANCH, never against the gym
    // total and never from a client that may have read a stale figure.
    const ctx = setup(
      { id: 'p-1', gymId: 'gym-1', variants: [], stock: 9 },
      { stock: 4, variants: [] },
    );

    const result = await ctx.service.adjust('p-1', body({ setTo: 11, reason: 'RECOUNT' }));

    expect(result.stock).toBe(11);
    expect(movementData(ctx)).toMatchObject({ delta: 7, resultingStock: 11, reason: 'RECOUNT' });
  });

  it('starts a branch that has never counted this product from zero', async () => {
    // No row at all, so the first movement creates one — that is how a branch begins
    // counting after the Stage 4 migration left it empty.
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: null }, null);

    const result = await ctx.service.adjust('p-1', body({ delta: 6 }));

    expect(result.stock).toBe(6);
    expect(ctx.branchUpsert.mock.calls[0]![0].create).toMatchObject({
      locationId: 'loc-1',
      stock: 6,
    });
  });

  it('moves one variant on this branch and leaves its siblings untouched', async () => {
    const ctx = setup(
      { id: 'p-1', gymId: 'gym-1', variants: VARIANTS, stock: null },
      { stock: null, variants: [4, 9] },
    );

    const result = await ctx.service.adjust('p-1', body({ variantIndex: 1, delta: -2 }));

    expect(result.stock).toBe(7);
    expect(ctx.branchUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { variants: [4, 7] } }),
    );
    const args = ctx.productUpdate.mock.calls[0]![0] as {
      data: { variants: Array<{ name: string; stock: number }> };
    };
    expect(args.data.variants).toEqual([
      expect.objectContaining({ name: 'Small', stock: 4 }),
      expect.objectContaining({ name: 'Large', stock: 7 }),
    ]);
    expect(movementData(ctx)).toMatchObject({
      locationId: 'loc-1',
      variantIndex: 1,
      variantLabel: 'Large',
      delta: -2,
    });
  });

  it('refuses a change that would drive the branch count negative, writing nothing', async () => {
    // The gym holds 9, but only 2 of them are here. The correction is refused rather
    // than quietly reaching into another branch's shelf.
    const ctx = setup(
      { id: 'p-1', gymId: 'gym-1', variants: [], stock: 9 },
      { stock: 2, variants: [] },
    );

    const error = await ctx.service.adjust('p-1', body({ delta: -5 })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
    expect(ctx.movementCreate).not.toHaveBeenCalled();
  });

  it('refuses a recount that matches the current count rather than logging a no-op', async () => {
    const ctx = setup(
      { id: 'p-1', gymId: 'gym-1', variants: [], stock: 5 },
      { stock: 5, variants: [] },
    );

    const error = await ctx.service
      .adjust('p-1', body({ setTo: 5, reason: 'RECOUNT' }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.movementCreate).not.toHaveBeenCalled();
  });

  it('refuses the base position on a product that counts per variant', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: VARIANTS, stock: null });

    const error = await ctx.service.adjust('p-1', body({ delta: 1 })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
  });

  it('refuses a variant index the product no longer has', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: VARIANTS, stock: null });

    const error = await ctx.service
      .adjust('p-1', body({ variantIndex: 7, delta: 1 }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
  });

  it('404s an unknown / cross-tenant branch before touching the product', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: 4 });
    ctx.locationFindFirst.mockResolvedValueOnce(null as never);

    const error = await ctx.service.adjust('p-1', body({ delta: 1 })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
  });

  it('404s an unknown / cross-tenant product without writing', async () => {
    const ctx = setup(null);

    const error = await ctx.service.adjust('nope', body({ delta: 1 })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
  });
});

describe('ProductStockService.listMovements', () => {
  it('returns the ledger newest first with actor and branch names resolved', async () => {
    const ctx = setup({ id: 'p-1' });

    const result = await ctx.service.listMovements('p-1', { page: 1, limit: 20 });

    expect(ctx.movementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        actorName: 'Alex Owner',
        locationName: 'Riverside',
        delta: 3,
        resultingStock: 3,
      }),
    );
    expect(result.total).toBe(1);
  });

  it('narrows to one branch when asked, and to none when not', async () => {
    const ctx = setup({ id: 'p-1' });

    await ctx.service.listMovements('p-1', { page: 1, limit: 20, locationId: 'loc-2' });
    expect(ctx.movementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p-1', locationId: 'loc-2' } }),
    );

    await ctx.service.listMovements('p-1', { page: 1, limit: 20 });
    // No null arm: all-branches deliberately keeps the pre-Stage-4 rows that name
    // no branch, which a branch filter cannot honestly show.
    expect(ctx.movementFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { productId: 'p-1' } }),
    );
  });

  it('404s an unknown product rather than returning an empty ledger', async () => {
    const ctx = setup(null);

    const error = await ctx.service
      .listMovements('nope', { page: 1, limit: 20 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
  });
});
