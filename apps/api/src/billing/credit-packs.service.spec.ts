import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { CreditPackStatus, OrderStatus, PackagePlanStatus, PaymentStatus } from '@fit/db';
import { CreditPacksService } from './credit-packs.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

const GYM_ID = 'gym-1';
const USER_ID = 'user-1';
const MEMBER_ID = 'gm-1';

/** A UTC instant from calendar parts, keeping the tests readable. */
function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** A credit-pack row as the in-memory store holds it. */
interface PackRow {
  id: string;
  memberId: string;
  status: CreditPackStatus;
  remainingCredits: number;
  totalCredits: number;
  expiresAt: Date | null;
  createdAt: Date;
  name: string;
}

/** Whether `pack` satisfies the subset of `where` clauses the service builds. */
function matches(pack: PackRow, where: Record<string, unknown>): boolean {
  if (typeof where.memberId === 'string' && pack.memberId !== where.memberId) return false;
  if (typeof where.id === 'string' && pack.id !== where.id) return false;
  if (where.status !== undefined && pack.status !== where.status) return false;
  const rem = where.remainingCredits as { gt?: number } | undefined;
  if (rem?.gt !== undefined && !(pack.remainingCredits > rem.gt)) return false;
  if (Array.isArray(where.OR)) {
    const ok = (where.OR as Record<string, unknown>[]).some((clause) => {
      if ('expiresAt' in clause && clause.expiresAt === null) return pack.expiresAt === null;
      const gt = (clause.expiresAt as { gt?: Date } | undefined)?.gt;
      return gt !== undefined && pack.expiresAt !== null && pack.expiresAt.getTime() > gt.getTime();
    });
    if (!ok) return false;
  }
  return true;
}

/** FIFO order the service asks for: soonest `expiresAt` first, nulls last, then `createdAt`. */
function fifo(a: PackRow, b: PackRow): number {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime();
  if (a.expiresAt && !b.expiresAt) return -1;
  if (!a.expiresAt && b.expiresAt) return 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** Apply a `{ increment | decrement }` mutation to a pack's balance. */
function applyBalance(
  pack: PackRow,
  data: { remainingCredits?: { increment?: number; decrement?: number } },
) {
  const delta = data.remainingCredits;
  if (delta?.increment !== undefined) pack.remainingCredits += delta.increment;
  if (delta?.decrement !== undefined) pack.remainingCredits -= delta.decrement;
}

interface Options {
  plan?: {
    id: string;
    name: string;
    priceAmount: number;
    currency: string;
    sessionCount: number | null;
    creditValidityDays: number | null;
    status: PackagePlanStatus;
  } | null;
  packs?: PackRow[];
  entitlingSubscription?: boolean;
  member?: boolean;
  userId?: string | null;
}

function setup(opts?: Options) {
  const packs = opts?.packs ?? [];

  const orderCreate = vi.fn((_args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'order-1' }),
  );
  const paymentCreate = vi.fn((_args: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'pay-1' }),
  );
  const creditPackCreate = vi.fn((args: { data: Record<string, unknown> }) => {
    const id = `pack-${packs.length + 1}`;
    packs.push({
      id,
      memberId: args.data.memberId as string,
      status: args.data.status as CreditPackStatus,
      remainingCredits: args.data.remainingCredits as number,
      totalCredits: args.data.totalCredits as number,
      expiresAt: (args.data.expiresAt as Date | null) ?? null,
      createdAt: utc(2026, 6, 8),
      name: args.data.name as string,
    });
    return Promise.resolve({ id });
  });

  const creditPack = {
    findFirst: vi.fn((args: { where: Record<string, unknown> }) => {
      const found = packs.filter((p) => matches(p, args.where)).sort(fifo)[0];
      return Promise.resolve(found ? { id: found.id } : null);
    }),
    findMany: vi.fn((args: { where: Record<string, unknown> }) => {
      const rows = packs.filter((p) => matches(p, args.where)).sort(fifo);
      return Promise.resolve(
        rows.map((p) => ({
          id: p.id,
          totalCredits: p.totalCredits,
          remainingCredits: p.remainingCredits,
          expiresAt: p.expiresAt,
          name: p.name,
        })),
      );
    }),
    updateMany: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let count = 0;
      for (const p of packs) {
        if (matches(p, args.where)) {
          applyBalance(p, args.data);
          count += 1;
        }
      }
      return Promise.resolve({ count });
    }),
    create: creditPackCreate,
  };

  const client = {
    gymMember: {
      findFirst: vi.fn().mockResolvedValue(opts?.member === false ? null : { id: MEMBER_ID }),
    },
    packagePlan: {
      findFirst: vi.fn().mockResolvedValue(opts?.plan === undefined ? null : opts.plan),
    },
    subscription: {
      findFirst: vi.fn().mockResolvedValue(opts?.entitlingSubscription ? { id: 'sub-1' } : null),
    },
    order: { create: orderCreate },
    payment: { create: paymentCreate },
    creditPack,
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = {
    gymId: GYM_ID,
    userId: opts?.userId === undefined ? USER_ID : opts.userId,
  } as unknown as TenantContext;

  return {
    service: new CreditPacksService(prisma, tenant),
    packs,
    orderCreate,
    paymentCreate,
    creditPackCreate,
    creditPack,
    client,
  };
}

const activePlan = (
  over?: Partial<NonNullable<Options['plan']>>,
): NonNullable<Options['plan']> => ({
  id: 'plan-1',
  name: '10 Yoga Sessions',
  priceAmount: 5000,
  currency: 'USD',
  sessionCount: 10,
  creditValidityDays: 30,
  status: PackagePlanStatus.ACTIVE,
  ...over,
});

describe('CreditPacksService', () => {
  afterEach(() => vi.clearAllMocks());

  describe('purchasePack', () => {
    it('mints a pack and records a PAID order + CAPTURED stub payment', async () => {
      const ctx = setup({ plan: activePlan() });

      const result = await ctx.service.purchasePack({ packId: 'plan-1' });

      expect(result.creditPackId).toBe('pack-1');
      expect(ctx.orderCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        gymId: GYM_ID,
        packageId: 'plan-1',
        memberId: MEMBER_ID,
        total: 5000,
        currency: 'USD',
        status: OrderStatus.PAID,
      });
      expect(ctx.paymentCreate.mock.calls[0]?.[0]?.data).toMatchObject({
        amount: 5000,
        status: PaymentStatus.CAPTURED,
        provider: 'stub',
      });
      const packData = ctx.creditPackCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(packData).toMatchObject({
        memberId: MEMBER_ID,
        planId: 'plan-1',
        orderId: 'order-1',
        name: '10 Yoga Sessions',
        totalCredits: 10,
        remainingCredits: 10,
        status: CreditPackStatus.ACTIVE,
      });
      expect(packData.expiresAt).toBeInstanceOf(Date);
    });

    it('mints a never-expiring pack when the plan has no validity window', async () => {
      const ctx = setup({ plan: activePlan({ creditValidityDays: null }) });

      await ctx.service.purchasePack({ packId: 'plan-1' });

      const packData = ctx.creditPackCreate.mock.calls[0]?.[0]?.data as Record<string, unknown>;
      expect(packData.expiresAt).toBeNull();
    });

    it('422 PACK_UNAVAILABLE for a missing plan', async () => {
      const ctx = setup({ plan: null });

      const error = await ctx.service.purchasePack({ packId: 'nope' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'PACK_UNAVAILABLE',
      });
    });

    it('422 PACK_UNAVAILABLE for an INACTIVE plan', async () => {
      const ctx = setup({ plan: activePlan({ status: PackagePlanStatus.INACTIVE }) });

      const error = await ctx.service.purchasePack({ packId: 'plan-1' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
    });

    it('422 PACK_UNAVAILABLE for an unlimited (sessionCount: null) plan — not a countable pass', async () => {
      const ctx = setup({ plan: activePlan({ sessionCount: null }) });

      const error = await ctx.service.purchasePack({ packId: 'plan-1' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(ctx.creditPackCreate).not.toHaveBeenCalled();
    });

    it('403s a caller who is not a member of the gym', async () => {
      const ctx = setup({ plan: activePlan(), member: false });

      const error = await ctx.service.purchasePack({ packId: 'plan-1' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listMyCreditPacks', () => {
    it('returns usable packs soonest-expiring first, projecting the snapshot name as planTitle', async () => {
      const ctx = setup({
        packs: [
          {
            id: 'later',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 5,
            totalCredits: 5,
            expiresAt: utc(2026, 7, 1),
            createdAt: utc(2026, 6, 1),
            name: 'B',
          },
          {
            id: 'sooner',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 2,
            totalCredits: 10,
            expiresAt: utc(2026, 6, 15),
            createdAt: utc(2026, 6, 2),
            name: 'A',
          },
        ],
      });

      const result = await ctx.service.listMyCreditPacks();

      expect(result.packs.map((p) => p.id)).toEqual(['sooner', 'later']);
      expect(result.packs[0]).toMatchObject({
        id: 'sooner',
        totalCredits: 10,
        remainingCredits: 2,
        planTitle: 'A',
      });
      expect(result.packs[0]?.expiresAt).toBe(utc(2026, 6, 15).toISOString());
    });
  });

  describe('chargeSeatCredit', () => {
    it('draws nothing when an entitling subscription covers the member', async () => {
      const ctx = setup({
        entitlingSubscription: true,
        packs: [
          {
            id: 'p',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 3,
            totalCredits: 3,
            expiresAt: null,
            createdAt: utc(2026, 6, 1),
            name: 'P',
          },
        ],
      });

      const result = await ctx.service.chargeSeatCredit(ctx.client as never, MEMBER_ID);

      expect(result).toBeNull();
      expect(ctx.packs[0]?.remainingCredits).toBe(3); // untouched
    });

    it('consumes FIFO: the pack expiring soonest is decremented first', async () => {
      const ctx = setup({
        packs: [
          {
            id: 'sooner',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 1,
            totalCredits: 1,
            expiresAt: utc(2026, 6, 15),
            createdAt: utc(2026, 6, 1),
            name: 'A',
          },
          {
            id: 'later',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 1,
            totalCredits: 1,
            expiresAt: utc(2026, 7, 15),
            createdAt: utc(2026, 6, 1),
            name: 'B',
          },
        ],
      });

      const first = await ctx.service.chargeSeatCredit(ctx.client as never, MEMBER_ID);
      const second = await ctx.service.chargeSeatCredit(ctx.client as never, MEMBER_ID);

      expect(first).toBe('sooner');
      expect(second).toBe('later');
      expect(ctx.packs.find((p) => p.id === 'sooner')?.remainingCredits).toBe(0);
      expect(ctx.packs.find((p) => p.id === 'later')?.remainingCredits).toBe(0);
    });

    it('422 INSUFFICIENT_CREDITS when no subscription and no credits remain', async () => {
      const ctx = setup({ packs: [] });

      const error = await ctx.service
        .chargeSeatCredit(ctx.client as never, MEMBER_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toMatchObject({
        code: 'INSUFFICIENT_CREDITS',
      });
    });

    it('returns null instead of throwing when required: false (waitlist promotion)', async () => {
      const ctx = setup({ packs: [] });

      const result = await ctx.service.chargeSeatCredit(ctx.client as never, MEMBER_ID, {
        required: false,
      });

      expect(result).toBeNull();
    });

    it('skips an expired-but-not-yet-flipped pack and a depleted pack', async () => {
      const ctx = setup({
        packs: [
          {
            id: 'lapsed',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 5,
            totalCredits: 5,
            expiresAt: utc(2000, 1, 1),
            createdAt: utc(2026, 6, 1),
            name: 'lapsed',
          },
          {
            id: 'spent',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 0,
            totalCredits: 5,
            expiresAt: null,
            createdAt: utc(2026, 6, 1),
            name: 'spent',
          },
          {
            id: 'good',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 2,
            totalCredits: 2,
            expiresAt: utc(2099, 1, 1),
            createdAt: utc(2026, 6, 1),
            name: 'good',
          },
        ],
      });

      const charged = await ctx.service.chargeSeatCredit(ctx.client as never, MEMBER_ID);

      expect(charged).toBe('good');
    });
  });

  describe('refundCredit', () => {
    it('returns a credit to an ACTIVE pack', async () => {
      const ctx = setup({
        packs: [
          {
            id: 'p',
            memberId: MEMBER_ID,
            status: CreditPackStatus.ACTIVE,
            remainingCredits: 1,
            totalCredits: 3,
            expiresAt: null,
            createdAt: utc(2026, 6, 1),
            name: 'P',
          },
        ],
      });

      await ctx.service.refundCredit(ctx.client as never, 'p');

      expect(ctx.packs[0]?.remainingCredits).toBe(2);
    });

    it('is a no-op for a null id (subscription-covered / uncharged seat)', async () => {
      const ctx = setup({ packs: [] });

      await ctx.service.refundCredit(ctx.client as never, null);

      expect(ctx.creditPack.updateMany).not.toHaveBeenCalled();
    });

    it('does not refund to an EXPIRED pack (credit forfeited)', async () => {
      const ctx = setup({
        packs: [
          {
            id: 'p',
            memberId: MEMBER_ID,
            status: CreditPackStatus.EXPIRED,
            remainingCredits: 1,
            totalCredits: 3,
            expiresAt: utc(2000, 1, 1),
            createdAt: utc(2026, 6, 1),
            name: 'P',
          },
        ],
      });

      await ctx.service.refundCredit(ctx.client as never, 'p');

      expect(ctx.packs[0]?.remainingCredits).toBe(1); // unchanged
    });
  });
});
