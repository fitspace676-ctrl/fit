import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@fit/db';
import {
  TRIGGERS_NEEDING_DAYS,
  automationActionConfigSchema,
  automationTimingOffsetSchema,
  automationTriggerConfigSchema,
  AUTOMATION_ACTION_CATALOG,
  AUTOMATION_TIMING_CATALOG,
  AUTOMATION_TRIGGER_CATALOG,
  type AutomationActionConfig,
  type AutomationCatalogResponse,
  type AutomationRef,
  type AutomationRuleDetail,
  type AutomationRuleRow,
  type AutomationRunEntry,
  type AutomationStats,
  type AutomationTimingOffset,
  type AutomationTriggerConfig,
  type CreateAutomationRuleInput,
  type GetAutomationRuleResponse,
  type ListAutomationRulesQuery,
  type ListAutomationRulesResponse,
  type ListAutomationRunsQuery,
  type ListAutomationRunsResponse,
  type ListAutomationTemplatesResponse,
  type SaveAsTemplateInput,
  type ToggleAutomationRuleInput,
  type UpdateAutomationRuleInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** How many recent runs a rule's detail carries. */
const DETAIL_RUN_LIMIT = 20;

/** The `(id, name, email)` slice of a `User` a rule's author ref resolves from. */
const USER_REF_SELECT = { id: true, name: true, email: true } satisfies Prisma.UserSelect;

/**
 * Shape the rule queries select — the rule's own columns plus the resolved
 * `createdBy` author ref. Narrow on the joined `User`: only name/email, never
 * auth fields.
 */
const RULE_SELECT = {
  id: true,
  name: true,
  triggerType: true,
  triggerConfig: true,
  timingOffset: true,
  actionType: true,
  actionConfig: true,
  active: true,
  isTemplate: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: USER_REF_SELECT },
} satisfies Prisma.AutomationRuleSelect;

/** Shape every run read selects — exactly the wire `AutomationRunEntry`. */
const RUN_SELECT = {
  id: true,
  ruleId: true,
  triggerType: true,
  status: true,
  entityId: true,
  entityType: true,
  detail: true,
  ranAt: true,
} satisfies Prisma.AutomationRunSelect;

type RuleRecord = Prisma.AutomationRuleGetPayload<{ select: typeof RULE_SELECT }>;
type RunRecord = Prisma.AutomationRunGetPayload<{ select: typeof RUN_SELECT }>;

/**
 * Automation backend (T12.5) — CRUD for the "when X happens, do Y" rules, their
 * reusable templates, the trigger/action/timing catalog the builder renders, and
 * the executor's run log. Ported from the gym-admin prototype's mock-array
 * automation into real gym-scoped tables.
 *
 * Every query runs on the tenant-scoped Prisma client (both models are in
 * `TENANT_SCOPED_MODELS`), so no method passes or trusts a `gymId` — another
 * gym's automations are unreachable by construction. The rule author is resolved
 * from the session, never from the body. The {@link AutomationExecutorService}
 * (which fires rules) is separate: it runs cross-tenant off the unscoped client.
 */
@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** The trigger / action / timing catalogs the builder (T12.6) renders from. */
  catalog(): AutomationCatalogResponse {
    return {
      triggers: AUTOMATION_TRIGGER_CATALOG,
      actions: AUTOMATION_ACTION_CATALOG,
      timings: AUTOMATION_TIMING_CATALOG,
    };
  }

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  /** One filtered, paginated page of the gym's active (non-template) rules. */
  async listRules(query: ListAutomationRulesQuery): Promise<ListAutomationRulesResponse> {
    const where: Prisma.AutomationRuleWhereInput = {
      isTemplate: false,
      ...(query.triggerType ? { triggerType: query.triggerType } : {}),
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.automationRule.findMany({
        where,
        orderBy: { [query.sort]: query.dir },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: RULE_SELECT,
      }),
      this.prisma.client.automationRule.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toRuleRow(r)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Summary KPIs for the automation console header (parity with the reference).
   * Counts the gym's non-template rules (total + active), every run ever, the
   * delivered (SUCCESS) runs, and the deliveries within the trailing 30 days.
   */
  async getStats(): Promise<AutomationStats> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [totalRules, activeRules, totalRuns, messagesSent, sentLast30Days] = await Promise.all([
      this.prisma.client.automationRule.count({ where: { isTemplate: false } }),
      this.prisma.client.automationRule.count({ where: { isTemplate: false, active: true } }),
      this.prisma.client.automationRun.count(),
      this.prisma.client.automationRun.count({ where: { status: 'SUCCESS' } }),
      this.prisma.client.automationRun.count({
        where: { status: 'SUCCESS', ranAt: { gte: since } },
      }),
    ]);
    return { totalRules, activeRules, totalRuns, messagesSent, sentLast30Days };
  }

  /** Every reusable template, newest first. */
  async listTemplates(): Promise<ListAutomationTemplatesResponse> {
    const rows = await this.prisma.client.automationRule.findMany({
      where: { isTemplate: true },
      orderBy: { createdAt: 'desc' },
      select: RULE_SELECT,
    });
    return { data: rows.map((r) => this.toRuleRow(r)) };
  }

  /** One rule's detail — the row plus its recent run log. 404s on a miss. */
  async getRule(id: string): Promise<GetAutomationRuleResponse> {
    const rule = await this.requireRule(id);
    return this.ruleDetail(rule);
  }

  /**
   * Create a rule (active by default). The per-trigger `days` requirement is
   * enforced at the schema boundary; the author is snapshotted from the session.
   */
  async createRule(input: CreateAutomationRuleInput): Promise<GetAutomationRuleResponse> {
    const created = await this.prisma.client.automationRule.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        triggerType: input.triggerType,
        triggerConfig:
          input.triggerConfig satisfies AutomationTriggerConfig as Prisma.InputJsonValue,
        timingOffset: input.timingOffset,
        actionType: input.actionType,
        actionConfig: input.actionConfig satisfies AutomationActionConfig as Prisma.InputJsonValue,
        active: input.active,
        isTemplate: false,
        createdById: this.tenant.userId ?? null,
      },
      select: RULE_SELECT,
    });
    return this.ruleDetail(created);
  }

  /**
   * Edit a rule. Only provided keys change. When the change would leave a
   * `needsDays` trigger without a `days` (e.g. retargeting to `no_checkin`
   * without supplying one), it is a `400` — the same guard the create schema
   * enforces, applied here against the merged record.
   */
  async updateRule(
    id: string,
    input: UpdateAutomationRuleInput,
  ): Promise<GetAutomationRuleResponse> {
    const existing = await this.requireRule(id);

    const nextTrigger = input.triggerType ?? existing.triggerType;
    const nextConfig =
      input.triggerConfig ?? automationTriggerConfigSchema.parse(existing.triggerConfig ?? {});
    if (TRIGGERS_NEEDING_DAYS.has(nextTrigger) && nextConfig.days === undefined) {
      throw new BadRequestException([
        'triggerConfig.days: This trigger requires triggerConfig.days',
      ]);
    }

    const updated = await this.prisma.client.automationRule.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.triggerType !== undefined ? { triggerType: input.triggerType } : {}),
        ...(input.triggerConfig !== undefined
          ? { triggerConfig: input.triggerConfig as Prisma.InputJsonValue }
          : {}),
        ...(input.timingOffset !== undefined ? { timingOffset: input.timingOffset } : {}),
        ...(input.actionType !== undefined ? { actionType: input.actionType } : {}),
        ...(input.actionConfig !== undefined
          ? { actionConfig: input.actionConfig as Prisma.InputJsonValue }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      select: RULE_SELECT,
    });
    return this.ruleDetail(updated);
  }

  /** Toggle a rule's active state (a template can't be activated). 404s on a miss. */
  async toggleRule(
    id: string,
    input: ToggleAutomationRuleInput,
  ): Promise<GetAutomationRuleResponse> {
    const existing = await this.requireRule(id);
    if (existing.isTemplate) {
      throw new BadRequestException({
        message: 'A template cannot be activated; create a rule from it first',
        code: 'AUTOMATION_TEMPLATE_NOT_TOGGLEABLE',
      });
    }
    const updated = await this.prisma.client.automationRule.update({
      where: { id },
      data: { active: input.active },
      select: RULE_SELECT,
    });
    return this.ruleDetail(updated);
  }

  /**
   * Save an existing rule as a reusable template — a `isTemplate: true`, inactive
   * copy that reuses the source's trigger/action config. The template never
   * fires; the builder clones it into a fresh rule. 404s an unknown source.
   */
  async saveAsTemplate(id: string, input: SaveAsTemplateInput): Promise<GetAutomationRuleResponse> {
    const source = await this.requireRule(id);
    const created = await this.prisma.client.automationRule.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name ?? source.name,
        triggerType: source.triggerType,
        triggerConfig: (source.triggerConfig ?? {}) as Prisma.InputJsonValue,
        timingOffset: source.timingOffset,
        actionType: source.actionType,
        actionConfig: (source.actionConfig ?? {}) as Prisma.InputJsonValue,
        active: false,
        isTemplate: true,
        createdById: this.tenant.userId ?? null,
      },
      select: RULE_SELECT,
    });
    return this.ruleDetail(created);
  }

  /** Delete a rule (its runs cascade). 404s on a miss. */
  async deleteRule(id: string): Promise<void> {
    await this.requireRule(id);
    await this.prisma.client.automationRule.delete({ where: { id } });
  }

  // -------------------------------------------------------------------------
  // Runs
  // -------------------------------------------------------------------------

  /** One rule's run log, newest first. 404s an unknown rule. */
  async listRuns(id: string, query: ListAutomationRunsQuery): Promise<ListAutomationRunsResponse> {
    await this.requireRule(id);
    const rows = await this.prisma.client.automationRun.findMany({
      where: { ruleId: id },
      orderBy: { ranAt: 'desc' },
      take: query.limit,
      select: RUN_SELECT,
    });
    return { data: rows.map((r) => this.toRunEntry(r)) };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** The rule, or a `404 AUTOMATION_RULE_NOT_FOUND` for an unknown/cross-tenant id. */
  private async requireRule(id: string): Promise<RuleRecord> {
    const rule = await this.prisma.client.automationRule.findFirst({
      where: { id },
      select: RULE_SELECT,
    });
    if (!rule) {
      throw new NotFoundException({
        message: 'Automation rule not found',
        code: 'AUTOMATION_RULE_NOT_FOUND',
      });
    }
    return rule;
  }

  /** A rule's detail response — the row plus its recent runs and total run count. */
  private async ruleDetail(rule: RuleRecord): Promise<AutomationRuleDetail> {
    const [runs, runCount] = await Promise.all([
      this.prisma.client.automationRun.findMany({
        where: { ruleId: rule.id },
        orderBy: { ranAt: 'desc' },
        take: DETAIL_RUN_LIMIT,
        select: RUN_SELECT,
      }),
      this.prisma.client.automationRun.count({ where: { ruleId: rule.id } }),
    ]);
    return {
      ...this.toRuleRow(rule),
      runs: runs.map((r) => this.toRunEntry(r)),
      runCount,
    };
  }

  private toRuleRow(rule: RuleRecord): AutomationRuleRow {
    return {
      id: rule.id,
      name: rule.name,
      triggerType: rule.triggerType,
      triggerConfig: automationTriggerConfigSchema.parse(rule.triggerConfig ?? {}),
      timingOffset: parseTimingOffset(rule.timingOffset),
      actionType: rule.actionType,
      actionConfig: parseActionConfig(rule.actionConfig),
      active: rule.active,
      isTemplate: rule.isTemplate,
      createdBy: toRef(rule.createdBy),
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private toRunEntry(run: RunRecord): AutomationRunEntry {
    return {
      id: run.id,
      ruleId: run.ruleId,
      triggerType: run.triggerType,
      status: run.status,
      entityId: run.entityId,
      entityType: run.entityType,
      detail: run.detail,
      ranAt: run.ranAt.toISOString(),
    };
  }
}

/** A person ref from a nullable joined row — name falls back to email. */
function toRef(
  row: { id: string; name: string | null; email: string } | null,
): AutomationRef | null {
  if (!row) return null;
  return { id: row.id, name: row.name ?? row.email };
}

/**
 * Coerce a stored `timingOffset` text to the wire enum, defaulting to `day_of`
 * for any legacy/invalid value so a bad row can't crash the list. Writes always
 * go through the zod-validated schema, so this only guards reads.
 */
function parseTimingOffset(value: string): AutomationTimingOffset {
  const parsed = automationTimingOffsetSchema.safeParse(value);
  return parsed.success ? parsed.data : 'day_of';
}

/**
 * Coerce a stored `actionConfig` JSON to the wire shape, tolerating a legacy row
 * with no body by defaulting it empty — reads never throw on historical data.
 */
function parseActionConfig(value: Prisma.JsonValue): AutomationActionConfig {
  const parsed = automationActionConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { body: '' };
}
