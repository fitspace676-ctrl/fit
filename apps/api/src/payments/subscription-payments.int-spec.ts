import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import {
  GymMemberStatus,
  GymStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentStatus,
  Role,
  SubscriptionInterval,
  SubscriptionPlanStatus,
  SubscriptionStatus,
  addInterval,
} from '@fit/db';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import { InvoiceService } from '../billing/invoice.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext, type TenantState } from '../common/tenant/tenant.context';
import type { FlittClient } from '../integrations/flitt/flitt-client';
import type { IntegrationsService } from '../integrations/integrations.service';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';
import { MeSubscriptionService } from '../me/me-subscription.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { BillingNotificationsService } from '../subscriptions/billing-notifications.service';
import type { PaymentProvider } from '../subscriptions/payment-provider';
import { SubscriptionBillingService } from '../subscriptions/subscription-billing.service';
import { SubscriptionEnrollmentService } from '../subscriptions/subscription-enrollment.service';
import { asTenant, disconnect, prisma, resetDb, tenantPrisma } from '../test/integration-db';
import { OnlinePaymentsService } from './online-payments.service';

/**
 * Subscriptions paid by hand through Flitt, against a real Postgres: the first
 * period is granted only on capture (once, however many settlers race), a capture
 * that can no longer be honoured is parked NEEDS_REVIEW with nothing granted, a
 * manually paid period advances once however many orders paid for it, the pay
 * window is enforced, an unpaid manual subscription lapses through the existing
 * dunning path without any gateway call, and the stub path is untouched. Flitt is
 * a mock — what is proven is what the database does with its answers.
 */
const CREDS = { merchantId: '1549901', secretKey: 'test' };
const DAY_MS = 24 * 60 * 60 * 1000;
const PRICE = 9000;

const base = new PrismaService();
const integrations = {
  getActiveFlittCredentials: vi.fn(() => Promise.resolve(CREDS as typeof CREDS | null)),
  getFlittCredentialsForSettlement: vi.fn(() => Promise.resolve(CREDS)),
};
const flitt = {
  createCheckout: vi.fn(),
  getOrderStatus: vi.fn(),
  reverse: vi.fn(),
};
const automation = {
  dispatchForGym: () => Promise.resolve(0),
} as unknown as AutomationExecutorService;
const invoices = new InvoiceService();
const payments = new OnlinePaymentsService(
  base,
  integrations as unknown as IntegrationsService,
  flitt as unknown as FlittClient,
  new PromoRedemptionService(base),
  automation,
  invoices,
);
const scoped = { client: tenantPrisma } as unknown as TenantPrismaService;
const enrollment = new SubscriptionEnrollmentService(
  scoped,
  new TenantContext(),
  invoices,
  payments,
);
const me = new MeSubscriptionService(scoped, new TenantContext(), payments);

function statusFor(providerOrderId: string, status: string, amount: number) {
  return {
    order_id: providerOrderId,
    order_status: status,
    response_status: 'success',
    amount: String(amount),
    currency: 'GEL',
    merchant_id: 1549901,
    payment_id: 805243692,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConflictException);
  return ((error as ConflictException).getResponse() as { code?: string }).code;
}

describe('Subscriptions paid through Flitt (integration)', () => {
  let gymId: string;
  let userId: string;
  let memberId: string;
  let planId: string;

  const caller = (): TenantState => ({
    userId,
    gymId,
    role: Role.MEMBER,
    allowCrossTenant: false,
  });

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    integrations.getActiveFlittCredentials.mockImplementation(() => Promise.resolve(CREDS));
    flitt.createCheckout.mockImplementation((_creds: unknown, input: { orderId: string }) =>
      Promise.resolve({
        checkout_url: `https://pay.flitt.com/merchants/test/${input.orderId}`,
        payment_id: 1,
        response_status: 'success',
      }),
    );
    const gym = await prisma.gym.create({
      data: { name: 'Pay Gym', slug: 'pay-gym', status: GymStatus.ACTIVE },
    });
    gymId = gym.id;
    const user = await prisma.user.create({ data: { email: 'member@example.com' } });
    userId = user.id;
    const member = await prisma.gymMember.create({
      data: { userId, gymId, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
    });
    memberId = member.id;
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

  afterAll(async () => {
    await resetDb();
    await disconnect();
  });

  /** A live subscription created directly, paid by hand (`flitt`) unless told otherwise. */
  async function makeSubscription(over: {
    periodEnd: Date;
    status?: SubscriptionStatus;
    provider?: string;
    paymentRetries?: number;
  }) {
    return prisma.subscription.create({
      data: {
        gymId,
        planId,
        memberId,
        status: over.status ?? SubscriptionStatus.ACTIVE,
        priceAmount: PRICE,
        currency: 'GEL',
        interval: SubscriptionInterval.MONTH,
        currentPeriodStart: new Date(over.periodEnd.getTime() - 30 * DAY_MS),
        currentPeriodEnd: over.periodEnd,
        provider: over.provider ?? 'flitt',
        paymentRetries: over.paymentRetries ?? 0,
      },
    });
  }

  async function approve(orderId: string, amount = PRICE) {
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    flitt.getOrderStatus.mockResolvedValueOnce(
      statusFor(attempt.providerOrderId, 'approved', amount),
    );
    return payments.settleAttempt(attempt.id);
  }

  describe('first period (POST /checkout, productType subscription)', () => {
    it('grants nothing until Flitt approves, then enrols exactly once', async () => {
      const result = await asTenant(caller(), () => enrollment.purchaseSelf(planId, 'app'));

      expect(result.subscriptionId).toBeNull();
      expect(result.payment).toMatchObject({ status: 'requires_action', orderId: result.orderId });
      const orderId = result.orderId!;
      expect(await prisma.subscription.count({ where: { memberId } })).toBe(0);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payment: true },
      });
      expect(order).toMatchObject({ status: OrderStatus.PENDING, total: PRICE, currency: 'GEL' });
      expect(order.payment).toMatchObject({ status: PaymentStatus.PENDING, provider: 'flitt' });
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId } });
      expect(attempt).toMatchObject({ purpose: 'subscription_start', returnTo: 'app' });

      // The callback, the browser return and the member's sync race the settle.
      flitt.getOrderStatus.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(statusFor(attempt.providerOrderId, 'approved', PRICE)), 20),
          ),
      );
      const outcomes = await Promise.all([
        payments.settleAttempt(attempt.id),
        payments.settleAttempt(attempt.id),
        payments.settleAttempt(attempt.id),
      ]);
      expect(outcomes.filter((o) => o.kind === 'captured')).toHaveLength(1);

      const subs = await prisma.subscription.findMany({ where: { memberId } });
      expect(subs).toHaveLength(1);
      expect(subs[0]).toMatchObject({
        status: SubscriptionStatus.ACTIVE,
        provider: 'flitt',
        planId,
        priceAmount: PRICE,
        currency: 'GEL',
      });
      expect(subs[0]!.currentPeriodEnd.getTime()).toBe(
        addInterval(subs[0]!.currentPeriodStart, SubscriptionInterval.MONTH).getTime(),
      );
      // The first-period invoice is tied to the paid order (revenue counted once).
      const invoicesForSub = await prisma.invoice.findMany({
        where: { subscriptionId: subs[0]!.id },
      });
      expect(invoicesForSub).toHaveLength(1);
      expect(invoicesForSub[0]).toMatchObject({ orderId, amount: PRICE, currency: 'GEL' });
      expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
        status: OrderStatus.PAID,
      });

      // A later settle (the sweep, a re-delivered callback) changes nothing.
      await expect(payments.settleAttempt(attempt.id)).resolves.toEqual({
        kind: 'final',
        status: PaymentAttemptStatus.CAPTURED,
      });
      expect(await prisma.subscription.count({ where: { memberId } })).toBe(1);
      expect(await prisma.invoice.count({ where: { memberId } })).toBe(1);
    });

    it('hands back the open checkout instead of opening a second order for the same plan', async () => {
      const first = await asTenant(caller(), () => enrollment.purchaseSelf(planId, 'web'));
      const second = await asTenant(caller(), () => enrollment.purchaseSelf(planId, 'web'));
      expect(second.orderId).toBe(first.orderId);
      expect(second.payment?.checkoutUrl).toBe(first.payment?.checkoutUrl);
      expect(await prisma.order.count({ where: { memberId } })).toBe(1);
    });

    it('refuses with 409 ALREADY_SUBSCRIBED when the member already holds a live subscription', async () => {
      await makeSubscription({ periodEnd: new Date(Date.now() + 20 * DAY_MS) });
      const code = await codeOf(asTenant(caller(), () => enrollment.purchaseSelf(planId, 'web')));
      expect(code).toBe('ALREADY_SUBSCRIBED');
      expect(await prisma.order.count({ where: { memberId } })).toBe(0);
    });

    it('parks the attempt NEEDS_REVIEW, granting nothing, when the member subscribed while paying', async () => {
      const { orderId } = await asTenant(caller(), () => enrollment.purchaseSelf(planId, 'web'));
      // Staff enrolled the member at the desk while the checkout was open.
      const desk = await makeSubscription({
        periodEnd: new Date(Date.now() + 30 * DAY_MS),
        provider: 'stub',
      });

      const outcome = await approve(orderId!);

      expect(outcome).toEqual({ kind: 'needs_review', reason: 'already_subscribed' });
      const subs = await prisma.subscription.findMany({ where: { memberId } });
      expect(subs.map((s) => s.id)).toEqual([desk.id]);
      expect(await prisma.invoice.count({ where: { orderId: orderId! } })).toBe(0);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId! },
        include: { payment: true, paymentAttempts: true },
      });
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.payment?.status).toBe(PaymentStatus.PENDING);
      expect(order.paymentAttempts[0]).toMatchObject({
        status: PaymentAttemptStatus.NEEDS_REVIEW,
        failureCode: 'already_subscribed',
      });
      // Money may have moved: neither the member nor the sweep can make it disappear.
      expect(await payments.abandonOrder(gymId, orderId!)).toBe(false);
      expect(
        await codeOf(payments.retry({ gymId, orderId: orderId!, memberId, returnTo: 'web' })),
      ).toBe('PAYMENT_IN_PROGRESS');
    });

    it('legacy POST /subscriptions opens the same pending order and enrols nothing before payment', async () => {
      const result = await asTenant(caller(), () => enrollment.enrollSelf(planId, 'app'));

      expect(result.subscription).toBeNull();
      expect(result.payment).toMatchObject({ status: 'requires_action', orderId: result.orderId });
      expect(await prisma.subscription.count({ where: { memberId } })).toBe(0);
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({
        where: { orderId: result.orderId! },
      });
      expect(attempt).toMatchObject({ purpose: 'subscription_start', returnTo: 'app' });

      await expect(approve(result.orderId!)).resolves.toEqual({ kind: 'captured' });
      expect(await prisma.subscription.findFirstOrThrow({ where: { memberId } })).toMatchObject({
        status: SubscriptionStatus.ACTIVE,
        provider: 'flitt',
      });
    });

    it('starts a trial at once, stamped for manual payment, with no order', async () => {
      await prisma.subscriptionPlan.update({ where: { id: planId }, data: { trialDays: 7 } });
      const result = await asTenant(caller(), () => enrollment.purchaseSelf(planId, 'web'));
      expect(result.orderId).toBeNull();
      expect(result.payment).toBeUndefined();
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { id: result.subscriptionId! },
      });
      expect(sub).toMatchObject({ status: SubscriptionStatus.TRIAL, provider: 'flitt' });
      expect(await prisma.order.count({ where: { memberId } })).toBe(0);
    });

    it('keeps the stub path exactly as before when the gym has no Flitt', async () => {
      integrations.getActiveFlittCredentials.mockImplementation(() => Promise.resolve(null));
      const result = await asTenant(caller(), () => enrollment.purchaseSelf(planId, 'web'));

      expect(result.orderId).toBeNull();
      expect(result.payment).toBeUndefined();
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { id: result.subscriptionId! },
      });
      expect(sub).toMatchObject({ status: SubscriptionStatus.ACTIVE, provider: 'stub' });
      expect(await prisma.order.count({ where: { memberId } })).toBe(0);
      const invoice = await prisma.invoice.findFirstOrThrow({ where: { subscriptionId: sub.id } });
      expect(invoice.orderId).toBeNull();
      expect(flitt.createCheckout).not.toHaveBeenCalled();
    });
  });

  describe('next period (POST /me/subscription/pay)', () => {
    it('advances the period once even when two orders paid for the same period', async () => {
      const periodEnd = new Date(Date.now() + 3 * DAY_MS);
      const sub = await makeSubscription({ periodEnd });

      const { payment } = await asTenant(caller(), () => me.payNextPeriod('web'));
      expect(payment.status).toBe('requires_action');
      // A second press hands back the same checkout rather than a second order.
      const again = await asTenant(caller(), () => me.payNextPeriod('web'));
      expect(again.payment.checkoutUrl).toBe(payment.checkoutUrl);
      expect(await prisma.order.count({ where: { memberId } })).toBe(1);

      // A racing second order for the same period (e.g. two devices at once).
      const racing = await payments.begin(
        {
          gymId,
          memberId,
          purpose: 'subscription_renewal',
          fulfilment: {
            kind: 'subscription_renewal',
            subscriptionId: sub.id,
            periodEnd: periodEnd.toISOString(),
          },
          description: 'Premium',
          returnTo: 'web',
          order: { total: PRICE, currency: 'GEL', items: [{ label: 'Premium', amount: PRICE }] },
          paymentLocationId: null,
          promo: null,
        },
        CREDS,
      );

      await expect(approve(payment.orderId)).resolves.toEqual({ kind: 'captured' });
      await expect(approve(racing.orderId)).resolves.toEqual({
        kind: 'needs_review',
        reason: 'period_already_paid',
      });

      const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(after.status).toBe(SubscriptionStatus.ACTIVE);
      expect(after.provider).toBe('flitt');
      expect(after.currentPeriodStart.getTime()).toBe(periodEnd.getTime());
      expect(after.currentPeriodEnd.getTime()).toBe(
        addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
      );
      const renewalInvoices = await prisma.invoice.findMany({ where: { subscriptionId: sub.id } });
      expect(renewalInvoices).toHaveLength(1);
      expect(renewalInvoices[0]!.orderId).toBe(payment.orderId);
    });

    it('refuses before the pay window opens with 409 SUBSCRIPTION_NOT_DUE', async () => {
      await makeSubscription({ periodEnd: new Date(Date.now() + 20 * DAY_MS) });
      expect(await codeOf(asTenant(caller(), () => me.payNextPeriod('web')))).toBe(
        'SUBSCRIPTION_NOT_DUE',
      );
      expect(await prisma.order.count({ where: { memberId } })).toBe(0);

      const view = await asTenant(caller(), () => me.getMySubscription());
      expect(view.subscription?.payment).toMatchObject({
        mode: 'manual',
        canPayNow: false,
        amount: PRICE,
        currency: 'GEL',
        pendingOrderId: null,
      });
    });

    it('refuses a subscription that is not paid by hand with 409 SUBSCRIPTION_NOT_PAYABLE', async () => {
      await makeSubscription({ periodEnd: new Date(Date.now() + 2 * DAY_MS), provider: 'stub' });
      expect(await codeOf(asTenant(caller(), () => me.payNextPeriod('web')))).toBe(
        'SUBSCRIPTION_NOT_PAYABLE',
      );
    });

    it('lets a past-due member pay and reactivates the membership', async () => {
      const periodEnd = new Date(Date.now() - 3 * DAY_MS);
      const sub = await makeSubscription({
        periodEnd,
        status: SubscriptionStatus.PAST_DUE,
        paymentRetries: 1,
      });
      const view = await asTenant(caller(), () => me.getMySubscription());
      expect(view.subscription?.payment).toMatchObject({ mode: 'manual', canPayNow: true });

      const { payment } = await asTenant(caller(), () => me.payNextPeriod('app'));
      const pending = await asTenant(caller(), () => me.getMySubscription());
      expect(pending.subscription?.payment?.pendingOrderId).toBe(payment.orderId);

      await expect(approve(payment.orderId)).resolves.toEqual({ kind: 'captured' });
      const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(after).toMatchObject({ status: SubscriptionStatus.ACTIVE, paymentRetries: 0 });
      expect(after.currentPeriodEnd.getTime()).toBe(
        addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
      );
    });
  });

  describe('lapse without an automatic charge (renewal job)', () => {
    const chargeRenewal = vi.fn();
    const provider = { key: 'stub', chargeRenewal } as unknown as PaymentProvider;
    const notifications = {
      renewalSucceeded: vi.fn(() => Promise.resolve()),
      chargeFailed: vi.fn(() => Promise.resolve()),
      notifyTrialsEndingSoon: vi.fn(() =>
        Promise.resolve({ matched: 0, notified: 0, deduped: 0, errors: 0 }),
      ),
      notifyManualRenewalsDue: vi.fn(() =>
        Promise.resolve({ matched: 0, notified: 0, deduped: 0, errors: 0 }),
      ),
    };
    const billing = new SubscriptionBillingService(
      base,
      { client: {} } as unknown as RedisService,
      invoices,
      notifications as unknown as BillingNotificationsService,
      provider,
      automation,
    );

    it('walks an unpaid manual subscription PAST_DUE → EXPIRED and never calls a gateway', async () => {
      const periodEnd = new Date('2026-06-01T00:00:00.000Z');
      const sub = await makeSubscription({ periodEnd });

      await billing.runBillingCycle({ now: new Date(periodEnd.getTime() + 60_000) });
      expect(await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).toMatchObject(
        { status: SubscriptionStatus.PAST_DUE, paymentRetries: 0 },
      );
      expect(notifications.chargeFailed).toHaveBeenCalledWith(
        expect.objectContaining({ id: sub.id }),
        { rung: 0, periodEnd, manual: true },
      );

      // The retry rungs (+2 / +5 / +7 days) each just re-check, then the ladder expires it.
      for (const day of [2, 5, 7]) {
        await billing.runBillingCycle({ now: new Date(periodEnd.getTime() + day * DAY_MS) });
      }
      expect(
        (await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).paymentRetries,
      ).toBe(3);
      const final = await billing.runBillingCycle({
        now: new Date(periodEnd.getTime() + 8 * DAY_MS),
      });
      expect(final.expired).toBe(1);
      expect(await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).toMatchObject(
        { status: SubscriptionStatus.EXPIRED, currentPeriodEnd: periodEnd },
      );

      expect(chargeRenewal).not.toHaveBeenCalled();
      expect(await prisma.invoice.count({ where: { subscriptionId: sub.id } })).toBe(0);
    });

    it('still charges a stub-provider subscription through the bound provider', async () => {
      chargeRenewal.mockResolvedValueOnce({ outcome: 'succeeded', providerRef: null });
      const periodEnd = new Date('2026-06-01T00:00:00.000Z');
      const sub = await makeSubscription({ periodEnd, provider: 'stub' });

      await billing.runBillingCycle({ now: new Date(periodEnd.getTime() + 60_000) });

      expect(chargeRenewal).toHaveBeenCalledTimes(1);
      const after = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } });
      expect(after.currentPeriodEnd.getTime()).toBe(
        addInterval(periodEnd, SubscriptionInterval.MONTH).getTime(),
      );
    });
  });
});
