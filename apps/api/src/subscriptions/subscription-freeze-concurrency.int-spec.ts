import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GymStatus,
  Role,
  SubscriptionInterval,
  SubscriptionPlanStatus,
  SubscriptionStatus,
} from '@fit/db';
import type { FreezeSubscriptionData } from '@fit/types';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';

/**
 * The freeze allowance proven against a real Postgres.
 *
 * A freeze spends days out of `Subscription.freezeDaysUsed`, bounded by the plan's
 * `freezeDaysPerPeriod`. The service used to read the counter, compare it to the cap
 * in JavaScript, and write `used + durationDays` back — three statements with a gap.
 * Under READ COMMITTED two simultaneous requests both read the same figure, both
 * find room, and both write: the second `UPDATE` overwrites the first, and every
 * caller is told the freeze was granted. The days the gym believes were spent then
 * bear no relation to the freezes it actually handed out — one of them was granted
 * for free, and the member can spend that allowance a second time.
 *
 * That is a claim about concurrency, and a unit spec cannot make it: calling
 * `freeze` twice in sequence lets the second read observe the first write, so it
 * passes against the broken code too. The unit spec asserts the *shape* of the claim
 * (`subscription-freeze.service.spec.ts`); this fires simultaneous freezes at one
 * subscription through the real transactions and asserts the *property*.
 *
 * The invariant, stated once: **every accepted freeze paid for its own days.** So
 * `freezeDaysUsed` must equal the days of the requests that were accepted, and it
 * must never exceed the plan's cap.
 */
const tenant = new TenantContext();
const service = new SubscriptionFreezeService({ client: tenantPrisma }, tenant);

/** The plan allowance every case in this suite spends against, in days. */
const CAP = 14;

function member(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.MEMBER, allowCrossTenant: false };
}

const freezeInput = (durationDays: number): FreezeSubscriptionData => ({
  startDate: '2026-06-10T00:00:00.000Z',
  durationDays,
});

describe('Subscription freeze allowance (integration)', () => {
  let gymId: string;
  let userId: string;
  let subscriptionId: string;
  let caller: TenantState;

  beforeEach(async () => {
    await resetDb();

    const gym = await prisma.gym.create({
      data: { name: 'Freeze Gym', slug: 'freeze-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;

    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;
    const membership = await prisma.gymMember.create({
      data: { userId, gymId, role: Role.MEMBER },
    });

    const plan = await prisma.subscriptionPlan.create({
      data: {
        gymId,
        name: 'Premium',
        priceAmount: 12000,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        status: SubscriptionPlanStatus.ACTIVE,
        freezeDaysPerPeriod: CAP,
      },
    });

    const subscription = await prisma.subscription.create({
      data: {
        gymId,
        planId: plan.id,
        memberId: membership.id,
        status: SubscriptionStatus.ACTIVE,
        priceAmount: 12000,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
    subscriptionId = subscription.id;

    caller = member(gymId, userId);
  });

  afterAll(disconnect);

  /** Request a freeze as the member would, through the tenant-scoped service. */
  function requestFreeze(durationDays: number): Promise<unknown> {
    return asTenant(caller, () => service.freeze(subscriptionId, freezeInput(durationDays)));
  }

  /** The subscription's committed state, read back raw. */
  async function committed(): Promise<{ used: number; status: SubscriptionStatus }> {
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
    return { used: row.freezeDaysUsed, status: row.status };
  }

  /**
   * Open (and discard) one scoped transaction before the racing ones. A cold pool
   * hands out connections as the first request asks for them, which staggers the
   * racers enough that the later ones read state the earlier ones have already
   * committed — they then collide on the pre-checks instead of on the write, which is
   * not the race under test. Warming the pool first puts them genuinely in flight
   * together.
   */
  async function warmUp(): Promise<void> {
    await Promise.all(
      Array.from({ length: 4 }, () =>
        asTenant(caller, () =>
          tenantPrisma.subscription.findFirst({ where: { id: subscriptionId } }),
        ),
      ),
    );
  }

  /** The `code` each rejected request came back with. */
  function codesOf(results: PromiseSettledResult<unknown>[]): string[] {
    return results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => {
        const body = (r.reason as { getResponse?: () => unknown }).getResponse?.();
        return (body as { code?: string } | undefined)?.code ?? String(r.reason);
      });
  }

  it('commits the requested days for a single uncontended freeze', async () => {
    await requestFreeze(10);

    expect(await committed()).toEqual({ used: 10, status: SubscriptionStatus.FROZEN });
  });

  it('admits exactly one of several simultaneous freezes, and charges only that one', async () => {
    // Four requests for ten days each against an allowance of fourteen. All four read
    // `freezeDaysUsed: 0` and all four find room, so the cap check alone lets every
    // one of them through — only the claim can tell them apart.
    await warmUp();
    const results = await Promise.allSettled([
      requestFreeze(10),
      requestFreeze(10),
      requestFreeze(10),
      requestFreeze(10),
    ]);
    const accepted = results.filter((r) => r.status === 'fulfilled').length;

    const { used, status } = await committed();

    // The invariant: the allowance spent is exactly what the accepted requests asked
    // for. Against the read-then-write version this is `4 × 10` claimed but `10`
    // recorded — three freezes granted out of thin air.
    expect(used).toBe(accepted * 10);
    // And the plan's bound is never breached.
    expect(used).toBeLessThanOrEqual(CAP);
    // Only one freeze can be in force, so only one may be admitted.
    expect(accepted).toBe(1);
    expect(status).toBe(SubscriptionStatus.FROZEN);
    // The losers are refused in the vocabulary the uncontended path already uses —
    // no new failure mode reaches a client because a race was lost.
    expect(codesOf(results)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(ALREADY_FROZEN|EXCEEDS_FREEZE_ALLOWANCE)$/),
      ]),
    );
    expect(codesOf(results)).toHaveLength(3);
  });

  it('never spends past the cap when the race happens on the last of the allowance', async () => {
    // Ten of the fourteen days are already gone and the hold has been resumed, so the
    // subscription is freezable again with exactly four days left.
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { freezeDaysUsed: 10 },
    });

    await warmUp();
    const results = await Promise.allSettled([
      requestFreeze(4),
      requestFreeze(4),
      requestFreeze(4),
    ]);
    const accepted = results.filter((r) => r.status === 'fulfilled').length;

    const { used } = await committed();
    expect(accepted).toBe(1);
    expect(used).toBe(10 + accepted * 4);
    expect(used).toBeLessThanOrEqual(CAP);
  });

  it('still refuses an uncontended freeze that would overrun the allowance', async () => {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { freezeDaysUsed: 12 },
    });

    const results = await Promise.allSettled([requestFreeze(5)]);
    expect(codesOf(results)).toEqual(['EXCEEDS_FREEZE_ALLOWANCE']);
    expect((await committed()).used).toBe(12);
  });
});
