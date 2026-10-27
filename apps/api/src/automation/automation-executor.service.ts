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
import {
  automationActionConfigSchema,
  interpolateMergeFields,
  automationConditionsSchema,
  evaluateAutomationConditions,
  parseTimingOffset,
  timingOffsetDays,
  AUTOMATION_TRIGGER_CATALOG,
  type AutomationEntityType,
} from '@fit/types';
import { automationTriggerConfigSchema } from '@fit/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailerService } from '../mail/mailer.service';
import { renderBrandedEmail, escapeHtml, renderEmailParagraphs } from '../mail/branded-email';
import { resolveEmailLocale } from '../mail/email-locale';
import { emailStrings } from '../mail/email-strings';
import { AutomationMergeService } from './automation-merge.service';
import { AutomationFactsService } from './automation-facts.service';
import { env } from '../config/env';

/**
 * What caused a dispatch — the entity the run is logged against and any extra
 * context the (currently stubbed) action would personalise with. `entityId` /
 * `entityType` are snapshotted onto the {@link AutomationRun}; `dedupeSince`
 * lets the time-based scanner skip a rule/entity pair it already fired today.
 */
export interface AutomationDispatchContext {
  entityId?: string;
  entityType?: AutomationEntityType;
  /** Scans already apply offsets to their date window; due runs must not queue again. */
  immediate?: boolean;
  /** Injectable event instant for scheduling and condition facts. */
  now?: Date;
  /** Scanner accounting without changing the public boolean result. */
  onConditionsSkipped?: () => void;
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
  name: true,
  conditions: true,
  timingOffset: true,
  triggerConfig: true,
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
  conditionsSkipped: number;
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
    private readonly merge: AutomationMergeService,
    private readonly mailer: MailerService,
    private readonly facts: AutomationFactsService,
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
    try {
      if (
        context.dedupeSince &&
        (await this.alreadyRan(gymId, rule.id, context.entityId, context.dedupeSince))
      )
        return false;
      if (!(await this.conditionsMet(gymId, rule, context))) {
        this.logger.debug(`Automation rule ${rule.id}: conditions not met`);
        context.onConditionsSkipped?.();
        return false;
      }
      const now = context.now ?? new Date();
      const offset = parseTimingOffset(rule.timingOffset).ms;
      const trigger = AUTOMATION_TRIGGER_CATALOG.find((entry) => entry.value === rule.triggerType);
      if (offset > 0 && context.immediate !== true && trigger?.kind !== 'scan') {
        const scheduledFor = new Date(now.getTime() + offset);
        await this.prisma.client.automationRun.create({
          data: {
            gymId,
            ruleId: rule.id,
            triggerType: rule.triggerType,
            status: 'QUEUED',
            entityId: context.entityId ?? null,
            entityType: context.entityType ?? null,
            scheduledFor,
            ranAt: now,
            detail: `Scheduled for ${scheduledFor.toISOString()}`,
          },
        });
        return true;
      }
      return await this.recordRun(gymId, rule, context);
    } catch (error) {
      this.logger.warn(`Automation rule ${rule.id} failed: ${errMsg(error)}`);
      return false;
    }
  }

  private async conditionsMet(
    gymId: string,
    rule: RuleRecord,
    context: AutomationDispatchContext,
  ): Promise<boolean> {
    const parsed = automationConditionsSchema.safeParse(rule.conditions);
    if (!parsed.success) return false;
    if (parsed.data.length === 0) return true;
    const memberId = await this.merge.resolveMemberId(gymId, context);
    if (!memberId) return false;
    const facts = await this.facts.loadConditionFacts(gymId, memberId, context.now);
    return facts !== null && evaluateAutomationConditions(parsed.data, facts);
  }

  /** Only scheduled rows are eligible; historical QUEUED logs with no due date stay untouched. */
  @Cron('*/10 * * * *', { name: 'automation-due-queued' })
  async runDueQueued(now = new Date()): Promise<void> {
    if (!env.AUTOMATION_EXECUTOR_ENABLED) return;
    if (!(await this.acquireLock('automation:queued:lock', 600))) return;
    try {
      const runs = await this.prisma.client.automationRun.findMany({
        where: { status: 'QUEUED', scheduledFor: { lte: now } },
        orderBy: [{ scheduledFor: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      for (const run of runs) {
        try {
          const rule = await this.prisma.client.automationRule.findFirst({
            where: { id: run.ruleId, gymId: run.gymId, active: true, isTemplate: false },
            select: RULE_SELECT,
          });
          const context: AutomationDispatchContext = {
            entityId: run.entityId ?? undefined,
            entityType: run.entityType as AutomationEntityType | undefined,
            immediate: true,
            now,
          };
          const outcome = !rule
            ? { status: AutomationRunStatus.SKIPPED, detail: 'Rule inactive' }
            : !(await this.conditionsMet(run.gymId, rule, context))
              ? { status: AutomationRunStatus.SKIPPED, detail: 'Conditions no longer met' }
              : await this.performAction(run.gymId, rule, context);
          await this.prisma.client.automationRun.updateMany({
            where: { id: run.id, gymId: run.gymId, status: 'QUEUED' },
            data: { status: outcome.status, detail: outcome.detail.slice(0, 500), ranAt: now },
          });
        } catch (error) {
          this.logger.warn(`Queued automation ${run.id} failed: ${errMsg(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Queued automation sweep failed: ${errMsg(error)}`);
    }
  }

  /**
   * Perform one rule's action and record the run. The `email` action is really
   * delivered; the other three have no provider yet and are logged as such.
   * Returns whether a run row was written.
   *
   * Delivery happens before the row is written so its outcome can be recorded
   * truthfully — a run that says `SUCCESS` now means a message left the building
   * (or that we said plainly why it didn't).
   */
  private async recordRun(
    gymId: string,
    rule: RuleRecord,
    context: AutomationDispatchContext,
  ): Promise<boolean> {
    const outcome = await this.performAction(gymId, rule, context);

    try {
      await this.prisma.client.automationRun.create({
        data: {
          gymId,
          ruleId: rule.id,
          triggerType: rule.triggerType,
          status: outcome.status,
          entityId: context.entityId ?? null,
          entityType: context.entityType ?? null,
          detail: outcome.detail.slice(0, 500),
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

  /**
   * Carry out a rule's action, returning what the run row should say about it.
   *
   * Never throws. `member_joined` dispatches this fire-and-forget from member
   * creation, so a mail outage must become a `FAILED` row, not an exception
   * escaping into a request that was only trying to add someone to the roster.
   */
  private async performAction(
    gymId: string,
    rule: RuleRecord,
    context: AutomationDispatchContext,
  ): Promise<{ status: AutomationRunStatus; detail: string }> {
    try {
      const action = automationActionConfigSchema.safeParse(rule.actionConfig);
      if (!action.success) {
        return {
          status: AutomationRunStatus.FAILED,
          detail: 'Action not sent — this rule has no usable message',
        };
      }

      const brand = await this.merge.brand(gymId);
      const target = await this.merge.resolve(gymId, context, brand);
      const subject = interpolateMergeFields(action.data.subject ?? '', target?.values ?? {});
      const body = interpolateMergeFields(action.data.body, target?.values ?? {});
      if (rule.actionType !== AutomationActionType.email) {
        return {
          status: AutomationRunStatus.SUCCESS,
          detail: `${undeliveredActionDetail(rule.actionType)}; message: ${body.slice(0, 300)}`,
        };
      }
      if (!target?.recipient) {
        return {
          status: AutomationRunStatus.SUCCESS,
          detail: 'No recipient for this trigger — nothing sent',
        };
      }

      // The same expansion the one-off staff email uses: a known token with no
      // value is blanked, so a raw `{{…}}` can never reach a member.

      const locale = resolveEmailLocale(brand.language);
      const html = renderBrandedEmail({
        locale,
        senderName: escapeHtml(brand.name),
        heading: escapeHtml(subject),
        contentHtml: renderEmailParagraphs(body),
        footerNote: escapeHtml(emailStrings(locale).shell.sentBy(brand.name)),
      });

      const { sent } = await this.mailer.send({
        to: target.recipient,
        subject,
        html,
        text: body,
      });

      // An unconfigured transport is a skip, not a failure — a dev machine with no
      // RESEND_API_KEY should read honestly rather than fill the log with FAILED.
      return sent
        ? { status: AutomationRunStatus.SUCCESS, detail: `Emailed ${target.recipient}` }
        : {
            status: AutomationRunStatus.SUCCESS,
            detail: 'Email not sent — mail transport is not configured',
          };
    } catch (error) {
      this.logger.warn(`Automation email for rule ${rule.id} failed: ${errMsg(error)}`);
      return { status: AutomationRunStatus.FAILED, detail: `Email failed: ${errMsg(error)}` };
    }
  }

  /** Whether a run for this `(ruleId, entityId)` already exists at/after `since`. */
  private async alreadyRan(
    gymId: string,
    ruleId: string,
    entityId: string | undefined,
    since: Date,
  ): Promise<boolean> {
    const existing = await this.prisma.client.automationRun.findFirst({
      where: { gymId, ruleId, entityId: entityId ?? null, ranAt: { gte: since } },
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
      const summaries = await Promise.all([
        this.scanMembershipExpiring(),
        this.scanBirthdays(),
        this.scanNoCheckin(),
        this.scanMembershipExpired(),
        this.scanInvoiceOverdue(),
      ]);
      const summary = summaries.reduce(
        (total, item) => ({
          ...total,
          rulesMatched: total.rulesMatched + item.rulesMatched,
          runsRecorded: total.runsRecorded + item.runsRecorded,
          runsSkipped: total.runsSkipped + item.runsSkipped,
          conditionsSkipped: total.conditionsSkipped + item.conditionsSkipped,
        }),
        {
          ...summaries[0],
          rulesMatched: 0,
          runsRecorded: 0,
          runsSkipped: 0,
          conditionsSkipped: 0,
        },
      );
      this.logger.log(
        `Automation scan: ${summary.runsRecorded} recorded, ${summary.runsSkipped} skipped across ` +
          `${summary.rulesMatched} rules / ${summary.gymsProcessed} gyms; ${summary.conditionsSkipped} conditions skipped`,
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
    return this.scanTrigger('membership_expiring', options?.now ?? new Date());
  }

  async scanBirthdays(options?: { now?: Date }): Promise<AutomationScanSummary> {
    return this.scanTrigger('birthday', options?.now ?? new Date());
  }
  async scanNoCheckin(options?: { now?: Date }): Promise<AutomationScanSummary> {
    return this.scanTrigger('no_checkin', options?.now ?? new Date());
  }
  async scanMembershipExpired(options?: { now?: Date }): Promise<AutomationScanSummary> {
    return this.scanTrigger('membership_expired', options?.now ?? new Date());
  }
  async scanInvoiceOverdue(options?: { now?: Date }): Promise<AutomationScanSummary> {
    return this.scanTrigger('invoice_overdue', options?.now ?? new Date());
  }

  private async scanTrigger(
    triggerType: AutomationTriggerType,
    now: Date,
  ): Promise<AutomationScanSummary> {
    const summary: AutomationScanSummary = {
      now: now.toISOString(),
      gymsProcessed: 0,
      rulesMatched: 0,
      runsRecorded: 0,
      runsSkipped: 0,
      conditionsSkipped: 0,
    };
    const gyms = await this.prisma.client.gym.findMany({
      where: { status: GymStatus.ACTIVE },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const gym of gyms) {
      summary.gymsProcessed++;
      const rules = await this.prisma.client.automationRule.findMany({
        where: { gymId: gym.id, triggerType, active: true, isTemplate: false },
        select: RULE_SELECT,
      });
      for (const rule of rules) {
        const config = automationTriggerConfigSchema.safeParse(rule.triggerConfig).data;
        if (
          (triggerType === 'membership_expiring' || triggerType === 'no_checkin') &&
          !config?.days
        )
          continue;
        let offset: number;
        try {
          offset = timingOffsetDays(rule.timingOffset);
        } catch {
          continue;
        }
        summary.rulesMatched++;
        const entities = await this.scanEntities(
          gym.id,
          triggerType,
          config?.days ?? 0,
          offset,
          now,
        );
        for (const entity of entities) {
          let conditionsSkipped = false;
          const recorded = await this.fireRule(gym.id, rule, {
            entityId: entity.id,
            entityType: entity.entityType,
            dedupeSince: startOfUtcDay(now),
            immediate: true,
            now,
            onConditionsSkipped: () => {
              conditionsSkipped = true;
            },
          });
          if (recorded) summary.runsRecorded++;
          else if (conditionsSkipped) summary.conditionsSkipped++;
          else summary.runsSkipped++;
        }
      }
    }
    return summary;
  }

  private async scanEntities(
    gymId: string,
    trigger: AutomationTriggerType,
    days: number,
    offset: number,
    now: Date,
  ): Promise<{ id: string; entityType: AutomationEntityType }[]> {
    if (trigger === 'membership_expiring' || trigger === 'membership_expired') {
      const subs = await this.prisma.client.subscription.findMany({
        where: {
          gymId,
          status:
            trigger === 'membership_expired'
              ? SubscriptionStatus.EXPIRED
              : { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL] },
          currentPeriodEnd: utcDayWindow(
            now,
            (trigger === 'membership_expiring' ? days : 0) + offset,
          ),
        },
        select: { id: true },
      });
      return subs.map((sub) => ({ ...sub, entityType: 'subscription' }));
    }
    if (trigger === 'invoice_overdue') {
      const invoices = await this.prisma.client.invoice.findMany({
        where: { gymId, status: { in: ['PENDING', 'FAILED'] }, dueDate: utcDayWindow(now, offset) },
        select: { id: true },
      });
      return invoices.map((invoice) => ({ ...invoice, entityType: 'invoice' }));
    }
    if (trigger === 'birthday') {
      const target = utcDayWindow(now, offset).gte;
      const members = await this.prisma.client.gymMember.findMany({
        where: { gymId, status: 'ACTIVE', deletedAt: null, dateOfBirth: { not: null } },
        select: { id: true, dateOfBirth: true },
      });
      return members
        .filter(
          (member) =>
            member.dateOfBirth?.getUTCMonth() === target.getUTCMonth() &&
            member.dateOfBirth.getUTCDate() === target.getUTCDate(),
        )
        .map((member) => ({ id: member.id, entityType: 'member' }));
    }
    if (trigger === 'no_checkin') {
      const window = utcDayWindow(now, -(days + offset));
      const members = await this.prisma.client.gymMember.findMany({
        where: {
          gymId,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [
            {
              checkIns: {
                some: { gymId, checkedInAt: window },
                none: { gymId, checkedInAt: { gte: window.lt } },
              },
            },
            { checkIns: { none: { gymId } }, joinedAt: window },
          ],
        },
        select: { id: true },
      });
      return members.map((member) => ({ ...member, entityType: 'member' }));
    }
    return [];
  }

  /**
   * Take the single-scanner lock for today's window via Redis `SET NX EX`, keyed
   * by the calendar day. Returns true when this instance won it. Fails **closed**
   * on any Redis error — a missed scan is preferable to every replica double-logging
   * runs when the lock backend is unavailable.
   */
  private async acquireLock(
    key = `automation:scan:lock:${new Date().toISOString().slice(0, 10)}`,
    ttl = LOCK_TTL_SECONDS,
  ): Promise<boolean> {
    try {
      const result = await this.redis.client.set(key, '1', 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Could not acquire automation scan lock (Redis error) — skipping to avoid duplicates: ${errMsg(error)}`,
      );
      return false;
    }
  }
}

/**
 * What an action with no provider yet leaves in the log.
 *
 * Deliberately not "queued": nothing queues these, and a run log that claims a
 * send is worse than one that admits there isn't one. When a transport lands,
 * this is where its branch goes.
 */
function undeliveredActionDetail(actionType: AutomationActionType): string {
  switch (actionType) {
    case AutomationActionType.sms:
      return 'SMS not delivered yet';
    case AutomationActionType.push_notification:
      return 'Push notification not delivered yet';
    case AutomationActionType.create_task:
      return 'Task not delivered yet';
    default:
      return 'Action not delivered yet';
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
