import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
  type HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SubscriptionStatus } from '@fit/db';
import type { FreezeSubscriptionData } from '@fit/types';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';

/** A subscription row as the freeze/unfreeze projections select it. */
interface SubscriptionRecord {
  id: string;
  status: SubscriptionStatus;
  freezeDaysUsed: number;
  frozenAt: Date | null;
  frozenUntil: Date | null;
  currentPeriodEnd: Date;
  plan: { freezeDaysPerPeriod: number } | null;
}

const subscription = (over?: Partial<SubscriptionRecord>): SubscriptionRecord => ({
  id: 'sub-1',
  status: SubscriptionStatus.ACTIVE,
  freezeDaysUsed: 0,
  frozenAt: null,
  frozenUntil: null,
  currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
  plan: { freezeDaysPerPeriod: 14 },
  ...over,
});

function setup(overrides?: {
  member?: { id: string } | null;
  subscription?: SubscriptionRecord | null;
  gymSettings?: unknown;
  /** Rows the freeze claim matched. `0` is the lost race. */
  claimCount?: number;
  /** What the row looks like on the re-read after a claim that did not land. */
  afterRace?: SubscriptionRecord | null;
}) {
  const memberFindFirst = vi.fn(() =>
    Promise.resolve(overrides?.member === undefined ? { id: 'member-1' } : overrides.member),
  );
  const initial = overrides?.subscription === undefined ? subscription() : overrides.subscription;
  let reads = 0;
  // The first read is the one the flow judges; a second read only happens when the
  // claim lost the race, and then it must be able to show the state that beat it.
  const subscriptionFindFirst = vi.fn(() =>
    Promise.resolve(
      reads++ === 0 || overrides?.afterRace === undefined ? initial : overrides.afterRace,
    ),
  );
  const subscriptionUpdate = vi.fn((args: { data: Record<string, unknown> }) =>
    Promise.resolve(args),
  );
  const subscriptionUpdateMany = vi.fn((_args: { where: unknown; data: unknown }) =>
    Promise.resolve({ count: overrides?.claimCount ?? 1 }),
  );
  const gymFindFirst = vi.fn(() => Promise.resolve({ settings: overrides?.gymSettings ?? null }));

  const client: Record<string, unknown> = {
    gymMember: { findFirst: memberFindFirst },
    subscription: {
      findFirst: subscriptionFindFirst,
      update: subscriptionUpdate,
      updateMany: subscriptionUpdateMany,
    },
    gym: { findFirst: gymFindFirst },
    // Interactive transaction: run the callback against the same scoped client.
    $transaction: (cb: (tx: unknown) => unknown) => cb(client),
  };

  const prisma = { client } as unknown as TenantPrismaService;
  const tenant = { userId: 'user-1', gymId: 'gym-1' } as unknown as TenantContext;

  return {
    service: new SubscriptionFreezeService(prisma, tenant),
    memberFindFirst,
    subscriptionFindFirst,
    subscriptionUpdate,
    subscriptionUpdateMany,
    gymFindFirst,
  };
}

const freezeInput = (over?: Partial<FreezeSubscriptionData>): FreezeSubscriptionData => ({
  startDate: '2026-06-10T00:00:00.000Z',
  durationDays: 10,
  ...over,
});

/** Run `promise`, returning the rejection so a test can assert on its type + code. */
async function rejection(promise: Promise<unknown>): Promise<HttpException> {
  return promise.then(
    () => {
      throw new Error('Expected the call to reject, but it resolved');
    },
    (error: HttpException) => error,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SubscriptionFreezeService.freeze', () => {
  it('freezes an active subscription, stamping the dates and committing the days', async () => {
    const { service, subscriptionUpdateMany } = setup();

    const result = await service.freeze('sub-1', freezeInput({ durationDays: 10 }));

    expect(result).toEqual({ frozenUntil: '2026-06-20T00:00:00.000Z' });
    expect(subscriptionUpdateMany.mock.calls[0]?.[0]?.data).toMatchObject({
      status: SubscriptionStatus.FROZEN,
      frozenAt: new Date('2026-06-10T00:00:00.000Z'),
      frozenUntil: new Date('2026-06-20T00:00:00.000Z'),
      freezeDaysUsed: { increment: 10 },
    });
  });

  /**
   * The shape is the guarantee: the cap has to be a predicate the database
   * evaluates against the live row, because the `freezeDaysUsed` this request read
   * may already be stale by the time it writes. Asserting it here catches a
   * regression to `used + durationDays` without needing a database; that the bound
   * actually holds under real concurrency is proved in
   * `subscription-freeze-concurrency.int-spec.ts`.
   */
  it('claims the allowance with the cap inside the statement, not a computed total', async () => {
    // cap 14, 4 already used, asking for 10 → the claim may only land while no more
    // than 4 days are on the row (14 - 10).
    const { service, subscriptionUpdateMany } = setup({
      subscription: subscription({ freezeDaysUsed: 4, plan: { freezeDaysPerPeriod: 14 } }),
    });

    await service.freeze('sub-1', freezeInput({ durationDays: 10 }));

    expect(subscriptionUpdateMany.mock.calls[0]?.[0]?.where).toMatchObject({
      id: 'sub-1',
      // Pinned to the status the state machine judged, so a subscription frozen by
      // a concurrent request cannot be frozen a second time.
      status: SubscriptionStatus.ACTIVE,
      freezeDaysUsed: { lte: 4 },
    });
  });

  it('rejects a freeze that exceeds the plan allowance with the remaining days', async () => {
    // cap 14, 10 already used → only 4 left, asking for 5 → 422 remainingDays:4.
    const { service, subscriptionUpdateMany } = setup({
      subscription: subscription({ freezeDaysUsed: 10, plan: { freezeDaysPerPeriod: 14 } }),
    });

    const error = await rejection(service.freeze('sub-1', freezeInput({ durationDays: 5 })));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'EXCEEDS_FREEZE_ALLOWANCE',
      remainingDays: 4,
    });
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses the freeze when the claim loses the race, with the allowance now left', async () => {
    // Both requests read `freezeDaysUsed: 0` against a cap of 14 and both passed the
    // check; the other one committed 10 days first, so this claim matches nothing.
    const { service, subscriptionUpdate } = setup({
      subscription: subscription({ freezeDaysUsed: 0, plan: { freezeDaysPerPeriod: 14 } }),
      claimCount: 0,
      afterRace: subscription({ status: SubscriptionStatus.ACTIVE, freezeDaysUsed: 10 }),
    });

    const error = await rejection(service.freeze('sub-1', freezeInput({ durationDays: 10 })));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'EXCEEDS_FREEZE_ALLOWANCE',
      // The honest figure after the winner's 10 days, not the 14 this request read.
      remainingDays: 4,
    });
    // Nothing was written: the loser is refused, never silently ignored.
    expect(subscriptionUpdate).not.toHaveBeenCalled();
  });

  it('reports ALREADY_FROZEN when the race was lost to a concurrent freeze', async () => {
    const { service } = setup({
      claimCount: 0,
      afterRace: subscription({ status: SubscriptionStatus.FROZEN, freezeDaysUsed: 10 }),
    });

    const error = await rejection(service.freeze('sub-1', freezeInput({ durationDays: 3 })));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'ALREADY_FROZEN' });
  });

  it('404s when the subscription is gone by the time the claim runs', async () => {
    const { service } = setup({ claimCount: 0, afterRace: null });

    await expect(service.freeze('sub-1', freezeInput())).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a freeze shorter than the gym's minimum (422 BELOW_MIN_FREEZE_DAYS)", async () => {
    const { service, subscriptionUpdateMany } = setup({
      gymSettings: { freeze: { minFreezeDays: 7 } },
    });

    const error = await rejection(service.freeze('sub-1', freezeInput({ durationDays: 3 })));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({ code: 'BELOW_MIN_FREEZE_DAYS', minFreezeDays: 7 });
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a freeze longer than the gym's maximum (422 EXCEEDS_MAX_FREEZE_DAYS)", async () => {
    const { service, subscriptionUpdateMany } = setup({
      subscription: subscription({ plan: { freezeDaysPerPeriod: 90 } }),
      gymSettings: { freeze: { maxFreezeDays: 14 } },
    });

    const error = await rejection(service.freeze('sub-1', freezeInput({ durationDays: 30 })));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'EXCEEDS_MAX_FREEZE_DAYS',
      maxFreezeDays: 14,
    });
    expect(subscriptionUpdateMany).not.toHaveBeenCalled();
  });

  it('allows a freeze within the gym min/max window', async () => {
    const { service, subscriptionUpdateMany } = setup({
      gymSettings: { freeze: { minFreezeDays: 5, maxFreezeDays: 30 } },
    });

    await service.freeze('sub-1', freezeInput({ durationDays: 10 }));

    expect(subscriptionUpdateMany).toHaveBeenCalled();
  });

  it('rejects re-freezing an already-frozen subscription (409 ALREADY_FROZEN)', async () => {
    const { service } = setup({
      subscription: subscription({ status: SubscriptionStatus.FROZEN }),
    });

    const error = await rejection(service.freeze('sub-1', freezeInput()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'ALREADY_FROZEN' });
  });

  it('rejects freezing a non-active subscription (409 SUBSCRIPTION_NOT_FREEZABLE)', async () => {
    const { service } = setup({
      subscription: subscription({ status: SubscriptionStatus.PAST_DUE }),
    });

    const error = await rejection(service.freeze('sub-1', freezeInput()));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_NOT_FREEZABLE' });
  });

  it('404s an unknown / cross-member subscription', async () => {
    const { service } = setup({ subscription: null });

    await expect(service.freeze('missing', freezeInput())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403s a caller who is not a member of the gym', async () => {
    const { service } = setup({ member: null });

    await expect(service.freeze('sub-1', freezeInput())).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('SubscriptionFreezeService.unfreeze', () => {
  it('extends the period by the days actually spent frozen on an early unfreeze', async () => {
    // Frozen for 10 booked days but resumed after 3 → period end moves out by 3 days.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'));
    const { service, subscriptionUpdate } = setup({
      subscription: subscription({
        status: SubscriptionStatus.FROZEN,
        frozenAt: new Date('2026-06-10T00:00:00.000Z'),
        frozenUntil: new Date('2026-06-20T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
    });

    const result = await service.unfreeze('sub-1');

    expect(result).toEqual({ newPeriodEnd: '2026-07-04T00:00:00.000Z' });
    expect(subscriptionUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      frozenAt: null,
      frozenUntil: null,
      currentPeriodEnd: new Date('2026-07-04T00:00:00.000Z'),
    });
  });

  it('credits the full booked duration when resumed at/after the scheduled end', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-25T00:00:00.000Z'));
    const { service, subscriptionUpdate } = setup({
      subscription: subscription({
        status: SubscriptionStatus.FROZEN,
        frozenAt: new Date('2026-06-10T00:00:00.000Z'),
        frozenUntil: new Date('2026-06-20T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
    });

    const result = await service.unfreeze('sub-1');

    expect(result).toEqual({ newPeriodEnd: '2026-07-11T00:00:00.000Z' });
    expect(subscriptionUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
      currentPeriodEnd: new Date('2026-07-11T00:00:00.000Z'),
    });
  });

  it('rejects unfreezing a subscription that is not frozen (409 NOT_FROZEN)', async () => {
    const { service } = setup({
      subscription: subscription({ status: SubscriptionStatus.ACTIVE }),
    });

    const error = await rejection(service.unfreeze('sub-1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'NOT_FROZEN' });
  });

  it('404s an unknown / cross-member subscription', async () => {
    const { service } = setup({ subscription: null });

    await expect(service.unfreeze('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SubscriptionFreezeService staff variants', () => {
  it('freezeForStaff freezes without resolving a caller membership', async () => {
    const { service, memberFindFirst, subscriptionUpdateMany } = setup();

    const result = await service.freezeForStaff('sub-1', freezeInput({ durationDays: 10 }));

    expect(result).toEqual({ frozenUntil: '2026-06-20T00:00:00.000Z' });
    // Staff act on the member — no self-membership lookup — but the subscription is
    // still tenant-scoped by the id alone (no `memberId` requirement).
    expect(memberFindFirst).not.toHaveBeenCalled();
    expect(subscriptionUpdateMany.mock.calls[0]?.[0]?.data).toMatchObject({
      status: SubscriptionStatus.FROZEN,
      freezeDaysUsed: { increment: 10 },
    });
  });

  it('freezeForStaff still enforces the plan allowance (422)', async () => {
    const { service } = setup({
      subscription: subscription({ freezeDaysUsed: 12, plan: { freezeDaysPerPeriod: 14 } }),
    });

    const error = await rejection(
      service.freezeForStaff('sub-1', freezeInput({ durationDays: 5 })),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.getResponse()).toMatchObject({
      code: 'EXCEEDS_FREEZE_ALLOWANCE',
      remainingDays: 2,
    });
  });

  it('freezeForStaff 404s an unknown / cross-tenant subscription', async () => {
    const { service } = setup({ subscription: null });

    await expect(service.freezeForStaff('missing', freezeInput())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('unfreezeForStaff resumes a frozen subscription without a membership lookup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'));
    const { service, memberFindFirst, subscriptionUpdate } = setup({
      subscription: subscription({
        status: SubscriptionStatus.FROZEN,
        frozenAt: new Date('2026-06-10T00:00:00.000Z'),
        frozenUntil: new Date('2026-06-20T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      }),
    });

    const result = await service.unfreezeForStaff('sub-1');

    expect(result).toEqual({ newPeriodEnd: '2026-07-04T00:00:00.000Z' });
    expect(memberFindFirst).not.toHaveBeenCalled();
    expect(subscriptionUpdate.mock.calls[0]?.[0]?.data).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
    });
  });

  it('unfreezeForStaff rejects a subscription that is not frozen (409 NOT_FROZEN)', async () => {
    const { service } = setup({
      subscription: subscription({ status: SubscriptionStatus.ACTIVE }),
    });

    const error = await rejection(service.unfreezeForStaff('sub-1'));

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({ code: 'NOT_FROZEN' });
  });
});
