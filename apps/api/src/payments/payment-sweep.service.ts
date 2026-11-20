import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrderStatus, PaymentAttemptStatus } from '@fit/db';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OnlinePaymentsService } from './online-payments.service';
import { ProviderRefundService } from './provider-refund.service';

/** Every five minutes, like the other housekeeping sweeps. */
const SWEEP_CRON = '*/5 * * * *';
/** Held for less than the cron interval so a crashed holder never blocks the next tick. */
const LOCK_TTL_SECONDS = 240;
/** Grace after an attempt's lifetime before the sweep asks Flitt about it. */
const EXPIRY_GRACE_MS = 2 * 60_000;
/** An open attempt is re-read at most this often by the sweep. */
const RECHECK_INTERVAL_MS = 5 * 60_000;
/**
 * An unpaid online order with no open attempt is abandoned (stock and promo
 * returned) once it is this old AND its last attempt started this long ago — long
 * enough for a member who saw a decline to retry.
 */
export const ABANDON_AFTER_MS = 60 * 60_000;
const BATCH = 100;

export interface PaymentSweepSummary {
  settled: number;
  abandoned: number;
  reversalsResolved: number;
}

/**
 * The safety net behind the callback and the browser return: settles attempts
 * past their lifetime (the case where Flitt's callback never reached us — local
 * development, an outage), abandons stale unpaid online orders, and re-sends
 * refunds whose reversal outcome was unknown. Locked per tick through Redis so
 * only one API instance sweeps (the `booking-reminder.service.ts` pattern).
 */
@Injectable()
export class PaymentSweepService {
  private readonly logger = new Logger(PaymentSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly payments: OnlinePaymentsService,
    private readonly refunds: ProviderRefundService,
  ) {}

  @Cron(SWEEP_CRON, { name: 'online-payment-sweep' })
  async runScheduled(): Promise<void> {
    if (!(await this.acquireLock())) return;
    try {
      const summary = await this.sweep();
      if (summary.settled + summary.abandoned + summary.reversalsResolved > 0) {
        this.logger.log(
          `Payment sweep: ${summary.settled} settled, ${summary.abandoned} abandoned, ` +
            `${summary.reversalsResolved} reversals resolved`,
        );
      }
    } catch (error) {
      this.logger.error(`Payment sweep failed (${error instanceof Error ? error.name : 'error'})`);
    }
  }

  /** One sweep pass; `now` is injectable for tests. */
  async sweep(now: Date = new Date()): Promise<PaymentSweepSummary> {
    const summary: PaymentSweepSummary = { settled: 0, abandoned: 0, reversalsResolved: 0 };

    const due = await this.prisma.client.paymentAttempt.findMany({
      where: {
        status: PaymentAttemptStatus.PENDING,
        expiresAt: { lt: new Date(now.getTime() - EXPIRY_GRACE_MS) },
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lt: new Date(now.getTime() - RECHECK_INTERVAL_MS) } },
        ],
      },
      orderBy: { expiresAt: 'asc' },
      take: BATCH,
      select: { id: true },
    });
    for (const attempt of due) {
      try {
        const outcome = await this.payments.settleAttempt(attempt.id);
        if (outcome.kind === 'captured' || outcome.kind === 'failed') summary.settled += 1;
        if (outcome.kind === 'unreachable' || outcome.kind === 'unverifiable') {
          await this.prisma.client.paymentAttempt.updateMany({
            where: { id: attempt.id, status: PaymentAttemptStatus.PENDING },
            data: { lastCheckedAt: now },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Sweep could not settle ${attempt.id} (${error instanceof Error ? error.name : 'error'})`,
        );
      }
    }

    const cutoff = new Date(now.getTime() - ABANDON_AFTER_MS);
    const stale = await this.prisma.client.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lt: cutoff },
        payment: { is: { provider: 'flitt' } },
        // Never an order with an open attempt, a recent one, or one parked for
        // staff (NEEDS_REVIEW — money may have moved; `abandonOrder` refuses it too).
        paymentAttempts: {
          none: {
            OR: [
              { status: PaymentAttemptStatus.PENDING },
              { status: PaymentAttemptStatus.NEEDS_REVIEW },
              { createdAt: { gte: cutoff } },
            ],
          },
        },
      },
      take: BATCH,
      select: { id: true, gymId: true },
    });
    for (const order of stale) {
      try {
        if (await this.payments.abandonOrder(order.gymId, order.id)) summary.abandoned += 1;
      } catch (error) {
        this.logger.warn(
          `Sweep could not abandon ${order.id} (${error instanceof Error ? error.name : 'error'})`,
        );
      }
    }

    summary.reversalsResolved = await this.refunds.retryPending();
    return summary;
  }

  private async acquireLock(): Promise<boolean> {
    const key = `online-payment-sweep:lock:${new Date().toISOString().slice(0, 16)}`;
    try {
      return (await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX')) === 'OK';
    } catch {
      this.logger.warn('Could not acquire the payment sweep lock (Redis error) — skipping');
      return false;
    }
  }
}
