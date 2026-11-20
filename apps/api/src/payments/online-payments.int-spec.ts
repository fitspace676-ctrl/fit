import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException } from '@nestjs/common';
import {
  GymMemberStatus,
  GymStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentReversalStatus,
  PaymentStatus,
  ProductStatus,
  Role,
  StockMovementReason,
} from '@fit/db';
import { encodeVariantRef } from '@fit/types';
import type { AutomationExecutorService } from '../automation/automation-executor.service';
import {
  FlittApiError,
  FlittTransportError,
  type FlittClient,
} from '../integrations/flitt/flitt-client';
import type { IntegrationsService } from '../integrations/integrations.service';
import { PromoRedemptionService } from '../marketing/promo-redemption.service';
import { PrismaService } from '../prisma/prisma.service';
import { disconnect, prisma, resetDb } from '../test/integration-db';
import { OnlinePaymentsService } from './online-payments.service';
import { ProviderRefundService } from './provider-refund.service';

/**
 * The Flitt payment flow against a real Postgres: the settle claim under
 * concurrency, decline → retry, the shop abandon (restock + promo release) and the
 * refund ordering. Flitt itself is a mock — what is proven here is what the
 * database does with its answers.
 */
const CREDS = { merchantId: '1549901', secretKey: 'test' };
const base = new PrismaService();
const integrations = {
  getActiveFlittCredentials: () => Promise.resolve(CREDS),
  getFlittCredentialsForSettlement: () => Promise.resolve(CREDS),
} as unknown as IntegrationsService;
const flitt = {
  createCheckout: vi.fn(),
  getOrderStatus: vi.fn(),
  reverse: vi.fn(),
};
const automation = {
  dispatchForGym: () => Promise.resolve(0),
} as unknown as AutomationExecutorService;
const promos = new PromoRedemptionService(base);
const payments = new OnlinePaymentsService(
  base,
  integrations,
  flitt as unknown as FlittClient,
  promos,
  automation,
);
const refunds = new ProviderRefundService(
  base,
  integrations,
  flitt as unknown as FlittClient,
  automation,
);

/** Flitt's status read for an attempt, as the approved/declined/expired variants. */
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

describe('Online payments (integration)', () => {
  let gymId: string;
  let memberId: string;
  let planId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
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
    const user = await prisma.user.create({ data: { email: 'buyer@example.com' } });
    const member = await prisma.gymMember.create({
      data: { userId: user.id, gymId, role: Role.MEMBER, status: GymMemberStatus.ACTIVE },
    });
    memberId = member.id;
    const plan = await prisma.packagePlan.create({
      data: { gymId, name: '10 classes', priceAmount: 2500, currency: 'GEL', sessionCount: 10 },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    await resetDb();
    await disconnect();
  });

  async function beginPack() {
    return payments.begin(
      {
        gymId,
        memberId,
        purpose: 'credit_pack',
        fulfilment: {
          kind: 'credit_pack',
          planId,
          name: '10 classes',
          credits: 10,
          validityDays: 30,
        },
        description: '10 classes',
        returnTo: 'web',
        order: {
          packageId: planId,
          total: 2500,
          currency: 'GEL',
          items: [{ label: '10 classes', amount: 2500 }],
        },
        paymentLocationId: null,
        promo: null,
      },
      CREDS,
    );
  }

  it('opens a pending order with nothing granted', async () => {
    const { orderId, payment } = await beginPack();
    expect(payment).toMatchObject({ status: 'requires_action', orderId });
    expect(payment.checkoutUrl).toContain('https://pay.flitt.com/');
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payment: true },
    });
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(order.payment).toMatchObject({ status: PaymentStatus.PENDING, provider: 'flitt' });
    expect(await prisma.creditPack.count({ where: { orderId } })).toBe(0);
  });

  it('grants once when the callback, the return and the sync settle at the same time', async () => {
    const { orderId } = await beginPack();
    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId } });
    flitt.getOrderStatus.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(statusFor(attempt.providerOrderId, 'approved', 2500)), 20),
        ),
    );

    const outcomes = await Promise.all([
      payments.settleAttempt(attempt.id),
      payments.settleAttempt(attempt.id),
      payments.settleAttempt(attempt.id),
    ]);

    expect(outcomes.filter((outcome) => outcome.kind === 'captured')).toHaveLength(1);
    expect(await prisma.creditPack.count({ where: { orderId } })).toBe(1);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payment: true, statusEvents: true },
    });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.payment).toMatchObject({
      status: PaymentStatus.CAPTURED,
      providerRef: '805243692',
    });
    expect(order.statusEvents.filter((event) => event.status === OrderStatus.PAID)).toHaveLength(1);
    // A later settle (the sweep, a retried callback) is a no-op.
    await expect(payments.settleAttempt(attempt.id)).resolves.toEqual({
      kind: 'final',
      status: PaymentAttemptStatus.CAPTURED,
    });
    expect(await prisma.creditPack.count({ where: { orderId } })).toBe(1);
  });

  it('grants nothing on a decline and lets the member retry with a new attempt', async () => {
    const { orderId } = await beginPack();
    const first = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId } });
    flitt.getOrderStatus.mockResolvedValueOnce(statusFor(first.providerOrderId, 'declined', 2500));
    await payments.settleAttempt(first.id);

    expect(await prisma.creditPack.count({ where: { orderId } })).toBe(0);
    expect(
      await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({ status: PaymentAttemptStatus.FAILED });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      status: OrderStatus.PENDING,
    });

    const retry = await payments.retry({ gymId, orderId, memberId, returnTo: 'app' });
    expect(retry.status).toBe('requires_action');
    const attempts = await prisma.paymentAttempt.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(attempts).toHaveLength(2);
    const second = attempts[1]!;
    expect(second.providerOrderId).not.toBe(first.providerOrderId);
    expect(second.returnTo).toBe('app');
    expect(await prisma.payment.findFirstOrThrow({ where: { orderId } })).toMatchObject({
      status: PaymentStatus.PENDING,
    });

    // A second retry while the new checkout is live hands back the same one.
    const again = await payments.retry({ gymId, orderId, memberId, returnTo: 'app' });
    expect(again.checkoutUrl).toBe(retry.checkoutUrl);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(2);

    flitt.getOrderStatus.mockResolvedValueOnce(statusFor(second.providerOrderId, 'approved', 2500));
    await payments.settleAttempt(second.id);
    expect(await prisma.creditPack.count({ where: { orderId } })).toBe(1);
  });

  it('abandons an unpaid shop order: stock back on the shelf, promo released', async () => {
    const location = await prisma.location.create({
      data: { gymId, name: 'Main', isDefault: true },
    });
    const product = await prisma.product.create({
      data: {
        gymId,
        name: 'Protein Bar',
        priceAmount: 500,
        currency: 'GEL',
        status: ProductStatus.ACTIVE,
        variants: [{ name: 'Chocolate', sku: 'PB-CHOC', priceAmount: 500, stock: 5 }],
      },
    });
    await prisma.productStock.create({
      data: { gymId, productId: product.id, locationId: location.id, variants: [5] },
    });
    const promo = await prisma.promoCode.create({
      data: {
        gymId,
        code: 'SHOP10',
        discountType: 'percentage',
        discountValue: 10,
        appliesTo: 'products',
        usageLimit: 1,
      },
    });
    const variantId = encodeVariantRef(product.id, 0);

    const { orderId } = await payments.begin(
      {
        gymId,
        memberId,
        purpose: 'shop',
        fulfilment: { kind: 'shop' },
        description: 'Protein Bar',
        returnTo: 'web',
        order: {
          total: 900,
          currency: 'GEL',
          fulfillment: 'PICKUP',
          locationId: location.id,
          items: [
            { label: 'Protein Bar ×2', amount: 1000, productVariantId: variantId, qty: 2 },
            { label: 'Promo SHOP10', amount: -100 },
          ],
        },
        paymentLocationId: location.id,
        promo: { promoId: promo.id, discount: 100, usageLimit: 1 },
        stockItems: [{ productVariantId: variantId, qty: 2 }],
      },
      CREDS,
    );
    expect(
      await prisma.stockMovement.count({ where: { orderId, reason: StockMovementReason.SALE } }),
    ).toBe(1);
    expect((await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usedCount).toBe(
      1,
    );

    // While the checkout is open the order cannot be abandoned.
    expect(await payments.abandonOrder(gymId, orderId)).toBe(false);

    const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId } });
    flitt.getOrderStatus.mockResolvedValueOnce(statusFor(attempt.providerOrderId, 'expired', 900));
    await payments.settleAttempt(attempt.id);
    expect(await payments.abandonOrder(gymId, orderId)).toBe(true);
    // Idempotent: a second abandon changes nothing.
    expect(await payments.abandonOrder(gymId, orderId)).toBe(false);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { payment: true },
    });
    expect(order.status).toBe(OrderStatus.CANCELLED);
    expect(order.payment?.status).toBe(PaymentStatus.FAILED);
    expect(
      await prisma.stockMovement.count({
        where: { orderId, reason: StockMovementReason.REFUND_RESTOCK },
      }),
    ).toBe(1);
    const shelf = await prisma.productStock.findFirstOrThrow({
      where: { productId: product.id, locationId: location.id },
    });
    expect(shelf.variants).toEqual([5]);
    expect(await prisma.promoRedemption.count({ where: { orderId } })).toBe(0);
    expect((await prisma.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).usedCount).toBe(
      0,
    );
  });

  describe('refunds through Flitt', () => {
    async function capturedOrder(): Promise<string> {
      const { orderId } = await beginPack();
      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId } });
      flitt.getOrderStatus.mockResolvedValueOnce(
        statusFor(attempt.providerOrderId, 'approved', 2500),
      );
      await payments.settleAttempt(attempt.id);
      return orderId;
    }
    const refundInput = (orderId: string, amount: number) => ({
      gymId,
      orderId,
      amount,
      reason: 'Changed mind',
      restockItems: false,
      processedById: null,
      actor: null,
    });

    it('records no refund and releases the claim when Flitt refuses the reversal', async () => {
      const orderId = await capturedOrder();
      flitt.reverse.mockRejectedValueOnce(new FlittApiError(1013, 'Refund refused'));

      const error = await refunds.refund(refundInput(orderId, 1000)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadGatewayException);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: 'PROVIDER_REFUND_FAILED',
      });
      expect(await prisma.refund.count({ where: { orderId } })).toBe(0);
      expect(await prisma.payment.findFirstOrThrow({ where: { orderId } })).toMatchObject({
        refundedAmount: 0,
        status: PaymentStatus.CAPTURED,
      });
      expect(await prisma.paymentReversal.findFirstOrThrow({ where: { orderId } })).toMatchObject({
        status: PaymentReversalStatus.FAILED,
      });
    });

    it('writes exactly one refund for a confirmed reversal, with a stable reverse_id', async () => {
      const orderId = await capturedOrder();
      flitt.reverse.mockResolvedValueOnce({
        reverse_status: 'approved',
        response_status: 'success',
      });

      const { refundId } = await refunds.refund(refundInput(orderId, 2500));
      const reversal = await prisma.paymentReversal.findFirstOrThrow({ where: { orderId } });
      expect(reversal).toMatchObject({ status: PaymentReversalStatus.SUCCEEDED, refundId });
      expect(flitt.reverse.mock.calls[0]![1]).toMatchObject({
        amount: 2500,
        reverseId: reversal.id,
      });
      expect(await prisma.refund.count({ where: { orderId } })).toBe(1);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { payment: true },
      });
      expect(order.status).toBe(OrderStatus.REFUNDED);
      expect(order.payment).toMatchObject({
        refundedAmount: 2500,
        status: PaymentStatus.REFUNDED,
      });
    });

    it('keeps the claim through an unknown outcome and lands the refund on the retry', async () => {
      const orderId = await capturedOrder();
      flitt.reverse.mockRejectedValueOnce(new FlittTransportError('timeout'));

      const error = await refunds.refund(refundInput(orderId, 1000)).catch((e: unknown) => e);
      expect((error as BadGatewayException).getResponse()).toMatchObject({
        code: 'PROVIDER_REFUND_PENDING',
      });
      expect(await prisma.refund.count({ where: { orderId } })).toBe(0);
      // The claim is held, so a concurrent refund cannot spend it twice.
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId } })).refundedAmount).toBe(
        1000,
      );

      flitt.reverse.mockResolvedValueOnce({
        reverse_status: 'approved',
        response_status: 'success',
      });
      await expect(refunds.retryPending(-60_000)).resolves.toBe(1);
      const reverseIds = flitt.reverse.mock.calls.map(
        (call) => (call[1] as { reverseId: string }).reverseId,
      );
      expect(reverseIds).toHaveLength(2);
      expect(reverseIds[1]).toBe(reverseIds[0]);
      expect(await prisma.refund.count({ where: { orderId } })).toBe(1);
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId } })).refundedAmount).toBe(
        1000,
      );
    });
  });
});
