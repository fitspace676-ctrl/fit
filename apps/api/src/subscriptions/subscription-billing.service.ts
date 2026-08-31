import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import {
  InvoiceType,
  Prisma,
  SubscriptionStatus,
  applyEvent,
  classifyDueSubscription,
  subscriptionInvoiceDescription,
} from '@fit/db';
import { InvoiceService } from '../billing/invoice.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';
import {
  BillingNotificationsService,
  type BillingSubscriptionRef,
} from './billing-notifications.service';
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
  paymentRetries: true,
  providerRef: true,
  // The plan name (snapshot-free, read live) only feeds the renewal invoice's
  // human-readable description; a plan-less / deleted-plan subscription renews fine
  // with the generic fallback.
  plan: { select: { name: true } },
  // The member's user id — the billing notifications (T8.7) are addressed to the
  // person, not the gym-scoped membership, so the send has an explicit recipient.
  member: { select: { userId: true } },
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
  /** Renewals whose charge failed — freshly flagged, or a failed retry that advanced the ladder. */
  pastDue: number;
  /** Past-due subscriptions whose retry ladder was exhausted and were expired. */
  expired: number;
  /** Subscriptions whose scheduled `cancelAtPeriodEnd` cancellation took effect. */
  canceled: number;
  /** Subscriptions left untouched by an infrastructure fault, to retry next pass. */
  errors: number;
  /** Free trials converting within the lead window that were warned this pass (T8.7). */
  trialEndingWarned: number;
}

/** Cron: daily at 02:00 (server time) — a quiet hour, well clear of the report digests. */
const RENEWAL_CRON = '0 2 * * *';

/** How long the per-day Redis lock is held — long enough to dedupe replicas firing
 *  at the same minute, short enough to expire well before the next daily window. */
const LOCK_TTL_SECONDS = 3_600;

/**
 * Recurring subscription billing + dunning (T5.4 / T5.5).
 *
 * The scheduled job that renews every gym's live memberships: it sweeps
 * subscriptions whose paid period has elapsed, charges the renewal through the
 * {@link PaymentProvider} abstraction, and moves each subscription to its next state
 * — advancing the period on a successful charge (`RENEW`), flagging `PAST_DUE` on a
 * failed one (`PAYMENT_FAILED`), and honouring a scheduled cancellation (`CANCEL`).
 * The same sweep converts a free trial (T5.6): a `TRIAL` subscription falls due at
 * trial end, and its first charge auto-converts it to `ACTIVE` via `RENEW` (or
 * `PAST_DUE` on failure) — a member who cancelled during the trial is `CANCEL`ed at
 * trial end instead, charged nothing.
 * A past-due subscription is then worked through the **dunning retry ladder** (T5.5):
 * the renewal charge is re-attempted on the ladder's rungs (+2/+5/+7 days after the
 * elapsed period end by default), `paymentRetries` advancing one rung per failed
 * retry, until either a retry succeeds (back to `ACTIVE`) or the ladder is exhausted
 * and the subscription expires (`EXPIRE`). The *what-happens-to-each* decision is the
 * pure {@link classifyDueSubscription} rule and every status change goes through the
 * shared state machine's {@link applyEvent}, so this service is a thin orchestrator
 * with no billing policy of its own.
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
 * `(currentPeriodEnd, status)` — and, for a dunning-ladder step, the observed
 * `paymentRetries` too — so once a period is advanced (or a status/rung moved) the
 * same row can never be advanced twice: a re-run, an overlapping replica, or a retry
 * all no-op. The charge itself carries a per-period idempotency key
 * (`<subscriptionId>:<periodEndISO>`) so a real gateway dedupes upstream too.
 */
@Injectable()
export class SubscriptionBillingService {
  private readonly logger = new Logger(SubscriptionBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly invoices: InvoiceService,
    private readonly notifications: BillingNotificationsService,
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
          `across ${summary.subscriptionsDue} due; ${summary.trialEndingWarned} trial-ending warned`,
      );
      // Per-subscription infrastructure faults are tallied, not thrown, so the
      // sweep completes — but a non-zero count still means charges didn't go
      // through. Surface it to Sentry so the "job errors" alert can fire without
      // the whole job having to crash.
      if (summary.errors > 0) {
        Sentry.captureMessage(
          `Subscription billing completed with ${summary.errors}/${summary.subscriptionsDue} errored subscriptions`,
          'warning',
        );
      }
    } catch (error) {
      // A total job failure (lock/DB unreachable, unexpected throw) is invisible
      // to the HTTP exception filter — this is the only place it can reach
      // Sentry, and the signal the job-failure alert keys off.
      Sentry.captureException(error, { tags: { job: 'subscription-renewal' } });
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
    const retryOffsetDays = env.SUBSCRIPTION_BILLING_RETRY_OFFSET_DAYS;

    const due = await this.prisma.client.subscription.findMany({
      where: {
        status: {
          in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
        },
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
      trialEndingWarned: 0,
    };

    for (const sub of due) {
      try {
        await this.processOne(sub, now, retryOffsetDays, summary);
      } catch (error) {
        summary.errors += 1;
        this.logger.warn(
          `Failed to bill subscription ${sub.id} (gym ${sub.gymId}): ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Heads-up for trials converting soon (T8.7): a separate, non-charging sweep over
    // trials ending within the lead window. Kept off the per-subscription billing path
    // above — it is pure notification, warns *before* the trial falls due, and its own
    // dedupe key makes it safe to re-run — so a failure here never affects a charge. Its
    // own errors are swallowed too, so a trial-query fault can't discard the (already
    // committed) billing summary this pass earned.
    try {
      const trial = await this.notifications.notifyTrialsEndingSoon(
        now,
        env.SUBSCRIPTION_TRIAL_ENDING_LEAD_DAYS,
      );
      summary.trialEndingWarned = trial.notified;
    } catch (error) {
      this.logger.warn(
        `Trial-ending sweep failed (billing charges unaffected): ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return summary;
  }

  /** Route one due subscription to its action and apply the resulting transition. */
  private async processOne(
    sub: BillableRow,
    now: Date,
    retryOffsetDays: readonly number[],
    summary: BillingCycleSummary,
  ): Promise<void> {
    const decision = classifyDueSubscription(sub, { now, retryOffsetDays });
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
   *
   * The idempotency key is scoped to *this rung* — period end plus `paymentRetries`
   * — so a re-run of the same retry dedupes upstream, but each new ladder rung is a
   * genuinely fresh charge attempt (a single per-period key would make a real gateway
   * replay the first failure and never actually retry).
   */
  private async charge(
    sub: BillableRow,
    nextPeriodStart: Date,
    nextPeriodEnd: Date,
    summary: BillingCycleSummary,
  ): Promise<void> {
    const idempotencyKey = `${sub.id}:${sub.currentPeriodEnd.toISOString()}:r${sub.paymentRetries}`;
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
        // Announce the settled renewal (or, from a TRIAL, the conversion) only when
        // this runner won the advance, so a re-run / racing replica does not re-notify.
        await this.notifications.renewalSucceeded(toNotificationRef(sub), {
          nextPeriodEnd,
          wasTrial: sub.status === SubscriptionStatus.TRIAL,
        });
      }
      return;
    }

    this.logger.warn(`Renewal charge failed for subscription ${sub.id}: ${result.reason}`);
    if (await this.recordFailedCharge(sub)) {
      summary.pastDue += 1;
      // Warn the member their payment failed, keyed to the observed ladder rung so
      // each distinct retry warns once. `paymentRetries` is the rung that just failed.
      await this.notifications.chargeFailed(toNotificationRef(sub), {
        rung: sub.paymentRetries,
        periodEnd: sub.currentPeriodEnd,
      });
    }
  }

  /**
   * Persist a successful renewal: `RENEW` the status (`PAST_DUE → ACTIVE`, or an
   * `ACTIVE` self-loop), roll the period forward contiguously, reset the per-period
   * freeze allowance, clear the dunning retry ladder (a paid renewal ends the
   * past-due episode), record which provider settled it, and mint the numbered
   * {@link Invoice} for the renewed period. The conditional `updateMany` on the
   * observed `(currentPeriodEnd, status)` is the idempotency backstop — a second
   * runner that already advanced this period matches nothing — and the invoice is
   * raised **inside the same transaction, only when that update won the race**, so a
   * re-run or overlapping replica can neither double-advance the period nor
   * double-invoice it. Returns whether this call was the one that advanced it.
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
      paymentRetries: 0,
      provider: this.provider.key,
    };
    // Only overwrite the external ref when the provider returned one, so the stub
    // (which returns none) never clobbers a real ref set by a prior provider.
    if (providerRef !== undefined) {
      data.providerRef = providerRef;
    }

    return this.prisma.client.$transaction(async (tx) => {
      const { count } = await tx.subscription.updateMany({
        where: { id: sub.id, currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
        data,
      });
      if (count === 0) {
        // Another runner already advanced this period — leave its invoice alone.
        return false;
      }
      await this.invoices.issue(tx, {
        gymId: sub.gymId,
        memberId: sub.memberId,
        subscriptionId: sub.id,
        amount: sub.priceAmount,
        currency: sub.currency,
        // A recurring membership charge, whatever the plan is called.
        type: InvoiceType.MEMBERSHIP,
        description: subscriptionInvoiceDescription(
          sub.plan?.name ?? null,
          sub.interval,
          'renewal',
        ),
        // Bill for the period that just opened, so the invoice date tracks the renewal.
        issuedAt: nextPeriodStart,
      });
      return true;
    });
  }

  /**
   * Persist a failed renewal charge, advancing the dunning ladder:
   *
   *   • A fresh failure on an `ACTIVE` subscription flips it `ACTIVE → PAST_DUE`
   *     (retry ladder starting at 0) via the state machine's `PAYMENT_FAILED`.
   *   • A failed *retry* on an already-`PAST_DUE` subscription is a status self-loop,
   *     but it must still advance `paymentRetries` so the next retry moves to the
   *     next rung and the ladder eventually expires. The rung is **claimed**
   *     (`docs/adr/atomic-counters.md`): the `WHERE` pins the observed
   *     `paymentRetries` and the database does the `+1`, so a re-run or overlapping
   *     replica can never double-count a rung — the second writer's predicate no
   *     longer matches and it reports `count === 0` (the idempotency backstop,
   *     matching how {@link advancePeriod} guards the period).
   *
   * Returns whether this subscription is (still) past-due after the write — true for
   * the fresh flag and for a retry that advanced the ladder, false when the
   * conditional update matched nothing (another runner got there first).
   */
  private async recordFailedCharge(sub: BillableRow): Promise<boolean> {
    if (sub.status === SubscriptionStatus.PAST_DUE) {
      const { count } = await this.prisma.client.subscription.updateMany({
        where: {
          id: sub.id,
          currentPeriodEnd: sub.currentPeriodEnd,
          status: SubscriptionStatus.PAST_DUE,
          paymentRetries: sub.paymentRetries,
        },
        data: { paymentRetries: { increment: 1 } },
      });
      return count > 0;
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

/**
 * Project a billable row to the reference the billing notifications need — the
 * member's user id and the amount charged — decoupling {@link BillingNotificationsService}
 * from the sweep's internal row shape.
 */
function toNotificationRef(sub: BillableRow): BillingSubscriptionRef {
  return {
    id: sub.id,
    gymId: sub.gymId,
    userId: sub.member.userId,
    priceAmount: sub.priceAmount,
    currency: sub.currency,
  };
}
