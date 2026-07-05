import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GymStatus,
  Role,
  SubscriptionInterval,
  SubscriptionPlanStatus,
  SubscriptionStatus,
  addInterval,
} from '@fit/db';
import { SubscriptionBillingService } from './subscription-billing.service';
import type { BillingNotificationsService } from './billing-notifications.service';
import type { PaymentProvider, RenewalChargeInput, RenewalChargeResult } from './payment-provider';
import { InvoiceService } from '../billing/invoice.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { disconnect, prisma, resetDb } from '../test/integration-db';

/**
 * The recurring-billing sweep's **idempotency** proven against a real Postgres (T9.2).
 *
 * The lifecycle suite (T9.1) walks a subscription through its states; this suite
 * pins the property that keeps those transitions safe when the job runs more than
 * once for the same period — a re-run after a crash, or two replicas whose crons
 * fire in the same window and race the same rows. The two guarantees the task names:
 *
 *   • **Running the renewal job twice for the same period never double-charges** — a
 *     second pass (sequential *or* concurrent) advances the period, moves the status
 *     and mints the renewal invoice exactly once; the loser of the race no-ops.
 *   • **Failed-charge retries follow the ladder exactly once each** — a racing or
 *     repeated pass at the same dunning rung advances `paymentRetries` by exactly one,
 *     never double-counting a rung and so never shortening the grace window.
 *
 * The backstop under test is not the Redis day-lock (which `runBillingCycle` never
 * touches) but the database itself: every transition is a conditional `updateMany`
 * matched on the row's *observed* `(currentPeriodEnd, status[, paymentRetries])`, and
 * the renewal invoice is issued inside the same transaction *only when that update won
 * the race*. So the sweep runs on the raw cross-tenant client with an injected `now`,
 * and the only faked seams are the two genuinely external ones: the payment gateway
 * (whose outcome the test flips) and the billing notifications (no-ops here).
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
// no-op so a send never affects — or masks — the transitions under test.
const notificationsStub = {
  renewalSucceeded: () => Promise.resolve(),
  chargeFailed: () => Promise.resolve(),
  notifyTrialsEndingSoon: () => Promise.resolve({ matched: 0, notified: 0, deduped: 0, errors: 0 }),
} as unknown as BillingNotificationsService;

/** Build a billing sweep over the **unscoped** client (as the cron runs it), with `provider` bound. */
function makeBilling(provider: PaymentProvider): SubscriptionBillingService {
  return new SubscriptionBillingService(
    { client: prisma } as unknown as PrismaService,
    // `runBillingCycle` (the method under test) never touches Redis — the daily lock
    // lives in `runScheduled` — so a placeholder client suffices.
    { client: {} } as unknown as RedisService,
    new InvoiceService(),
    notificationsStub,
    provider,
  );
}

const PRICE = 12000;

describe('Subscription billing idempotency (integration)', () => {
  let gymId: string;
  let memberId: string;
  let planId: string;

  beforeEach(async () => {
    await resetDb();

    const gym = await prisma.gym.create({
      data: { name: 'Alpha Gym', slug: 'alpha-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;

    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    const membership = await prisma.gymMember.create({
      data: { userId: user.id, gymId, role: Role.MEMBER },
    });
    memberId = membership.id;

    const plan = await prisma.subscriptionPlan.create({
      data: {
        gymId,
        name: 'Premium',
        priceAmount: PRICE,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        status: SubscriptionPlanStatus.ACTIVE,
      },
    });
    planId = plan.id;
  });

  afterAll(disconnect);

  /**
   * Create a live subscription whose paid period ends at `periodEnd`, so a sweep run
   * at (or after) `periodEnd` finds it due. Created directly rather than through the
   * enrolment service so the period boundary is exact and no first-period invoice
   * clouds the renewal-invoice count.
   */
  async function makeDueSubscription(
    periodEnd: Date,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    paymentRetries = 0,
  ) {
    return prisma.subscription.create({
      data: {
        gymId,
        planId,
        memberId,
        status,
        priceAmount: PRICE,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY_MS),
        currentPeriodEnd: periodEnd,
        paymentRetries,
      },
    });
  }

  const reload = (id: string) => prisma.subscription.findUniqueOrThrow({ where: { id } });
  const invoiceCount = (subscriptionId: string) =>
    prisma.invoice.count({ where: { subscriptionId } });

  it('renews once when the sweep is run twice for the same due period: second pass finds nothing due', async () => {
    const periodEnd = new Date('2026-03-01T00:00:00.000Z');
    const sub = await makeDueSubscription(periodEnd);
    const provider = new ControllablePaymentProvider();
    const billing = makeBilling(provider);

    // First pass renews and mints the renewal invoice.
    const first = await billing.runBillingCycle({ now: periodEnd });
    expect(first).toMatchObject({ subscriptionsDue: 1, renewed: 1, pastDue: 0, errors: 0 });
    expect(await invoiceCount(sub.id)).toBe(1);

    const renewed = await reload(sub.id);
    expect(renewed.currentPeriodEnd.getTime()).toBe(
      addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
    );

    // Re-running the identical pass (a crash-and-retry, or an overlapping cron on the
    // next tick): the period was already advanced, so this subscription is no longer
    // due — no second charge, no second invoice, no state change.
    const second = await billing.runBillingCycle({ now: periodEnd });
    expect(second).toMatchObject({ subscriptionsDue: 0, renewed: 0, pastDue: 0, errors: 0 });
    expect(provider.calls).toHaveLength(1);
    expect(await invoiceCount(sub.id)).toBe(1);

    const after = await reload(sub.id);
    expect(after.currentPeriodEnd.getTime()).toBe(renewed.currentPeriodEnd.getTime());
    expect(after.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('advances the period exactly once when two sweeps race the same due renewal (DB conditional-update backstop)', async () => {
    const periodEnd = new Date('2026-03-01T00:00:00.000Z');
    const sub = await makeDueSubscription(periodEnd);
    const provider = new ControllablePaymentProvider();
    const billing = makeBilling(provider);

    // Two replicas whose crons fired in the same window, both reading the row as due
    // before either commits. Only the conditional `updateMany` (matched on the observed
    // period end) may win the advance; the loser matches nothing and issues no invoice.
    const [a, b] = await Promise.all([
      billing.runBillingCycle({ now: periodEnd }),
      billing.runBillingCycle({ now: periodEnd }),
    ]);

    // Across both runners the renewal was counted exactly once.
    expect(a.renewed + b.renewed).toBe(1);
    expect(a.errors + b.errors).toBe(0);

    // The period advanced a single interval, and exactly one renewal invoice exists —
    // no double-advance, no double-invoice.
    const after = await reload(sub.id);
    expect(after.status).toBe(SubscriptionStatus.ACTIVE);
    expect(after.currentPeriodEnd.getTime()).toBe(
      addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
    );
    expect(await invoiceCount(sub.id)).toBe(1);

    // The gateway may have been asked to charge by both runners, but every attempt
    // carried the *same* per-period idempotency key, so a real gateway settles it once.
    expect(provider.calls.length).toBeGreaterThanOrEqual(1);
    const keys = new Set(provider.calls.map((c) => c.idempotencyKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe(`${sub.id}:${periodEnd.toISOString()}:r0`);
  });

  it('advances the dunning ladder exactly one rung when two sweeps race the same retry window', async () => {
    // Already past-due at rung 0, sitting at the +2-day first-retry window.
    const periodEnd = new Date('2026-03-01T00:00:00.000Z');
    const sub = await makeDueSubscription(periodEnd, SubscriptionStatus.PAST_DUE, 0);
    const retryDay = new Date(periodEnd.getTime() + 2 * DAY_MS);

    const provider = new ControllablePaymentProvider();
    provider.mode = 'fail';
    const billing = makeBilling(provider);

    const [a, b] = await Promise.all([
      billing.runBillingCycle({ now: retryDay }),
      billing.runBillingCycle({ now: retryDay }),
    ]);

    // The failed retry is recorded once: exactly one runner sees the rung advance.
    expect(a.pastDue + b.pastDue).toBe(1);
    expect(a.errors + b.errors).toBe(0);

    const after = await reload(sub.id);
    expect(after.status).toBe(SubscriptionStatus.PAST_DUE);
    // The ladder moved from rung 0 to rung 1 — once, not twice — so the grace window
    // is not silently shortened by a racing pass.
    expect(after.paymentRetries).toBe(1);
    // A failed charge raises no invoice.
    expect(await invoiceCount(sub.id)).toBe(0);
  });

  it('does not re-fire the same rung when a failed-charge pass is re-run before the next retry window opens', async () => {
    const periodEnd = new Date('2026-03-01T00:00:00.000Z');
    const sub = await makeDueSubscription(periodEnd, SubscriptionStatus.PAST_DUE, 0);
    const retryDay = new Date(periodEnd.getTime() + 2 * DAY_MS);

    const provider = new ControllablePaymentProvider();
    provider.mode = 'fail';
    const billing = makeBilling(provider);

    // First pass at the +2 window fails and advances the ladder to rung 1.
    const first = await billing.runBillingCycle({ now: retryDay });
    expect(first).toMatchObject({ pastDue: 1, expired: 0, errors: 0 });
    expect((await reload(sub.id)).paymentRetries).toBe(1);
    const chargesAfterFirst = provider.calls.length;

    // Re-running at the same instant: rung 1's window is +5 days, still in the future,
    // so the subscription is due-but-waiting — classified `skip`, not re-charged. The
    // ladder does not advance a second time for the same window.
    const second = await billing.runBillingCycle({ now: retryDay });
    expect(second).toMatchObject({ subscriptionsDue: 1, pastDue: 0, expired: 0, errors: 0 });
    expect(provider.calls.length).toBe(chargesAfterFirst);
    expect((await reload(sub.id)).paymentRetries).toBe(1);
  });

  it('expires a past-due subscription exactly once when the exhausted-ladder sweep is run twice', async () => {
    // Ladder exhausted (retries === offsets.length for the default "2,5,7"): the next
    // sweep past the final grace window expires it.
    const periodEnd = new Date('2026-03-01T00:00:00.000Z');
    const sub = await makeDueSubscription(periodEnd, SubscriptionStatus.PAST_DUE, 3);
    const afterGrace = new Date(periodEnd.getTime() + 8 * DAY_MS);

    const provider = new ControllablePaymentProvider();
    provider.mode = 'fail';
    const billing = makeBilling(provider);

    const first = await billing.runBillingCycle({ now: afterGrace });
    expect(first).toMatchObject({ expired: 1, renewed: 0, pastDue: 0, errors: 0 });
    expect((await reload(sub.id)).status).toBe(SubscriptionStatus.EXPIRED);
    // Expiry is a pure status transition — it charges nothing.
    expect(provider.calls).toHaveLength(0);

    // A re-run does not re-expire (nor charge) an already-expired subscription: EXPIRED
    // is terminal and outside the billable set.
    const second = await billing.runBillingCycle({ now: afterGrace });
    expect(second).toMatchObject({ subscriptionsDue: 0, expired: 0, errors: 0 });
    expect((await reload(sub.id)).status).toBe(SubscriptionStatus.EXPIRED);
    expect(await invoiceCount(sub.id)).toBe(0);
  });
});
