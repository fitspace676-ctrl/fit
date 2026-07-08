import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AutomationActionType,
  AutomationRunStatus,
  AutomationTriggerType,
  GymStatus,
  Prisma,
  SubscriptionStatus,
} from '@fit/db';
import { automationTriggerConfigSchema } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { env } from '../config/env';

/**
 * What caused a dispatch — the entity the run is logged against and any extra
 * context the (currently stubbed) action would personalise with. `entityId` /
 * `entityType` are snapshotted onto the {@link AutomationRun}; `dedupeSince`
 * lets the time-based scanner skip a rule/entity pair it already fired today.
 */
export interface AutomationDispatchContext {
  entityId?: string;
  entityType?: string;
  /**
   * When set, a matching run for the same `(ruleId, entityId)` at or after this
   * instant makes the dispatch a no-op — the idempotency guard the daily scanner
   * uses so a re-run (or a second replica) never double-logs the same window.
   */
  dedupeSince?: Date;
}

/** The active-rule slice the executor loads to fire a trigger. */
const RULE_SELECT = {
  id: true,
  triggerType: true,
  actionType: true,
  actionConfig: true,
} satisfies Prisma.AutomationRuleSelect;

type RuleRecord = Prisma.AutomationRuleGetPayload<{ select: typeof RULE_SELECT }>;

/** The outcome of one time-based scan pass, returned for logging and assertion. */
export interface AutomationScanSummary {
  /** ISO instant the scan ran for. */
  now: string;
  /** ACTIVE gyms enumerated. */
  gymsProcessed: number;
  /** Active `membership_expiring` rules considered across all gyms. */
  rulesMatched: number;
  /** Runs recorded this pass (one per newly-matched subscription/rule pair). */
  runsRecorded: number;
  /** Matches skipped because a run for the same window already existed. */
  runsSkipped: number;
}

/** Cron: the time-based scanner — daily 07:00 (server time), a morning sweep. */
const SCAN_CRON = '0 7 * * *';

/** How long the scanner's Redis lock is held — long enough to dedupe replicas
 *  firing the same minute, short enough to expire before the next daily window. */
const LOCK_TTL_SECONDS = 3_600;

/** Milliseconds in a day, for the scanner's look-ahead window arithmetic. */
const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Automation executor (T12.5).
 *
 * The engine behind the {@link AutomationRule}s the console configures — it fires
 * a rule's action and records an {@link AutomationRun}. It reaches rules two ways:
 *
 *   • **Event-driven** — {@link dispatchForGym} is called inline from a domain
 *     action (today `member_joined`, when a member is created) and fires every
 *     active rule on that trigger immediately. Callers `void` it so automation
 *     never blocks (or fails) the action that triggered it.
 *   • **Time-based** — a daily {@link runScan} cron finds active
 *     `membership_expiring` rules and records a run per subscription whose paid
 *     period ends within the rule's look-ahead window (`triggerConfig.days`).
 *
 * Action delivery is deliberately **stubbed** for this milestone: a matched rule
 * records a `SUCCESS` run describing the action it *would* send (email / SMS /
 * push / task). The real senders land alongside the Marketing (T12.7) and
 * Notifications work; the run log is the durable seam they slot into.
 *
 * Like the other crons ({@link OpsNotificationsService}, the billing sweep) the
 * scanner is deliberately **cross-tenant**: it reads every gym and its rules /
 * subscriptions through the unscoped {@link PrismaService} with an explicit
 * `gymId`, gated by a feature flag and a per-day Redis lock so a multi-replica
 * deploy scans exactly once.
 */
@Injectable()
export class AutomationExecutorService {
  private readonly logger = new Logger(AutomationExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Fire every active, non-template rule on `triggerType` for one gym, recording
   * a run each. Runs on the unscoped client with an explicit `gymId`, so it works
   * both inline in a request and from the tenant-less cron. Returns the number of
   * runs recorded. Never throws: a per-rule failure is logged and recorded as a
   * `FAILED` run so one broken rule can't sink the trigger (or its caller).
   */
  async dispatchForGym(
    gymId: string,
    triggerType: AutomationTriggerType,
    context: AutomationDispatchContext = {},
  ): Promise<number> {
    let rules: RuleRecord[];
    try {
      rules = await this.prisma.client.automationRule.findMany({
        where: { gymId, triggerType, active: true, isTemplate: false },
        select: RULE_SELECT,
      });
    } catch (error) {
      this.logger.warn(
        `Automation dispatch for ${triggerType} (gym ${gymId}) could not load rules: ${errMsg(error)}`,
      );
      return 0;
    }

    let recorded = 0;
    for (const rule of rules) {
      if (await this.fireRule(gymId, rule, context)) {
        recorded += 1;
      }
    }
    return recorded;
  }

  /**
   * Fire one specific rule, honouring the optional dedupe guard. The seam both
   * paths share: {@link dispatchForGym} loops it over every rule on a trigger,
   * the scanner calls it once per matched (rule, subscription). Returns whether a
   * run was recorded (false when the dedupe guard skipped it). Never throws.
   */
  async fireRule(
    gymId: string,
    rule: RuleRecord,
    context: AutomationDispatchContext = {},
  ): Promise<boolean> {
    if (
      context.dedupeSince &&
      (await this.alreadyRan(rule.id, context.entityId, context.dedupeSince))
    ) {
      return false;
    }
    return this.recordRun(gymId, rule, context);
  }

  /**
   * Record one rule's firing. Because action delivery is stubbed, this simply
   * writes a `SUCCESS` run summarising the action; a genuine send failure (once
   * the senders exist) would be caught here and stored as `FAILED`. Returns
   * whether a run row was written.
   */
  private async recordRun(
    gymId: string,
    rule: RuleRecord,
    context: AutomationDispatchContext,
  ): Promise<boolean> {
    try {
      await this.prisma.client.automationRun.create({
        data: {
          gymId,
          ruleId: rule.id,
          triggerType: rule.triggerType,
          status: AutomationRunStatus.SUCCESS,
          entityId: context.entityId ?? null,
          entityType: context.entityType ?? null,
          detail: stubActionDetail(rule.actionType),
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(`Automation run for rule ${rule.id} failed to record: ${errMsg(error)}`);
      // Best-effort: try to leave a FAILED breadcrumb, but never rethrow.
      try {
        await this.prisma.client.automationRun.create({
          data: {
            gymId,
            ruleId: rule.id,
            triggerType: rule.triggerType,
            status: AutomationRunStatus.FAILED,
            entityId: context.entityId ?? null,
            entityType: context.entityType ?? null,
            detail: `Dispatch failed: ${errMsg(error)}`.slice(0, 500),
          },
        });
      } catch {
        // Swallow — the original warning already recorded the problem.
      }
      return false;
    }
  }

  /** Whether a run for this `(ruleId, entityId)` already exists at/after `since`. */
  private async alreadyRan(
    ruleId: string,
    entityId: string | undefined,
    since: Date,
  ): Promise<boolean> {
    const existing = await this.prisma.client.automationRun.findFirst({
      where: { ruleId, entityId: entityId ?? null, ranAt: { gte: since } },
      select: { id: true },
    });
    return existing !== null;
  }

  // -------------------------------------------------------------------------
  // Time-based scanner
  // -------------------------------------------------------------------------

  /** Daily scanner cron entry point (07:00). Gated by the feature flag + a lock. */
  @Cron(SCAN_CRON, { name: 'automation-scan' })
  async runScan(): Promise<void> {
    if (!env.AUTOMATION_EXECUTOR_ENABLED) {
      this.logger.debug('Automation scanner disabled (feature flag unset) — skipping');
      return;
    }
    if (!(await this.acquireLock())) {
      this.logger.debug('Another instance holds the automation scan lock — skipping');
      return;
    }
    this.logger.log('Running automation time-based scan');
    try {
      const summary = await this.scanMembershipExpiring();
      this.logger.log(
        `Automation scan: ${summary.runsRecorded} recorded, ${summary.runsSkipped} skipped across ` +
          `${summary.rulesMatched} rules / ${summary.gymsProcessed} gyms`,
      );
    } catch (error) {
      this.logger.error(`Automation scan failed: ${errMsg(error)}`);
    }
  }

  /**
   * The `membership_expiring` sweep: for every ACTIVE gym, load its active rules
   * on that trigger and record a run for each ACTIVE subscription whose
   * `currentPeriodEnd` lands on the day `triggerConfig.days` from now. Idempotent
   * within a day via {@link AutomationDispatchContext.dedupeSince} keyed to the
   * gym-day, so a re-run or a second replica never double-logs. `now` is
   * injectable for deterministic tests.
   */
  async scanMembershipExpiring(options?: { now?: Date }): Promise<AutomationScanSummary> {
    const now = options?.now ?? new Date();
    const dedupeSince = startOfUtcDay(now);
    const summary: AutomationScanSummary = {
      now: now.toISOString(),
      gymsProcessed: 0,
      rulesMatched: 0,
      runsRecorded: 0,
      runsSkipped: 0,
    };

    const gyms = await this.prisma.client.gym.findMany({
      where: { status: GymStatus.ACTIVE },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const gym of gyms) {
      summary.gymsProcessed += 1;
      const rules = await this.prisma.client.automationRule.findMany({
        where: {
          gymId: gym.id,
          triggerType: AutomationTriggerType.membership_expiring,
          active: true,
          isTemplate: false,
        },
        select: { ...RULE_SELECT, triggerConfig: true },
      });

      for (const rule of rules) {
        const days = automationTriggerConfigSchema.safeParse(rule.triggerConfig ?? {}).data?.days;
        if (!days) {
          // A `membership_expiring` rule without a positive `days` can't define a
          // window (create/update validation prevents this; a legacy row is skipped).
          continue;
        }
        summary.rulesMatched += 1;

        const { gte, lt } = utcDayWindow(now, days);
        const subs = await this.prisma.client.subscription.findMany({
          where: {
            gymId: gym.id,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
            currentPeriodEnd: { gte, lt },
          },
          select: { id: true },
        });

        for (const sub of subs) {
          const recorded = await this.fireRule(gym.id, rule, {
            entityId: sub.id,
            entityType: 'subscription',
            dedupeSince,
          });
          if (recorded) {
            summary.runsRecorded += 1;
          } else {
            summary.runsSkipped += 1;
          }
        }
      }
    }

    return summary;
  }

  /**
   * Take the single-scanner lock for today's window via Redis `SET NX EX`, keyed
   * by the calendar day. Returns true when this instance won it. Fails **closed**
   * on any Redis error — a missed scan is preferable to every replica double-logging
   * runs when the lock backend is unavailable.
   */
  private async acquireLock(): Promise<boolean> {
    const key = `automation:scan:lock:${new Date().toISOString().slice(0, 10)}`;
    try {
      const result = await this.redis.client.set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire automation scan lock (Redis error) — skipping to avoid duplicates: ${errMsg(error)}`,
      );
      return false;
    }
  }
}

/** A short, human line describing the (stubbed) action a run performed. */
function stubActionDetail(actionType: AutomationActionType): string {
  switch (actionType) {
    case AutomationActionType.email:
      return 'Queued email (stubbed executor)';
    case AutomationActionType.sms:
      return 'Queued SMS (stubbed executor)';
    case AutomationActionType.push_notification:
      return 'Queued push notification (stubbed executor)';
    case AutomationActionType.create_task:
      return 'Queued task creation (stubbed executor)';
    default:
      return 'Queued action (stubbed executor)';
  }
}

/** Start of the UTC calendar day `instant` falls in. */
function startOfUtcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

/**
 * The `[gte, lt)` UTC day window that is `days` days ahead of `now` — the day a
 * subscription must expire on to be `days` days from expiring. A whole-day window
 * so the sweep is robust to the time of day the cron happens to fire.
 */
function utcDayWindow(now: Date, days: number): { gte: Date; lt: Date } {
  const gte = new Date(startOfUtcDay(now).getTime() + days * DAY_MS);
  const lt = new Date(gte.getTime() + DAY_MS);
  return { gte, lt };
}

/** A safe message from an unknown thrown value. */
function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
