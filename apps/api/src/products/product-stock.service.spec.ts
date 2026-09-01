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
};

/**
 * Build the service over a hand-rolled Prisma mock. `$transaction` runs its
 * callback against the same mock client, so the assertions see exactly the writes
 * the real transaction would carry.
 */
function setup(product: Record<string, unknown> | null, callerRole = 'OWNER') {
  const productFindFirst = vi.fn(() => Promise.resolve(product));
  const productUpdate = vi.fn((_args: unknown) => Promise.resolve({}));
  const movementCreate = vi.fn((_args: unknown) => Promise.resolve(movementRow));
  const movementFindMany = vi.fn(() => Promise.resolve([movementRow]));
  const movementCount = vi.fn(() => Promise.resolve(1));
  const userFindMany = vi.fn(() =>
    Promise.resolve([{ id: 'u-1', name: 'Alex Owner', email: 'alex@example.com' }]),
  );

  const client = {
    product: { findFirst: productFindFirst, update: productUpdate },
    stockMovement: {
      create: movementCreate,
      findMany: movementFindMany,
      count: movementCount,
    },
    user: { findMany: userFindMany },
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { userId: 'u-1', role: callerRole } as unknown as TenantContext;

  return {
    service: new ProductStockService(prisma, tenant),
    productUpdate,
    movementCreate,
    movementFindMany,
  };
}

/** The `data` the service handed `stockMovement.create` on its first call. */
function movementData(ctx: ReturnType<typeof setup>): Record<string, unknown> {
  const args = ctx.movementCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
  return args.data;
}

const body = (over: Partial<AdjustStockData> = {}): AdjustStockData => ({
  variantIndex: null,
  reason: 'RECEIVE',
  note: '',
  ...over,
});

describe('ProductStockService.adjust', () => {
  it('applies a delta to the base position and records the movement', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: 4 });

    const result = await ctx.service.adjust('p-1', body({ delta: 3 }));

    expect(result.stock).toBe(7);
    expect(ctx.productUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: 7 } }));
    expect(movementData(ctx)).toMatchObject({
      variantIndex: null,
      delta: 3,
      resultingStock: 7,
      reason: 'RECEIVE',
      actorId: 'u-1',
    });
  });

  it('derives the delta for an absolute recount from the freshly read count', async () => {
    // The console rendered 4; the shelf actually holds 11. The recorded delta must
    // be computed here (+7), never taken from a client that may have read a stale
    // figure — that is the whole reason `setTo` exists alongside `delta`.
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: 4 });

    const result = await ctx.service.adjust('p-1', body({ setTo: 11, reason: 'RECOUNT' }));

    expect(result.stock).toBe(11);
    expect(movementData(ctx)).toMatchObject({ delta: 7, resultingStock: 11, reason: 'RECOUNT' });
  });

  it('refuses a RECOUNT from a caller without stocktake:perform (403)', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: 4 }, 'RECEPTIONIST');

    await expect(
      ctx.service.adjust('p-1', body({ setTo: 11, reason: 'RECOUNT' })),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_PERMISSION' } });
    expect(ctx.productUpdate).not.toHaveBeenCalled();
  });

  it('starts an untracked product counting from zero on its first movement', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: null });

    const result = await ctx.service.adjust('p-1', body({ delta: 6 }));

    expect(result.stock).toBe(6);
  });

  it('moves one variant and leaves its siblings untouched', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: VARIANTS, stock: null });

    const result = await ctx.service.adjust('p-1', body({ variantIndex: 1, delta: -2 }));

    expect(result.stock).toBe(7);
    const args = ctx.productUpdate.mock.calls[0]![0] as {
      data: { variants: Array<{ name: string; stock: number }> };
    };
    expect(args.data.variants).toEqual([
      expect.objectContaining({ name: 'Small', stock: 4 }),
      expect.objectContaining({ name: 'Large', stock: 7 }),
    ]);
    expect(movementData(ctx)).toMatchObject({
      variantIndex: 1,
      variantLabel: 'Large',
      delta: -2,
    });
  });

  it('refuses a change that would drive the count negative, writing nothing', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: 2 });

    const error = await ctx.service.adjust('p-1', body({ delta: -5 })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
    expect(ctx.movementCreate).not.toHaveBeenCalled();
  });

  it('refuses a recount that matches the current count rather than logging a no-op', async () => {
    const ctx = setup({ id: 'p-1', gymId: 'gym-1', variants: [], stock: 5 });

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

  it('404s an unknown / cross-tenant product without writing', async () => {
    const ctx = setup(null);

    const error = await ctx.service.adjust('nope', body({ delta: 1 })).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(ctx.productUpdate).not.toHaveBeenCalled();
  });
});

describe('ProductStockService.listMovements', () => {
  it('returns the ledger newest first with actor names resolved', async () => {
    const ctx = setup({ id: 'p-1' });

    const result = await ctx.service.listMovements('p-1', { page: 1, limit: 20 });

    expect(ctx.movementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({ actorName: 'Alex Owner', delta: 3, resultingStock: 3 }),
    );
    expect(result.total).toBe(1);
  });

  it('404s an unknown product rather than returning an empty ledger', async () => {
    const ctx = setup(null);

    const error = await ctx.service
      .listMovements('nope', { page: 1, limit: 20 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundException);
  });
});
