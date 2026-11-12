import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoyaltyPointsService } from './loyalty-points.service';
import type { PrismaService } from '../prisma/prisma.service';

interface AnyArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

function setup(over?: {
  program?: Record<string, unknown> | null;
  duplicate?: boolean;
  balance?: number;
}) {
  const loyaltyProgram = {
    findUnique: vi.fn(() => Promise.resolve(over?.program === undefined ? null : over.program)),
  };
  const create = vi.fn((a: AnyArgs) => Promise.resolve(a.data));
  const loyaltyLedgerEntry = {
    findFirst: vi.fn(() => Promise.resolve(over?.duplicate ? { id: 'dup' } : null)),
    aggregate: vi.fn(() => Promise.resolve({ _sum: { delta: over?.balance ?? 0 } })),
    create,
  };
  const client = { loyaltyProgram, loyaltyLedgerEntry };
  const prisma = { client } as unknown as PrismaService;
  return { service: new LoyaltyPointsService(prisma), loyaltyProgram, loyaltyLedgerEntry, create };
}

const ENABLED = {
  enabled: true,
  pointsPerCheckIn: 10,
  pointsPerCurrencyUnit: 1,
  signupBonus: 100,
};

afterEach(() => vi.restoreAllMocks());

describe('LoyaltyPointsService.awardForCheckIn', () => {
  it('awards the per-check-in points and snapshots the running balance', async () => {
    const { service, create } = setup({ program: ENABLED, balance: 40 });
    await service.awardForCheckIn('gym-1', 'mem-1', 'checkin-1');
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      gymId: 'gym-1',
      memberId: 'mem-1',
      delta: 10,
      reason: 'check_in',
      refId: 'checkin-1',
      balanceAfter: 50,
    });
  });

  it('no-ops when there is no program', async () => {
    const { service, create } = setup({ program: null });
    await service.awardForCheckIn('gym-1', 'mem-1', 'checkin-1');
    expect(create).not.toHaveBeenCalled();
  });

  it('no-ops when the program is disabled', async () => {
    const { service, create } = setup({ program: { ...ENABLED, enabled: false } });
    await service.awardForCheckIn('gym-1', 'mem-1', 'checkin-1');
    expect(create).not.toHaveBeenCalled();
  });

  it('is idempotent — a repeated award for the same source event is a no-op', async () => {
    const { service, create } = setup({ program: ENABLED, duplicate: true });
    await service.awardForCheckIn('gym-1', 'mem-1', 'checkin-1');
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws even if the ledger write fails', async () => {
    const { service } = setup({ program: ENABLED });
    service['prisma'].client.loyaltyLedgerEntry.create = vi.fn(() =>
      Promise.reject(new Error('db down')),
    ) as never;
    await expect(service.awardForCheckIn('gym-1', 'mem-1', 'checkin-1')).resolves.toBeUndefined();
  });
});

describe('LoyaltyPointsService.awardForPurchase', () => {
  it('awards floor(minor * rate / 100) points for a paid sale', async () => {
    const { service, create } = setup({
      program: { ...ENABLED, pointsPerCurrencyUnit: 2 },
      balance: 0,
    });
    // $37.50 at 2 pts per dollar → floor(3750 * 2 / 100) = 75.
    await service.awardForPurchase('gym-1', 'mem-1', 'order-1', 3750);
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({ delta: 75, reason: 'purchase', refId: 'order-1' });
  });

  it('no-ops on a zero total', async () => {
    const { service, create } = setup({ program: { ...ENABLED, pointsPerCurrencyUnit: 2 } });
    await service.awardForPurchase('gym-1', 'mem-1', 'order-1', 0);
    expect(create).not.toHaveBeenCalled();
  });

  it('no-ops when the earn rate rounds the award down to zero', async () => {
    const { service, create } = setup({ program: { ...ENABLED, pointsPerCurrencyUnit: 1 } });
    // $0.50 at 1 pt per dollar → floor(50 / 100) = 0.
    await service.awardForPurchase('gym-1', 'mem-1', 'order-1', 50);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('LoyaltyPointsService.awardSignupBonus', () => {
  it('awards the signup bonus with no refId', async () => {
    const { service, create } = setup({ program: ENABLED, balance: 0 });
    await service.awardSignupBonus('gym-1', 'mem-1');
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({ delta: 100, reason: 'signup', refId: null, balanceAfter: 100 });
  });

  it('no-ops when the signup bonus is zero', async () => {
    const { service, create } = setup({ program: { ...ENABLED, signupBonus: 0 } });
    await service.awardSignupBonus('gym-1', 'mem-1');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('LoyaltyPointsService.awardAutomationBonus', () => {
  /** A ledger that remembers its writes, so idempotency is tested for real. */
  function ledgerSetup(over?: { program?: Record<string, unknown> | null; memberGym?: string }) {
    const entries: Record<string, unknown>[] = [];
    const memberFindFirst = vi.fn((a: AnyArgs) =>
      Promise.resolve(
        a.where?.id === 'gm-1' && a.where.gymId === (over?.memberGym ?? 'gym-1')
          ? { id: 'gm-1' }
          : null,
      ),
    );
    const client = {
      loyaltyProgram: {
        findUnique: vi.fn(() =>
          Promise.resolve(over?.program === undefined ? ENABLED : over.program),
        ),
      },
      gymMember: { findFirst: memberFindFirst },
      loyaltyLedgerEntry: {
        findFirst: vi.fn((a: AnyArgs) =>
          Promise.resolve(
            entries.find((entry) =>
              Object.entries(a.where ?? {}).every(([key, value]) => entry[key] === value),
            ) ?? null,
          ),
        ),
        aggregate: vi.fn(() =>
          Promise.resolve({
            _sum: { delta: entries.reduce((sum, entry) => sum + (entry.delta as number), 0) },
          }),
        ),
        create: vi.fn((a: AnyArgs) => {
          entries.push(a.data ?? {});
          return Promise.resolve(a.data);
        }),
      },
    };
    const prisma = { client } as unknown as PrismaService;
    return { service: new LoyaltyPointsService(prisma), entries, memberFindFirst };
  }

  it('credits a manual entry noted with the rule, once per refId', async () => {
    const { service, entries } = ledgerSetup();

    const first = await service.awardAutomationBonus(
      'gym-1',
      'gm-1',
      50,
      'automation:r-1:b-1',
      'Welcome',
    );
    const second = await service.awardAutomationBonus(
      'gym-1',
      'gm-1',
      50,
      'automation:r-1:b-1',
      'Welcome',
    );

    expect([first, second]).toEqual([true, false]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      gymId: 'gym-1',
      memberId: 'gm-1',
      delta: 50,
      reason: 'manual',
      refId: 'automation:r-1:b-1',
      note: 'Welcome',
      balanceAfter: 50,
    });
  });

  it('credits a different entity separately', async () => {
    const { service, entries } = ledgerSetup();
    await service.awardAutomationBonus('gym-1', 'gm-1', 50, 'automation:r-1:b-1', 'R');
    await service.awardAutomationBonus('gym-1', 'gm-1', 50, 'automation:r-1:b-2', 'R');
    expect(entries.map((entry) => entry.balanceAfter)).toEqual([50, 100]);
  });

  it('credits nothing when the programme is off', async () => {
    const { service, entries } = ledgerSetup({ program: { ...ENABLED, enabled: false } });
    expect(await service.awardAutomationBonus('gym-1', 'gm-1', 50, 'automation:x', 'R')).toBe(
      false,
    );
    expect(entries).toHaveLength(0);
  });

  it('credits nothing for a member of another gym', async () => {
    const { service, entries, memberFindFirst } = ledgerSetup({ memberGym: 'gym-2' });
    expect(await service.awardAutomationBonus('gym-1', 'gm-1', 50, 'automation:x', 'R')).toBe(
      false,
    );
    expect(memberFindFirst.mock.calls[0]?.[0]?.where).toMatchObject({ gymId: 'gym-1' });
    expect(entries).toHaveLength(0);
  });

  it('returns false instead of throwing when the write fails', async () => {
    const { service } = ledgerSetup();
    service['prisma'].client.loyaltyLedgerEntry.create = vi.fn(() =>
      Promise.reject(new Error('db down')),
    ) as never;
    await expect(
      service.awardAutomationBonus('gym-1', 'gm-1', 50, 'automation:x', 'R'),
    ).resolves.toBe(false);
  });
});
