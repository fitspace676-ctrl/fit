import { describe, expect, it } from 'vitest';
import { DEFAULT_LOW_STOCK_THRESHOLD } from './products-admin';
import {
  adjustStockSchema,
  listStockMovementsQuerySchema,
  resolveLowStockThreshold,
  resolveStockLevel,
} from './stock';

describe('resolveLowStockThreshold', () => {
  it('prefers this branch’s own cushion over the product’s and the gym default', () => {
    // A flagship that turns over four times faster than the satellite needs its own
    // reorder point, and that is the whole reason the branch rung exists.
    expect(resolveLowStockThreshold({ branchThreshold: 20, productThreshold: 3 })).toBe(20);
  });

  it('falls through to the product when the branch has set none', () => {
    expect(resolveLowStockThreshold({ branchThreshold: null, productThreshold: 3 })).toBe(3);
  });

  it('falls all the way to the gym default when neither is set', () => {
    expect(resolveLowStockThreshold({})).toBe(DEFAULT_LOW_STOCK_THRESHOLD);
  });

  it('treats a zero at any rung as a real setting, not as "unset"', () => {
    // `0` means "only warn me when it is actually gone" — a deliberate choice a
    // truthiness check would silently replace with the default.
    expect(resolveLowStockThreshold({ branchThreshold: 0, productThreshold: 9 })).toBe(0);
    expect(resolveLowStockThreshold({ branchThreshold: null, productThreshold: 0 })).toBe(0);
    // …and it lines up with where `resolveStockLevel` draws the boundary.
    expect(resolveStockLevel({ lowestStock: 1, lowStockThreshold: 0 })).toBe('in');
    expect(resolveStockLevel({ lowestStock: 0, lowStockThreshold: 0 })).toBe('out');
  });
});

describe('adjustStockSchema', () => {
  const body = { locationId: 'loc-1', reason: 'RECEIVE', delta: 3 };

  it('accepts a movement that names the branch it changed', () => {
    const parsed = adjustStockSchema.parse(body);

    expect(parsed).toMatchObject({ locationId: 'loc-1', variantIndex: null, delta: 3, note: '' });
  });

  it('refuses a movement that names no branch', () => {
    // The one place multi-branch refuses rather than defaulting: the console always
    // knows which branch it is showing, and applying a satellite's count-sheet to
    // the flagship's row is the untargeted write Stage 4 exists to eliminate.
    expect(adjustStockSchema.safeParse({ reason: 'RECEIVE', delta: 3 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ ...body, locationId: '   ' }).success).toBe(false);
  });

  it('still demands exactly one of delta and setTo', () => {
    expect(adjustStockSchema.safeParse({ ...body, setTo: 5 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ locationId: 'loc-1', reason: 'RECOUNT' }).success).toBe(
      false,
    );
    expect(
      adjustStockSchema.safeParse({ locationId: 'loc-1', reason: 'RECOUNT', setTo: 11 }).success,
    ).toBe(true);
  });
});

describe('listStockMovementsQuerySchema', () => {
  it('leaves the branch out by default, so the pre-Stage-4 ledger stays reachable', () => {
    // A movement written before Stage 4 names no branch. All-branches is the only
    // view that can honestly show it, so an omitted filter must not become one.
    expect(listStockMovementsQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(listStockMovementsQuerySchema.parse({ locationId: 'loc-2' }).locationId).toBe('loc-2');
  });
});
