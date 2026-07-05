import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GymStatus,
  Role,
  SubscriptionInterval,
  SubscriptionPlanStatus,
  SubscriptionStatus,
  addInterval,
} from '@fit/db';
import type { FreezeSubscriptionData } from '@fit/types';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import { SubscriptionBillingService } from './subscription-billing.service';
import type { BillingNotificationsService } from './billing-notifications.service';
import type { PaymentProvider, RenewalChargeInput, RenewalChargeResult } from './payment-provider';
import { InvoiceService } from '../billing/invoice.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';

/**
 * The subscription **lifecycle** proven end-to-end against a real Postgres (T9.1):
 * enrolment → renewal → trial conversion → freeze interaction → dunning → EXPIRED.
 * Where the per-service specs isolate one hop, this drives a subscription through
 * the whole arc — the member-facing enrolment/freeze services on the tenant-scoped
 * client and the cross-tenant billing sweep on the unscoped one — so the shared
 * state machine, billing-period arithmetic and the actual rows they leave behind are
 * exercised together, exactly as production composes them.
 *
 * The enrolment and freeze flows run through the same tenant-scoped extension a
 * request handler uses; the recurring-billing sweep runs on the raw client with an
 * injected `now`, so a due period, a retry rung or an expired grace window is a real
 * database fact this test advances the clock past rather than a mock. Only the two
 * genuinely external seams are faked: the payment gateway (a provider whose outcome
 * the test flips between success and decline) and the billing notifications (proven
 * in their own suite; here they are no-ops so a send never colours the lifecycle).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A payment provider whose next charge outcome the test controls, recording every call. */
class ControllablePaymentProvider implements PaymentProvider {
  readonly key = 'stub';
  mode: 'succeed' | 'fail' = 'succeed';
  reason = 'card_declined';
  readonly calls: RenewalChargeInput[] = [];

  chargeRenewal(input: RenewalChargeInput): Promise<RenewalChargeResult> {
    this.calls.push(input);
    return Promise.resolve(
      this.mode === 'succeed'
        ? { outcome: 'succeeded', providerRef: null }
        : { outcome: 'failed', reason: this.reason },
    );
  }
}

// The billing notifications seam (T8.7) is proven in its own suite; here it is a
// no-op so a send never affects — or masks — the lifecycle transitions under test.
const notificationsStub = {
  renewalSucceeded: () => Promise.resolve(),
  chargeFailed: () => Promise.resolve(),
  notifyTrialsEndingSoon: () => Promise.resolve({ matched: 0, notified: 0, deduped: 0, errors: 0 }),
} as unknown as BillingNotificationsService;

/** Build a billing sweep over the **unscoped** client (as the cron runs it), with `provider` bound. */
function makeBilling(provider: PaymentProvider): SubscriptionBillingService {
  return new SubscriptionBillingService(
    { client: prisma } as unknown as PrismaService,
    // The sweep touches Redis only in `runScheduled` (the daily lock); `runBillingCycle`
    // — the method under test — never does, so a placeholder suffices.
    { client: {} } as unknown as RedisService,
    new InvoiceService(),
    notificationsStub,
    provider,
  );
}

// The member-facing flows run on the tenant-scoped client, exactly as their own
// request handlers do (mirroring the enrolment/freeze integration specs).
const enrollment = new SubscriptionEnrollmentService(
  { client: tenantPrisma },
  new TenantContext(),
  new InvoiceService(),
);
const freeze = new SubscriptionFreezeService({ client: tenantPrisma }, new TenantContext());

function member(gymId: string, userId: string): TenantState {
  return { userId, gymId, role: Role.MEMBER, allowCrossTenant: false };
}

function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

describe('Subscription lifecycle (integration)', () => {
  let gymId: string;
  let userId: string;
  let memberId: string;
  let planId: string;
  let caller: TenantState;

  beforeEach(async () => {
    await resetDb();

    const gym = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;

    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;

    const membership = await prisma.gymMember.create({
      data: { userId, gymId, role: Role.MEMBER },
    });
    memberId = membership.id;

    const plan = await prisma.subscriptionPlan.create({
      data: {
        gymId,
        name: 'Premium',
        priceAmount: 12000,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        status: SubscriptionPlanStatus.ACTIVE,
        freezeDaysPerPeriod: 30,
      },
    });
    planId = plan.id;

    caller = member(gymId, userId);
  });

  afterAll(disconnect);

  /** Enrol the caller and return the freshly-created subscription row. */
  async function enrolActive() {
    const { subscription } = await asTenant(caller, () => enrollment.enrollSelf(planId));
    return prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  }

  it('renews an active subscription at period end: advances the period, resets freeze usage, mints a renewal invoice', async () => {
    const sub = await enrolActive();
    const periodEnd = sub.currentPeriodEnd;
    // Simulate a period that consumed some freeze allowance so the reset is observable.
    await prisma.subscription.update({ where: { id: sub.id }, data: { freezeDaysUsed: 7 } });

    const provider = new ControllablePaymentProvider();
    const summary = await makeBilling(provider).runBillingCycle({ now: periodEnd });

    expect(summary).toMatchObject({
      subscriptionsDue: 1,
      renewed: 1,
      pastDue: 0,
      expired: 0,
      canceled: 0,
      errors: 0,
    });
    // The renewal was charged for the snapshotted price, keyed idempotently to the
    // elapsed period end and the first (r0) rung.
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]).toMatchObject({ amount: 12000, currency: 'GEL' });
    expect(provider.calls[0]!.idempotencyKey).toBe(`${sub.id}:${periodEnd.toISOString()}:r0`);

    const renewed = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(renewed.status).toBe(SubscriptionStatus.ACTIVE);
    // The new period is contiguous with the old one and one interval long; the freeze
    // allowance and dunning ladder are reset by the paid renewal.
    expect(renewed.currentPeriodStart.getTime()).toBe(periodEnd.getTime());
    expect(renewed.currentPeriodEnd.getTime()).toBe(
      addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
    );
    expect(renewed.freezeDaysUsed).toBe(0);
    expect(renewed.paymentRetries).toBe(0);

    // Two invoices now exist: the enrolment's first-period charge and this renewal.
    const invoices = await prisma.invoice.findMany({
      where: { subscriptionId: sub.id },
      orderBy: { seq: 'asc' },
    });
    expect(invoices).toHaveLength(2);
    expect(invoices[1]).toMatchObject({ gymId, memberId, amount: 12000, currency: 'GEL' });
    expect(invoices[1]!.description.toLowerCase()).toContain('renewal');
  });

  it('converts a free trial to ACTIVE at trial end, starting the first paid period and minting its first invoice', async () => {
    const trialPlan = await prisma.subscriptionPlan.create({
      data: {
        gymId,
        name: 'Premium (14-day trial)',
        priceAmount: 12000,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        status: SubscriptionPlanStatus.ACTIVE,
        trialDays: 14,
      },
    });

    const { subscription } = await asTenant(caller, () => enrollment.enrollSelf(trialPlan.id));
    const trial = await prisma.subscription.findUniqueOrThrow({
      where: { id: subscription.id },
    });
    expect(trial.status).toBe(SubscriptionStatus.TRIAL);
    // A trial charges nothing yet, so no invoice is raised at enrolment.
    expect(await prisma.invoice.count({ where: { subscriptionId: trial.id } })).toBe(0);

    const trialEnd = trial.currentPeriodEnd;
    const provider = new ControllablePaymentProvider();
    const summary = await makeBilling(provider).runBillingCycle({ now: trialEnd });

    // The trial's first charge at trial end converts it and counts as a renewal.
    expect(summary).toMatchObject({ subscriptionsDue: 1, renewed: 1, pastDue: 0, errors: 0 });

    const converted = await prisma.subscription.findUniqueOrThrow({ where: { id: trial.id } });
    expect(converted.status).toBe(SubscriptionStatus.ACTIVE);
    // The first paid period runs one interval from the trial end, contiguous with it.
    expect(converted.currentPeriodStart.getTime()).toBe(trialEnd.getTime());
    expect(converted.currentPeriodEnd.getTime()).toBe(
      addInterval(trialEnd, SubscriptionInterval.MONTH).getTime(),
    );

    // The conversion mints the trial's first invoice — the billing history now starts.
    const invoices = await prisma.invoice.findMany({ where: { subscriptionId: trial.id } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ amount: 12000, currency: 'GEL' });
  });

  it('flags a failed first charge PAST_DUE without advancing the period or minting an invoice (dunning begins)', async () => {
    const sub = await enrolActive();
    const periodEnd = sub.currentPeriodEnd;

    const provider = new ControllablePaymentProvider();
    provider.mode = 'fail';
    const summary = await makeBilling(provider).runBillingCycle({ now: periodEnd });

    expect(summary).toMatchObject({ subscriptionsDue: 1, renewed: 0, pastDue: 1, expired: 0 });

    const pastDue = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(pastDue.status).toBe(SubscriptionStatus.PAST_DUE);
    // The period is not advanced and the ladder starts at rung 0 (the period-end failure).
    expect(pastDue.currentPeriodEnd.getTime()).toBe(periodEnd.getTime());
    expect(pastDue.paymentRetries).toBe(0);
    // A failed charge raises no invoice — only the enrolment's remains.
    expect(await prisma.invoice.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });

  it('walks the dunning retry ladder across passes and expires the subscription once every retry fails', async () => {
    const sub = await enrolActive();
    const periodEnd = sub.currentPeriodEnd;
    const provider = new ControllablePaymentProvider();
    provider.mode = 'fail';
    const billing = makeBilling(provider);

    const statusOf = async () =>
      (await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status;
    const retriesOf = async () =>
      (await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).paymentRetries;

    // Period end: the renewal charge fails → ACTIVE → PAST_DUE, ladder at rung 0.
    let summary = await billing.runBillingCycle({ now: periodEnd });
    expect(summary).toMatchObject({ pastDue: 1, renewed: 0, expired: 0 });
    expect(await statusOf()).toBe(SubscriptionStatus.PAST_DUE);
    expect(await retriesOf()).toBe(0);

    // Day +1: still waiting for the first retry window (+2) — nothing happens, no charge.
    summary = await billing.runBillingCycle({ now: plusDays(periodEnd, 1) });
    expect(summary).toMatchObject({ subscriptionsDue: 1, renewed: 0, pastDue: 0, expired: 0 });
    expect(await retriesOf()).toBe(0);
    const callsBeforeRetries = provider.calls.length;

    // Day +2: first retry fires and fails → ladder advances to rung 1.
    summary = await billing.runBillingCycle({ now: plusDays(periodEnd, 2) });
    expect(summary).toMatchObject({ pastDue: 1, renewed: 0, expired: 0 });
    expect(await retriesOf()).toBe(1);
    expect(provider.calls.length).toBe(callsBeforeRetries + 1);

    // Day +5: second retry fails → rung 2.
    summary = await billing.runBillingCycle({ now: plusDays(periodEnd, 5) });
    expect(summary).toMatchObject({ pastDue: 1, expired: 0 });
    expect(await retriesOf()).toBe(2);

    // Day +7: third and final retry fails → rung 3 (the ladder is now exhausted).
    summary = await billing.runBillingCycle({ now: plusDays(periodEnd, 7) });
    expect(summary).toMatchObject({ pastDue: 1, expired: 0 });
    expect(await retriesOf()).toBe(3);
    expect(await statusOf()).toBe(SubscriptionStatus.PAST_DUE);

    // Day +8: no rungs remain → the lapse is final (PAST_DUE → EXPIRED), no further charge.
    const chargesBeforeExpire = provider.calls.length;
    summary = await billing.runBillingCycle({ now: plusDays(periodEnd, 8) });
    expect(summary).toMatchObject({ expired: 1, renewed: 0, pastDue: 0 });
    expect(await statusOf()).toBe(SubscriptionStatus.EXPIRED);
    expect(provider.calls.length).toBe(chargesBeforeExpire);

    // The whole dunning episode raised no invoice — only the enrolment's remains.
    expect(await prisma.invoice.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });

  it('recovers a past-due subscription to ACTIVE when a retry succeeds, clearing the ladder and minting the renewal invoice', async () => {
    const sub = await enrolActive();
    const periodEnd = sub.currentPeriodEnd;
    const provider = new ControllablePaymentProvider();
    provider.mode = 'fail';
    const billing = makeBilling(provider);

    // Fail at period end → PAST_DUE.
    await billing.runBillingCycle({ now: periodEnd });
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe(
      SubscriptionStatus.PAST_DUE,
    );

    // The first retry (+2 days) now succeeds → back to ACTIVE, ladder cleared.
    provider.mode = 'succeed';
    const summary = await billing.runBillingCycle({ now: plusDays(periodEnd, 2) });
    expect(summary).toMatchObject({ renewed: 1, pastDue: 0, expired: 0 });

    const recovered = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(recovered.status).toBe(SubscriptionStatus.ACTIVE);
    expect(recovered.paymentRetries).toBe(0);
    // The recovered renewal rolls the period forward from the elapsed period end.
    expect(recovered.currentPeriodStart.getTime()).toBe(periodEnd.getTime());
    expect(recovered.currentPeriodEnd.getTime()).toBe(
      addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
    );
    // The successful retry mints the renewal invoice (enrolment + renewal = 2).
    expect(await prisma.invoice.count({ where: { subscriptionId: sub.id } })).toBe(2);
  });

  it('does not bill a frozen subscription even once its period elapses; resuming extends the period by the days spent frozen', async () => {
    const sub = await enrolActive();
    const originalPeriodEnd = sub.currentPeriodEnd;

    // Freeze the membership: started 5 days ago for a 10-day hold, so an unfreeze now
    // has spent 5 days frozen. The freeze runs through the member-facing service.
    const startedAt = plusDays(new Date(), -5);
    const input: FreezeSubscriptionData = {
      startDate: startedAt.toISOString(),
      durationDays: 10,
    };
    await asTenant(caller, () => freeze.freeze(sub.id, input));

    const frozen = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(frozen.status).toBe(SubscriptionStatus.FROZEN);
    expect(frozen.freezeDaysUsed).toBe(10);

    // Advance the clock past the period end and run the sweep: a FROZEN subscription is
    // not even in the billable set (the sweep filters to TRIAL/ACTIVE/PAST_DUE), so it
    // is never charged and its period is untouched — the paused slot simply waits.
    const provider = new ControllablePaymentProvider();
    const summary = await makeBilling(provider).runBillingCycle({
      now: plusDays(originalPeriodEnd, 1),
    });
    expect(summary).toMatchObject({ subscriptionsDue: 0, renewed: 0, pastDue: 0, expired: 0 });
    expect(provider.calls).toHaveLength(0);

    const stillFrozen = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stillFrozen.status).toBe(SubscriptionStatus.FROZEN);
    expect(stillFrozen.currentPeriodEnd.getTime()).toBe(originalPeriodEnd.getTime());
    expect(await prisma.invoice.count({ where: { subscriptionId: sub.id } })).toBe(1);

    // Resuming credits back the ~5 days actually spent frozen by pushing the period end out.
    await asTenant(caller, () => freeze.unfreeze(sub.id));
    const resumed = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(resumed.status).toBe(SubscriptionStatus.ACTIVE);
    expect(resumed.frozenAt).toBeNull();
    expect(resumed.frozenUntil).toBeNull();
    const extensionDays = Math.round(
      (resumed.currentPeriodEnd.getTime() - originalPeriodEnd.getTime()) / DAY_MS,
    );
    expect(extensionDays).toBe(5);
  });
});
