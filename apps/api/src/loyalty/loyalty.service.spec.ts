import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  _sum?: Record<string, unknown>;
  [key: string]: unknown;
}

function rewardRecord(over?: Record<string, unknown>) {
  return {
    id: 'reward-1',
    name: 'Free PT session',
    description: '',
    pointsCost: 500,
    type: 'pt_session',
    active: true,
    stock: null,
    // Stage 7 exclusivity: NULL means "honoured at every branch".
    locationId: null,
    location: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...over,
  };
}

function redemptionRecord(over?: Record<string, unknown>) {
  return {
    id: 'redemption-1',
    memberId: 'mem-1',
    rewardId: 'reward-1',
    rewardName: 'Free PT session',
    rewardType: 'pt_session',
    pointsSpent: 500,
    status: 'fulfilled',
    redeemedAt: new Date('2026-07-02T00:00:00.000Z'),
    member: { user: { name: 'Dana', email: 'dana@example.com' } },
    ...over,
  };
}

function make(overrides?: Record<string, unknown>) {
  return {
    findMany: vi.fn<(a: AnyArgs) => Promise<unknown[]>>(() => Promise.resolve([])),
    findFirst: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve(null)),
    findUnique: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve(null)),
    count: vi.fn<(a: AnyArgs) => Promise<number>>(() => Promise.resolve(0)),
    create: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.data)),
    update: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.data)),
    updateMany: vi.fn<(a: AnyArgs) => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 1 }),
    ),
    upsert: vi.fn<(a: AnyArgs) => Promise<unknown>>((a) => Promise.resolve(a.create)),
    delete: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve({})),
    aggregate: vi.fn<(a: AnyArgs) => Promise<unknown>>(() => Promise.resolve({ _sum: {} })),
    groupBy: vi.fn<(a: AnyArgs) => Promise<unknown[]>>(() => Promise.resolve([])),
    ...overrides,
  };
}

function setup(models?: Record<string, Record<string, unknown>>) {
  const client = {
    loyaltyProgram: make(models?.loyaltyProgram),
    loyaltyReward: make(models?.loyaltyReward),
    loyaltyRedemption: make(models?.loyaltyRedemption),
    loyaltyLedgerEntry: make(models?.loyaltyLedgerEntry),
    gymMember: make(models?.gymMember),
  } as unknown as Record<string, ReturnType<typeof make>> & {
    $transaction: (cb: (tx: unknown) => unknown) => unknown;
  };
  // The interactive transaction runs against the same mock client.
  client.$transaction = (cb: (tx: unknown) => unknown) => cb(client);

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { gymId: 'gym-1', userId: 'u-1' } as unknown as TenantContext;
  return { service: new LoyaltyService(prisma, tenant), client };
}

/** A member exists for the requireMember guard. */
function withMember(models: Record<string, Record<string, unknown>> = {}) {
  return {
    gymMember: { findFirst: vi.fn(() => Promise.resolve({ id: 'mem-1' })) },
    ...models,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('LoyaltyService catalog', () => {
  it('serves the reward-type and reason catalogs', () => {
    const { service } = setup();
    const catalog = service.catalog();
    expect(catalog.rewardTypes.map((r) => r.value)).toContain('pt_session');
    expect(catalog.reasons.map((r) => r.value)).toContain('check_in');
  });
});

describe('LoyaltyService.getProgram', () => {
  it('returns disabled zero-rule defaults when never configured', async () => {
    const { service } = setup();
    expect(await service.getProgram()).toEqual({
      enabled: false,
      pointsPerCheckIn: 0,
      pointsPerCurrencyUnit: 0,
      signupBonus: 0,
      updatedAt: null,
    });
  });

  it('maps a stored program to the wire response', async () => {
    const { service } = setup({
      loyaltyProgram: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            enabled: true,
            pointsPerCheckIn: 10,
            pointsPerCurrencyUnit: 1,
            signupBonus: 100,
            updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          }),
        ),
      },
    });
    const program = await service.getProgram();
    expect(program.enabled).toBe(true);
    expect(program.pointsPerCheckIn).toBe(10);
    expect(program.updatedAt).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('LoyaltyService.updateProgram', () => {
  it('upserts, stamping the gym and defaulting unset create fields', async () => {
    const upsert = vi.fn((a: AnyArgs) => {
      const create = a.create as Record<string, unknown>;
      return Promise.resolve({
        enabled: create.enabled,
        pointsPerCheckIn: create.pointsPerCheckIn,
        pointsPerCurrencyUnit: create.pointsPerCurrencyUnit,
        signupBonus: create.signupBonus,
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      });
    });
    const { service } = setup({ loyaltyProgram: { upsert } });
    const res = await service.updateProgram({ enabled: true, pointsPerCheckIn: 5 });
    const args = upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ gymId: 'gym-1' });
    expect(args.create).toMatchObject({ gymId: 'gym-1', enabled: true, pointsPerCheckIn: 5 });
    expect(args.update).toEqual({ enabled: true, pointsPerCheckIn: 5 });
    expect(res.enabled).toBe(true);
  });
});

describe('LoyaltyService rewards', () => {
  it('narrows the catalogue to a branch WITHOUT hiding the gym-wide rewards', async () => {
    const findMany = vi.fn((_a: AnyArgs) => Promise.resolve([]));
    const { service } = setup({ loyaltyReward: { findMany } });

    await service.listRewards({ locationId: 'loc-1' });

    // A reward with no branch is honoured at EVERY desk, so it survives the
    // filter. Plain equality would leave only this branch's exclusives.
    expect(findMany.mock.calls[0]![0].where).toEqual({
      AND: { OR: [{ locationId: null }, { locationId: 'loc-1' }] },
    });
  });

  it('applies no branch predicate in all-locations mode', async () => {
    const findMany = vi.fn((_a: AnyArgs) => Promise.resolve([]));
    const { service } = setup({ loyaltyReward: { findMany } });

    await service.listRewards();

    expect(findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('creates a reward, stamping the gym and defaulting stock to null', async () => {
    const create = vi.fn((a: AnyArgs) => Promise.resolve(rewardRecord(a.data)));
    const { service } = setup({ loyaltyReward: { create } });
    await service.createReward({
      name: 'Day pass',
      description: '',
      pointsCost: 200,
      type: 'day_pass',
      active: true,
      // NULL is the Stage 7 default: honoured at every branch.
      locationId: null,
    });
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.gymId).toBe('gym-1');
    expect(data.stock).toBeNull();
  });

  it('rejects updating a reward that does not exist with 404', async () => {
    const { service } = setup();
    await expect(service.updateReward('missing', { active: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes an existing reward', async () => {
    const del = vi.fn(() => Promise.resolve({}));
    const { service } = setup({
      loyaltyReward: { findFirst: vi.fn(() => Promise.resolve(rewardRecord())), delete: del },
    });
    await service.deleteReward('reward-1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'reward-1' } });
  });
});

describe('LoyaltyService member balance & adjust', () => {
  it('reads a member balance from the ledger sum', async () => {
    const { service } = setup(
      withMember({
        loyaltyLedgerEntry: { aggregate: vi.fn(() => Promise.resolve({ _sum: { delta: 340 } })) },
      }),
    );
    expect(await service.getMemberBalance('mem-1')).toEqual({ memberId: 'mem-1', balance: 340 });
  });

  it('404s a balance read for a member outside the gym', async () => {
    const { service } = setup();
    await expect(service.getMemberBalance('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applies a positive manual adjustment and returns the new balance', async () => {
    const create = vi.fn((a: AnyArgs) => Promise.resolve(a.data));
    const { service } = setup(
      withMember({
        loyaltyLedgerEntry: {
          aggregate: vi.fn(() => Promise.resolve({ _sum: { delta: 100 } })),
          create,
        },
      }),
    );
    const res = await service.adjustPoints('mem-1', { delta: 50, note: 'Goodwill' });
    expect(res.balance).toBe(150);
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      delta: 50,
      reason: 'manual',
      balanceAfter: 150,
      note: 'Goodwill',
    });
  });

  it('rejects a debit that would overdraw the balance with 409', async () => {
    const { service } = setup(
      withMember({
        loyaltyLedgerEntry: { aggregate: vi.fn(() => Promise.resolve({ _sum: { delta: 30 } })) },
      }),
    );
    await expect(service.adjustPoints('mem-1', { delta: -100 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('LoyaltyService.redeem', () => {
  function redeemSetup(over?: {
    reward?: Record<string, unknown>;
    balance?: number;
    updateManyCount?: number;
  }) {
    const ledgerCreate = vi.fn((a: AnyArgs) => Promise.resolve(a.data));
    const redemptionCreate = vi.fn((_a: AnyArgs) => Promise.resolve(redemptionRecord()));
    const rewardUpdateMany = vi.fn(() => Promise.resolve({ count: over?.updateManyCount ?? 1 }));
    const { service, client } = setup(
      withMember({
        loyaltyReward: {
          findFirst: vi.fn(() => Promise.resolve(rewardRecord(over?.reward))),
          updateMany: rewardUpdateMany,
        },
        loyaltyRedemption: { create: redemptionCreate },
        loyaltyLedgerEntry: {
          aggregate: vi.fn(() => Promise.resolve({ _sum: { delta: over?.balance ?? 800 } })),
          create: ledgerCreate,
        },
      }),
    );
    return { service, client, ledgerCreate, redemptionCreate, rewardUpdateMany };
  }

  it('redeems a reward: writes the redemption and a negative ledger entry', async () => {
    const { service, ledgerCreate, redemptionCreate } = redeemSetup({ balance: 800 });
    const res = await service.redeem({ memberId: 'mem-1', rewardId: 'reward-1' });

    expect(res.redemption.pointsSpent).toBe(500);
    expect(res.redemption.memberName).toBe('Dana');
    const redemptionData = redemptionCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(redemptionData).toMatchObject({
      rewardName: 'Free PT session',
      rewardType: 'pt_session',
      pointsSpent: 500,
      status: 'fulfilled',
    });
    const ledgerData = ledgerCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(ledgerData).toMatchObject({ delta: -500, reason: 'redemption', balanceAfter: 300 });
  });

  it('rejects a redeem when the member lacks the points with 409', async () => {
    const { service } = redeemSetup({ balance: 100 });
    await expect(
      service.redeem({ memberId: 'mem-1', rewardId: 'reward-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects redeeming an inactive reward with 409', async () => {
    const { service } = redeemSetup({ reward: { active: false } });
    await expect(
      service.redeem({ memberId: 'mem-1', rewardId: 'reward-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a redeem that races stock to zero with 409', async () => {
    const { service } = redeemSetup({ reward: { stock: 1 }, balance: 800, updateManyCount: 0 });
    await expect(
      service.redeem({ memberId: 'mem-1', rewardId: 'reward-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LoyaltyService.listRedemptions', () => {
  it('paginates and maps redemptions, filtering by status', async () => {
    const findMany = vi.fn((_a: AnyArgs) => Promise.resolve([redemptionRecord()]));
    const count = vi.fn(() => Promise.resolve(1));
    const { service } = setup({ loyaltyRedemption: { findMany, count } });
    const res = await service.listRedemptions({ page: 1, limit: 20, status: 'fulfilled' });
    expect(res).toMatchObject({ total: 1, page: 1, limit: 20 });
    expect(res.data[0]!.rewardName).toBe('Free PT session');
    const where = findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.status).toBe('fulfilled');
  });
});

describe('LoyaltyService.cancelRedemption', () => {
  it('404s an unknown redemption', async () => {
    const { service } = setup();
    await expect(service.cancelRedemption('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s an already-cancelled redemption', async () => {
    const { service } = setup({
      loyaltyRedemption: {
        findFirst: vi.fn(() => Promise.resolve(redemptionRecord({ status: 'cancelled' }))),
      },
    });
    await expect(service.cancelRedemption('redemption-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refunds the points and marks the redemption cancelled', async () => {
    const ledgerCreate = vi.fn((a: AnyArgs) => Promise.resolve(a.data));
    const update = vi.fn(() => Promise.resolve(redemptionRecord({ status: 'cancelled' })));
    const rewardUpdateMany = vi.fn(() => Promise.resolve({ count: 1 }));
    const { service } = setup({
      loyaltyRedemption: {
        findFirst: vi.fn(() => Promise.resolve(redemptionRecord({ rewardId: 'reward-1' }))),
        update,
      },
      loyaltyReward: { updateMany: rewardUpdateMany },
      loyaltyLedgerEntry: {
        aggregate: vi.fn(() => Promise.resolve({ _sum: { delta: 300 } })),
        create: ledgerCreate,
      },
    });
    const res = await service.cancelRedemption('redemption-1');
    expect(res.redemption.status).toBe('cancelled');
    const ledgerData = ledgerCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(ledgerData).toMatchObject({ delta: 500, reason: 'redemption', balanceAfter: 800 });
    expect(rewardUpdateMany).toHaveBeenCalled();
  });
});

describe('LoyaltyService reports', () => {
  it('summarises issued, redeemed, outstanding, and counts', async () => {
    const { service } = setup({
      loyaltyLedgerEntry: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { delta: 1000 } }) // issued (delta>0, not redemption)
          .mockResolvedValueOnce({ _sum: { delta: 600 } }), // outstanding (all)
      },
      loyaltyRedemption: {
        aggregate: vi.fn(() => Promise.resolve({ _sum: { pointsSpent: 400 } })),
        count: vi.fn(() => Promise.resolve(3)),
      },
      loyaltyReward: { count: vi.fn(() => Promise.resolve(5)) },
    });
    const res = await service.summary();
    expect(res).toEqual({
      totalIssued: 1000,
      totalRedeemed: 400,
      netOutstanding: 600,
      redemptionsCount: 3,
      activeRewards: 5,
    });
  });

  it('buckets issued vs redeemed by month over the window', async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15);
    const { service } = setup({
      loyaltyLedgerEntry: {
        findMany: vi.fn(() =>
          Promise.resolve([
            { delta: 100, reason: 'check_in', createdAt: thisMonth },
            { delta: -40, reason: 'redemption', createdAt: thisMonth },
          ]),
        ),
      },
    });
    const res = await service.pointsTimeseries(3);
    expect(res.data).toHaveLength(3);
    const last = res.data[2]!;
    expect(last.issued).toBe(100);
    expect(last.redeemed).toBe(40);
  });

  it('aggregates redemptions by reward type, labelled and sorted', async () => {
    const { service } = setup({
      loyaltyRedemption: {
        groupBy: vi.fn(() =>
          Promise.resolve([
            { rewardType: 'day_pass', _sum: { pointsSpent: 200 }, _count: { _all: 1 } },
            { rewardType: 'pt_session', _sum: { pointsSpent: 1000 }, _count: { _all: 2 } },
          ]),
        ),
      },
    });
    const res = await service.redemptionsByType();
    expect(res.data[0]).toEqual({
      type: 'pt_session',
      label: 'Free PT session',
      points: 1000,
      count: 2,
    });
  });

  it('ranks top earners and joins member identity', async () => {
    const { service } = setup({
      loyaltyLedgerEntry: {
        groupBy: vi.fn(() =>
          Promise.resolve([
            { memberId: 'mem-1', _sum: { delta: 900 } },
            { memberId: 'mem-2', _sum: { delta: 0 } },
          ]),
        ),
      },
      gymMember: {
        findMany: vi.fn(() =>
          Promise.resolve([{ id: 'mem-1', user: { name: 'Dana', email: 'dana@example.com' } }]),
        ),
      },
    });
    const res = await service.topEarners(10);
    expect(res.data).toEqual([
      { memberId: 'mem-1', name: 'Dana', email: 'dana@example.com', points: 900 },
    ]);
  });
});
