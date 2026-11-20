import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AutomationTriggerType,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentReversalStatus,
  PaymentStatus,
  StockMovementReason,
  type PaymentReversal,
} from '@fit/db';
import {
  PROVIDER_REFUND_FAILED_CODE,
  PROVIDER_REFUND_PENDING_CODE,
  REFUND_EXCEEDS_PAID_CODE,
} from '@fit/types';
import { AutomationExecutorService } from '../automation/automation-executor.service';
import { FlittApiError, FlittClient } from '../integrations/flitt/flitt-client';
import { IntegrationsService } from '../integrations/integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { applyOrderStockMovements } from '../products/order-stock';

export interface ProviderRefundInput {
  gymId: string;
  orderId: string;
  amount: number;
  reason: string;
  restockItems: boolean;
  /** The refunding staff member's gym membership id (`Refund.processedById`). */
  processedById: string | null;
  /** The refunding staff user id (the order status event's `actor`). */
  actor: string | null;
}

type Outcome = 'succeeded' | 'refused' | 'unknown';

/**
 * Refunds of provider-captured (Flitt) payments.
 *
 * The ordering, chosen so that a failed reversal can never leave the headroom
 * claimed and a succeeded reversal can never be lost:
 *
 * 1. **Claim** — one transaction advances `Payment.refundedAmount` with the same
 *    bounded conditional increment the stub refund uses (docs/adr/atomic-counters.md)
 *    and records a `PaymentReversal` (PENDING). Its id is the idempotent
 *    `reverse_id` sent to Flitt.
 * 2. **Reverse** — Flitt is called outside any transaction.
 * 3. **Finalise** — approved: a second transaction flips the reversal to
 *    SUCCEEDED (conditional, so it happens once), writes the `Refund`, retires the
 *    payment / order on a full refund and restocks. Refused: the reversal goes
 *    FAILED and the claim is released (decrement) in one transaction; no refund
 *    exists. Unknown (timeout, unreachable, still processing): the reversal stays
 *    PENDING with the claim held, and {@link retryPending} re-sends the SAME
 *    `reverse_id` from the sweep until Flitt gives a final answer — the
 *    idempotency key is what makes that re-send safe.
 *
 * A crash between 2 and 3 is the "unknown" case and resolves the same way.
 */
@Injectable()
export class ProviderRefundService {
  private readonly logger = new Logger(ProviderRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly flitt: FlittClient,
    private readonly automation: AutomationExecutorService,
  ) {}

  async refund(input: ProviderRefundInput): Promise<{ refundId: string; memberId: string | null }> {
    const { gymId, orderId, amount } = input;
    const order = await this.prisma.client.order.findFirst({
      where: { id: orderId, gymId },
      select: {
        id: true,
        memberId: true,
        payment: {
          select: { id: true, amount: true, currency: true, provider: true, status: true },
        },
      },
    });
    if (!order) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }
    const payment = order.payment;
    if (!payment || payment.status !== PaymentStatus.CAPTURED || amount > payment.amount) {
      throw exceedsPaid();
    }

    // 1) Claim the headroom and record the reversal before asking Flitt.
    const reversalId = randomUUID();
    await this.prisma.client.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: {
          id: payment.id,
          gymId,
          status: PaymentStatus.CAPTURED,
          refundedAmount: { lte: payment.amount - amount },
        },
        data: { refundedAmount: { increment: amount } },
      });
      if (claimed.count === 0) throw exceedsPaid();
      await tx.paymentReversal.create({
        data: {
          id: reversalId,
          gymId,
          orderId,
          paymentId: payment.id,
          provider: payment.provider,
          amount,
          currency: payment.currency,
          reason: input.reason,
          restockItems: input.restockItems,
          processedById: input.processedById,
          actor: input.actor,
        },
      });
    });

    const reversal = await this.prisma.client.paymentReversal.findUniqueOrThrow({
      where: { id: reversalId },
    });
    // 2) + 3)
    const outcome = await this.reverseAndApply(reversal);
    if (outcome.kind === 'succeeded') {
      return { refundId: outcome.refundId, memberId: order.memberId };
    }
    if (outcome.kind === 'refused') {
      throw new BadGatewayException({
        code: PROVIDER_REFUND_FAILED_CODE,
        message: 'The payment provider refused the refund; nothing was refunded',
      });
    }
    throw new BadGatewayException({
      code: PROVIDER_REFUND_PENDING_CODE,
      message:
        'The payment provider did not confirm the refund yet; it will be retried automatically',
    });
  }

  /** Sweep entry: re-send every reversal still PENDING after `olderThanMs`. */
  async retryPending(olderThanMs = 2 * 60_000, limit = 50): Promise<number> {
    const stale = await this.prisma.client.paymentReversal.findMany({
      where: {
        status: PaymentReversalStatus.PENDING,
        updatedAt: { lt: new Date(Date.now() - olderThanMs) },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let resolved = 0;
    for (const reversal of stale) {
      try {
        const outcome = await this.reverseAndApply(reversal);
        if (outcome.kind === 'succeeded') {
          resolved += 1;
          if (outcome.memberId) void this.dispatchRefundIssued(reversal.gymId, reversal.orderId);
        } else if (outcome.kind === 'refused') {
          resolved += 1;
        } else {
          // Bump `updatedAt` so one stuck reversal does not starve the batch.
          await this.prisma.client.paymentReversal.updateMany({
            where: { id: reversal.id, status: PaymentReversalStatus.PENDING },
            data: { failureCode: 'unconfirmed' },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Reversal ${reversal.id} retry failed (${error instanceof Error ? error.name : 'error'})`,
        );
      }
    }
    return resolved;
  }

  private async reverseAndApply(
    reversal: PaymentReversal,
  ): Promise<
    | { kind: 'succeeded'; refundId: string; memberId: string | null }
    | { kind: 'refused' }
    | { kind: 'unknown' }
  > {
    const outcome = await this.callProvider(reversal);
    if (outcome === 'succeeded') return { kind: 'succeeded', ...(await this.finalise(reversal)) };
    if (outcome === 'refused') {
      await this.release(reversal, 'provider_refused');
      return { kind: 'refused' };
    }
    return { kind: 'unknown' };
  }

  private async callProvider(reversal: PaymentReversal): Promise<Outcome> {
    const attempt = await this.prisma.client.paymentAttempt.findFirst({
      where: {
        gymId: reversal.gymId,
        orderId: reversal.orderId,
        status: PaymentAttemptStatus.CAPTURED,
      },
      orderBy: { settledAt: 'desc' },
      select: { providerOrderId: true, merchantId: true },
    });
    let credentials;
    try {
      credentials = await this.integrations.getFlittCredentialsForSettlement(reversal.gymId);
    } catch {
      credentials = null;
    }
    if (!attempt || !credentials || credentials.merchantId !== attempt.merchantId) {
      // Nothing we can reverse against with what we hold: a definite refusal.
      return 'refused';
    }
    try {
      const result = await this.flitt.reverse(credentials, {
        orderId: attempt.providerOrderId,
        amount: reversal.amount,
        currency: 'GEL',
        reverseId: reversal.id,
        comment: reversal.reason.slice(0, 1024),
      });
      if (result.reverse_status === 'approved' || result.reverse_status === 'reversed') {
        return 'succeeded';
      }
      if (result.reverse_status === 'declined') return 'refused';
      return 'unknown';
    } catch (error) {
      // A provider error response is a definite answer; transport trouble is not.
      return error instanceof FlittApiError ? 'refused' : 'unknown';
    }
  }

  /** Write the refund for a confirmed reversal — once. */
  private async finalise(
    reversal: PaymentReversal,
  ): Promise<{ refundId: string; memberId: string | null }> {
    const { gymId, orderId } = reversal;
    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, gymId },
        select: {
          status: true,
          memberId: true,
          locationId: true,
          items: { select: { productVariantId: true, qty: true } },
        },
      });
      const claimed = await tx.paymentReversal.updateMany({
        where: { id: reversal.id, status: PaymentReversalStatus.PENDING },
        data: { status: PaymentReversalStatus.SUCCEEDED, failureCode: null },
      });
      if (claimed.count === 0) {
        const current = await tx.paymentReversal.findUnique({
          where: { id: reversal.id },
          select: { refundId: true },
        });
        return { refundId: current?.refundId ?? '', memberId: order?.memberId ?? null };
      }

      const refund = await tx.refund.create({
        data: {
          gymId,
          orderId,
          paymentId: reversal.paymentId,
          locationId: order?.locationId ?? null,
          amount: reversal.amount,
          reason: reversal.reason,
          restockItems: reversal.restockItems,
          processedById: reversal.processedById,
        },
        select: { id: true },
      });
      await tx.paymentReversal.update({
        where: { id: reversal.id },
        data: { refundId: refund.id },
      });

      const payment = await tx.payment.findFirst({
        where: { id: reversal.paymentId, gymId },
        select: { amount: true, refundedAmount: true },
      });
      const fullyRefunded = payment !== null && payment.refundedAmount >= payment.amount;
      if (fullyRefunded) {
        await tx.payment.update({
          where: { id: reversal.paymentId },
          data: { status: PaymentStatus.REFUNDED },
        });
        if (order && order.status !== OrderStatus.REFUNDED) {
          await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.REFUNDED } });
          await tx.orderStatusEvent.create({
            data: { orderId, status: OrderStatus.REFUNDED, actor: reversal.actor },
          });
        }
      }
      if (reversal.restockItems && order) {
        await applyOrderStockMovements(tx, {
          gymId,
          orderId,
          reason: StockMovementReason.REFUND_RESTOCK,
          items: order.items,
        });
      }
      return { refundId: refund.id, memberId: order?.memberId ?? null };
    });
  }

  /** Give the claimed headroom back for a refused reversal — once. */
  private async release(reversal: PaymentReversal, code: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const failed = await tx.paymentReversal.updateMany({
        where: { id: reversal.id, status: PaymentReversalStatus.PENDING },
        data: { status: PaymentReversalStatus.FAILED, failureCode: code },
      });
      if (failed.count === 0) return;
      await tx.payment.updateMany({
        where: { id: reversal.paymentId, gymId: reversal.gymId },
        data: { refundedAmount: { decrement: reversal.amount } },
      });
    });
  }

  private async dispatchRefundIssued(gymId: string, orderId: string): Promise<void> {
    try {
      const invoice = await this.prisma.client.invoice.findFirst({
        where: { gymId, orderId },
        select: { id: true },
        orderBy: { issuedAt: 'desc' },
      });
      await this.automation.dispatchForGym(
        gymId,
        AutomationTriggerType.refund_issued,
        invoice
          ? { entityId: invoice.id, entityType: 'invoice' }
          : { entityId: orderId, entityType: 'order' },
      );
    } catch {
      // Automation never fails the refund it reacts to.
    }
  }
}

function exceedsPaid(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    message: 'Refund amount exceeds the order’s net paid amount',
    code: REFUND_EXCEEDS_PAID_CODE,
  });
}
