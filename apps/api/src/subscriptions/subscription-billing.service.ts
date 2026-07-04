import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, SubscriptionStatus, applyEvent, classifyDueSubscription } from '@fit/db';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';

/** The subscription columns the billing sweep reads to charge and advance a period. */
const BILLABLE_SUBSCRIPTION_SELECT = {
  id: true,
  gymId: true,
  memberId: true,
  status: true,
  priceAmount: true,
  currency: true,
  interval: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  providerRef: true,
} satisfies Prisma.SubscriptionSelect;

type BillableRow = Prisma.SubscriptionGetPayload<{ select: typeof BILLABLE_SUBSCRIPTION_SELECT }>;

/**
 * The outcome of one billing pass, returned by {@link SubscriptionBillingService.runBillingCycle}
 * for logging and assertion. Every due subscription lands in exactly one bucket
 * (`renewed` / `pastDue` / `expired` / `canceled`), except an `error` — an
 * infrastructure fault (provider unreachable, DB write failed) that left the
 * subscription untouched for the next pass to retry.
 */
export interface BillingCycleSummary {
  /** The instant the cycle evaluated against (ISO-8601). */
  now: string;
  /** How many subscriptions were due (`currentPeriodEnd <= now`, live status) this pass. */
  subscriptionsDue: number;
  /** Renewals charged and advanced to the next period. */
  renewed: number;
  /** Renewals whose charge failed — freshly flagged, or still in grace after a failed retry. */
  pastDue: number;
  /** Past-due subscriptions whose grace window elapsed and were expired. */
  expired: number;
  /** Subscriptions whose scheduled `cancelAtPeriodEnd` cancellation took effect. */
  canceled: number;
  /** Subscriptions left untouched by an infrastructure fault, to retry next pass. */
  errors: number;
}

/** Cron: daily at 02:00 (server time) — a quiet hour, well clear of the report digests. */
const RENEWAL_CRON = '0 2 * * *';

/** How long the per-day Redis lock is held — long enough to dedupe replicas firing
 *  at the same minute, short enough to expire well before the next daily window. */
const LOCK_TTL_SECONDS = 3_600;

/**
 * Recurring subscription billing (T5.4).
 *
 * The scheduled job that renews every gym's live memberships: it sweeps
 * subscriptions whose paid period has elapsed, charges the renewal through the
 * {@link PaymentProvider} abstraction, and moves each subscription to its next state
 * — advancing the period on a successful charge (`RENEW`), flagging `PAST_DUE` on a
 * failed one (`PAYMENT_FAILED`), expiring a lapsed grace window (`EXPIRE`), or
 * honouring a scheduled cancellation (`CANCEL`). The *what-happens-to-each*
 * decision is the pure {@link classifyDueSubscription} rule and every status change
 * goes through the shared state machine's {@link applyEvent}, so this service is a
 * thin orchestrator with no billing policy of its own.
 *
 * Like the report digests (T4.10) it is **cross-tenant** — it reads and writes every
 * gym's subscriptions through the unscoped {@link PrismaService} (the sweep has no
 * request tenant context) — and is gated two ways so it is safe in every
 * environment:
 *   • `SUBSCRIPTION_BILLING_ENABLED` must be true (off in dev / CI / preview by
 *     default), so the job never charges unexpectedly.
 *   • a Redis `SET NX` lock per day means a multi-instance deployment runs the
 *     sweep once even though every replica fires the cron.
 *
 * **Idempotency** is guaranteed independently of the lock, at the database: every
 * transition is a conditional `updateMany` matched on the subscription's *observed*
 * `(currentPeriodEnd, status)`, so once a period is advanced (or a status flipped)
 * the same row can never be advanced twice — a re-run, an overlapping replica, or a
 * retry all no-op. The charge itself carries a per-period idempotency key
 * (`<subscriptionId>:<periodEndISO>`) so a real gateway dedupes upstream too.
 */
@Injectable()
export class SubscriptionBillingService {
  private readonly logger = new Logger(SubscriptionBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Daily cron entry point (02:00). */
  @Cron(RENEWAL_CRON, { name: 'subscription-renewal' })
  async runScheduled(): Promise<void> {
    if (!env.SUBSCRIPTION_BILLING_ENABLED) {
      this.logger.debug(
        'Subscription billing disabled (SUBSCRIPTION_BILLING_ENABLED unset) — skipping',
      );
      return;
    }
    if (!(await this.acquireLock())) {
      this.logger.debug('Another instance holds the billing lock — skipping');
      return;
    }

    this.logger.log('Running subscription billing cycle');
    try {
      const summary = await this.runBillingCycle();
      this.logger.log(
        `Subscription billing: ${summary.renewed} renewed, ${summary.pastDue} past-due, ` +
          `${summary.expired} expired, ${summary.canceled} canceled, ${summary.errors} errors ` +
          `across ${summary.subscriptionsDue} due`,
      );
    } catch (error) {
      this.logger.error(
        `Subscription billing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Charge and advance every due subscription across all gyms. Each subscription is
   * processed independently: a failure on one (a charge that throws, a write that
   * errors) is tallied as an `error` and never aborts the rest of the sweep. Kept
   * separate from {@link runScheduled} so the sweep itself stays a plain,
   * unit-testable method with no scheduling side effects; `now` is injectable for
   * deterministic tests.
   */
  async runBillingCycle(options?: { now?: Date }): Promise<BillingCycleSummary> {
    const now = options?.now ?? new Date();
    const graceDays = env.SUBSCRIPTION_BILLING_GRACE_DAYS;

    const due = await this.prisma.client.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        currentPeriodEnd: { lte: now },
      },
      select: BILLABLE_SUBSCRIPTION_SELECT,
      orderBy: { currentPeriodEnd: 'asc' },
    });

    const summary: BillingCycleSummary = {
      now: now.toISOString(),
      subscriptionsDue: due.length,
      renewed: 0,
      pastDue: 0,
      expired: 0,
      canceled: 0,
      errors: 0,
    };

    for (const sub of due) {
      try {
        await this.processOne(sub, now, graceDays, summary);
      } catch (error) {
        summary.errors += 1;
        this.logger.warn(
          `Failed to bill subscription ${sub.id} (gym ${sub.gymId}): ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return summary;
  }

  /** Route one due subscription to its action and apply the resulting transition. */
  private async processOne(
    sub: BillableRow,
    now: Date,
    graceDays: number,
    summary: BillingCycleSummary,
  ): Promise<void> {
    const decision = classifyDueSubscription(sub, { now, graceDays });
    switch (decision.action) {
      case 'skip':
        return;
      case 'cancel':
        if (await this.cancel(sub, now)) summary.canceled += 1;
        return;
      case 'expire':
        if (await this.expire(sub)) summary.expired += 1;
        return;
      case 'charge':
        await this.charge(sub, decision.nextPeriodStart, decision.nextPeriodEnd, summary);
        return;
    }
  }

  /**
   * Attempt the renewal charge and act on the result. A returned `failed` moves the
   * subscription toward `PAST_DUE`; a *thrown* error is an infrastructure fault
   * (provider unreachable) that we let propagate to the sweep's per-subscription
   * catch, leaving the row untouched to retry next pass rather than penalising the
   * member for our outage.
   */
  private async charge(
    sub: BillableRow,
    nextPeriodStart: Date,
    nextPeriodEnd: Date,
    summary: BillingCycleSummary,
  ): Promise<void> {
    const idempotencyKey = `${sub.id}:${sub.currentPeriodEnd.toISOString()}`;
    const result = await this.provider.chargeRenewal({
      subscriptionId: sub.id,
      gymId: sub.gymId,
      memberId: sub.memberId,
      amount: sub.priceAmount,
      currency: sub.currency,
      idempotencyKey,
      providerRef: sub.providerRef,
    });

    if (result.outcome === 'succeeded') {
      if (await this.advancePeriod(sub, nextPeriodStart, nextPeriodEnd, result.providerRef)) {
        summary.renewed += 1;
      }
      return;
    }

    this.logger.warn(`Renewal charge failed for subscription ${sub.id}: ${result.reason}`);
    if (await this.markPastDue(sub)) summary.pastDue += 1;
  }

  /**
   * Persist a successful renewal: `RENEW` the status (`PAST_DUE → ACTIVE`, or an
   * `ACTIVE` self-loop), roll the period forward contiguously, reset the per-period
   * freeze allowance, and record which provider settled it. The conditional
   * `updateMany` on the observed `(currentPeriodEnd, status)` is the idempotency
   * backstop — a second runner that already advanced this period matches nothing.
   * Returns whether this call was the one that advanced it.
   */
  private async advancePeriod(
    sub: BillableRow,
    nextPeriodStart: Date,
    nextPeriodEnd: Date,
    providerRef: string | null | undefined,
  ): Promise<boolean> {
    const nextStatus = applyEvent(sub.status, 'RENEW');
    const data: Prisma.SubscriptionUpdateManyMutationInput = {
      status: nextStatus,
      currentPeriodStart: nextPeriodStart,
      currentPeriodEnd: nextPeriodEnd,
      freezeDaysUsed: 0,
      provider: this.provider.key,
    };
    // Only overwrite the external ref when the provider returned one, so the stub
    // (which returns none) never clobbers a real ref set by a prior provider.
    if (providerRef !== undefined) {
      data.providerRef = providerRef;
    }

    const { count } = await this.prisma.client.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
      data,
    });
    return count > 0;
  }

  /**
   * Flag a failed renewal `PAST_DUE`. A charge that fails while already `PAST_DUE`
   * (a failed retry inside the grace window) is a state-machine self-loop — nothing
   * to write, the row stays where it is — so this only issues the conditional
   * `ACTIVE → PAST_DUE` transition. Returns whether the subscription is past-due
   * after this pass (true for both the fresh flag and the continuing case).
   */
  private async markPastDue(sub: BillableRow): Promise<boolean> {
    if (sub.status === SubscriptionStatus.PAST_DUE) {
      return true;
    }
    const nextStatus = applyEvent(sub.status, 'PAYMENT_FAILED');
    const { count } = await this.prisma.client.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
      data: { status: nextStatus },
    });
    return count > 0;
  }

  /** Expire a past-due subscription whose grace window elapsed (`PAST_DUE → EXPIRED`). */
  private async expire(sub: BillableRow): Promise<boolean> {
    const nextStatus = applyEvent(sub.status, 'EXPIRE');
    const { count } = await this.prisma.client.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
      data: { status: nextStatus },
    });
    return count > 0;
  }

  /** Action a scheduled `cancelAtPeriodEnd` cancellation at period end (`→ CANCELED`). */
  private async cancel(sub: BillableRow, now: Date): Promise<boolean> {
    const nextStatus = applyEvent(sub.status, 'CANCEL');
    const { count } = await this.prisma.client.subscription.updateMany({
      where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
      data: { status: nextStatus, canceledAt: now },
    });
    return count > 0;
  }

  /**
   * Take the single-runner lock for today's window via Redis `SET NX EX`, keyed by
   * the calendar day so it naturally scopes to one daily run. Returns true when this
   * instance won it. Fails **closed** on any Redis error (returns false): skipping a
   * pass — the next day's run catches every still-due subscription, since due-ness
   * is a database fact, not a lock artefact — is preferable to two replicas racing
   * the same charges.
   */
  private async acquireLock(): Promise<boolean> {
    const key = `subscription-billing:lock:${new Date().toISOString().slice(0, 10)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire billing lock (Redis error) — skipping to avoid duplicate charges: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}
