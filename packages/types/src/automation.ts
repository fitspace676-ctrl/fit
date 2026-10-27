import { z } from 'zod';
import {
  automationConditionsSchema,
  type AutomationCondition,
  type AutomationConditionFieldMeta,
} from './automation-conditions';
import {
  automationTimingOffsetSchema,
  type AutomationTimingOffset,
  type AutomationTimingMeta,
} from './automation-timing';
export { automationTimingOffsetSchema, AUTOMATION_TIMING_PRESETS } from './automation-timing';
export type { AutomationTimingOffset, AutomationTimingMeta } from './automation-timing';

export type AutomationEntityType =
  | 'member'
  | 'subscription'
  | 'booking'
  | 'invoice'
  | 'order'
  | 'service_session';

// @fit/types/automation — the staff console's Automation contract (T12.5):
// "when X happens, do Y" rules, their reusable templates, the trigger/action
// catalogs the builder renders, and the executor's run log. Shared by the
// NestJS `/automation` module and the admin app (T12.6).
//
// The trigger / action / timing-offset value strings are the exact wire
// contract: they match the Prisma `AutomationTriggerType` / `AutomationActionType`
// enum member names and the DB `timingOffset` text, so nothing is mapped between
// the database, the server and JSON. Ported from the gym-admin prototype's
// `app/automation/page.tsx` catalogs.

// ---------------------------------------------------------------------------
// Trigger catalog
// ---------------------------------------------------------------------------

/** The five groups the trigger picker is organised into. */
export const automationTriggerCategorySchema = z.enum([
  'Members',
  'Classes',
  'Payments',
  'POS',
  'Staff',
]);

/** A trigger category — {@link automationTriggerCategorySchema}. */
export type AutomationTriggerCategory = z.infer<typeof automationTriggerCategorySchema>;

/** The event a rule reacts to — mirrors the Prisma `AutomationTriggerType` enum. */
export const automationTriggerTypeSchema = z.enum([
  // Members
  'member_joined',
  'membership_expiring',
  'membership_expired',
  'membership_renewed',
  'membership_frozen',
  'membership_cancelled',
  'birthday',
  'no_checkin',
  'checkin_milestone',
  // Retained to mirror the Prisma enum but left out of the trigger catalog: there is
  // no plan-change path yet, so nothing would ever fire them.
  'plan_upgraded',
  'plan_downgraded',
  // Retained to mirror the Prisma `AutomationTriggerType` enum (CRM was removed from
  // the product, but its DB models stay); these are no longer offered in the trigger
  // catalog, so staff can't select them.
  'lead_created',
  'lead_stage_changed',
  'lead_won',
  'lead_lost',
  'lead_no_activity',
  // Classes
  'class_booked',
  'class_cancelled_member',
  'class_full',
  'attendance_marked',
  'pt_session_booked',
  'pt_session_cancelled',
  // Payments
  'payment_received',
  'payment_failed',
  'invoice_overdue',
  'refund_issued',
  // POS
  'purchase_completed',
  'product_stock_low',
  // Staff
  'task_assigned',
  'task_completed',
  'timeoff_approved',
]);

/** The event a rule reacts to — {@link automationTriggerTypeSchema}. */
export type AutomationTriggerType = z.infer<typeof automationTriggerTypeSchema>;

/**
 * One entry of the trigger catalog: the value the rule stores, its display
 * label, the category it groups under, and — for the count/day-window triggers
 * — whether it needs a numeric `triggerConfig.days` and what that number means
 * (`daysLabel`, e.g. "days before" / "check-ins"). Mirrors the prototype's
 * `triggerOptions` metadata so the builder can render identically.
 */
export interface AutomationTriggerMeta {
  value: AutomationTriggerType;
  label: string;
  category: AutomationTriggerCategory;
  /** Whether the trigger requires a numeric `triggerConfig.days`. */
  needsDays: boolean;
  entityType: AutomationEntityType;
  kind: 'event' | 'scan';
  /**
   * Who a fired rule's message goes to: the member the trigger is about, or the
   * gym itself (its business email) for operational triggers with no member to
   * address, like `product_stock_low`.
   */
  recipient: 'member' | 'gym';
  /** What the `days` number means, for the field label (only when `needsDays`). */
  daysLabel?: string;
}

/**
 * The authoritative trigger catalog (T12.5), grouped by category. The single
 * source of truth for which triggers exist, which need a `days` value, and how
 * the builder labels them — served to the admin app at `GET /automation/catalog`
 * and used server-side to validate that a `needsDays` trigger carries its `days`.
 */
export const AUTOMATION_TRIGGER_CATALOG: readonly AutomationTriggerMeta[] = [
  // Members
  {
    value: 'member_joined',
    entityType: 'member',
    kind: 'event',
    recipient: 'member',
    label: 'Member joined',
    category: 'Members',
    needsDays: false,
  },
  {
    value: 'membership_expiring',
    entityType: 'subscription',
    kind: 'scan',
    recipient: 'member',
    label: 'Membership expiring',
    category: 'Members',
    needsDays: true,
    daysLabel: 'days before',
  },
  {
    value: 'membership_expired',
    entityType: 'subscription',
    kind: 'event',
    recipient: 'member',
    label: 'Membership expired',
    category: 'Members',
    needsDays: false,
  },
  {
    value: 'membership_renewed',
    entityType: 'subscription',
    kind: 'event',
    recipient: 'member',
    label: 'Membership renewed',
    category: 'Members',
    needsDays: false,
  },
  {
    value: 'membership_frozen',
    entityType: 'subscription',
    kind: 'event',
    recipient: 'member',
    label: 'Membership frozen',
    category: 'Members',
    needsDays: false,
  },
  {
    value: 'membership_cancelled',
    entityType: 'subscription',
    kind: 'event',
    recipient: 'member',
    label: 'Membership cancelled',
    category: 'Members',
    needsDays: false,
  },
  {
    value: 'birthday',
    entityType: 'member',
    kind: 'scan',
    recipient: 'member',
    label: 'Birthday',
    category: 'Members',
    needsDays: false,
  },
  {
    value: 'no_checkin',
    entityType: 'member',
    kind: 'scan',
    recipient: 'member',
    label: 'No check-in for X days',
    category: 'Members',
    needsDays: true,
    daysLabel: 'days',
  },
  {
    value: 'checkin_milestone',
    entityType: 'member',
    kind: 'event',
    recipient: 'member',
    label: 'Check-in milestone reached',
    category: 'Members',
    needsDays: true,
    daysLabel: 'check-ins',
  },
  // Classes
  {
    value: 'class_booked',
    entityType: 'booking',
    kind: 'event',
    recipient: 'member',
    label: 'Class booked',
    category: 'Classes',
    needsDays: false,
  },
  {
    value: 'class_cancelled_member',
    entityType: 'booking',
    kind: 'event',
    recipient: 'member',
    label: 'Class cancelled by member',
    category: 'Classes',
    needsDays: false,
  },
  {
    value: 'class_full',
    entityType: 'booking',
    kind: 'event',
    recipient: 'member',
    label: 'Class full',
    category: 'Classes',
    needsDays: false,
  },
  {
    value: 'attendance_marked',
    entityType: 'booking',
    kind: 'event',
    recipient: 'member',
    label: 'Attendance marked',
    category: 'Classes',
    needsDays: false,
  },
  {
    value: 'pt_session_booked',
    entityType: 'service_session',
    kind: 'event',
    recipient: 'member',
    label: 'PT session booked',
    category: 'Classes',
    needsDays: false,
  },
  {
    value: 'pt_session_cancelled',
    entityType: 'service_session',
    kind: 'event',
    recipient: 'member',
    label: 'PT session cancelled',
    category: 'Classes',
    needsDays: false,
  },
  // Payments
  {
    value: 'payment_received',
    entityType: 'invoice',
    kind: 'event',
    recipient: 'member',
    label: 'Payment received',
    category: 'Payments',
    needsDays: false,
  },
  {
    value: 'payment_failed',
    entityType: 'invoice',
    kind: 'event',
    recipient: 'member',
    label: 'Payment failed',
    category: 'Payments',
    needsDays: false,
  },
  {
    value: 'invoice_overdue',
    entityType: 'invoice',
    kind: 'scan',
    recipient: 'member',
    label: 'Invoice overdue',
    category: 'Payments',
    needsDays: false,
  },
  {
    value: 'refund_issued',
    entityType: 'invoice',
    kind: 'event',
    recipient: 'member',
    label: 'Refund issued',
    category: 'Payments',
    needsDays: false,
  },
  // POS
  {
    value: 'purchase_completed',
    entityType: 'order',
    kind: 'event',
    recipient: 'member',
    label: 'Purchase completed',
    category: 'POS',
    needsDays: false,
  },
  {
    value: 'product_stock_low',
    entityType: 'order',
    kind: 'event',
    recipient: 'gym',
    label: 'Product stock low',
    category: 'POS',
    needsDays: false,
  },
  // Staff
  {
    value: 'task_assigned',
    entityType: 'member',
    kind: 'event',
    recipient: 'member',
    label: 'Task assigned',
    category: 'Staff',
    needsDays: false,
  },
  {
    value: 'task_completed',
    entityType: 'member',
    kind: 'event',
    recipient: 'member',
    label: 'Task completed',
    category: 'Staff',
    needsDays: false,
  },
  {
    value: 'timeoff_approved',
    entityType: 'member',
    kind: 'event',
    recipient: 'member',
    label: 'Time-off approved',
    category: 'Staff',
    needsDays: false,
  },
];

/** The trigger types that require a numeric `triggerConfig.days` — derived from the catalog. */
export const TRIGGERS_NEEDING_DAYS: ReadonlySet<AutomationTriggerType> = new Set(
  AUTOMATION_TRIGGER_CATALOG.filter((t) => t.needsDays).map((t) => t.value),
);

/**
 * The trigger types whose message goes to the gym, not a member — derived from
 * the catalog. These only support the `email` action (sent to the gym's
 * business email); push, SMS and member tasks have nobody to reach.
 */
export const GYM_RECIPIENT_TRIGGERS: ReadonlySet<AutomationTriggerType> = new Set(
  AUTOMATION_TRIGGER_CATALOG.filter((t) => t.recipient === 'gym').map((t) => t.value),
);

/** The message a gym-recipient trigger's non-email action is rejected with. */
export const GYM_RECIPIENT_ACTION_MESSAGE = 'This trigger only supports the email action';

// ---------------------------------------------------------------------------
// Actions & timing
// ---------------------------------------------------------------------------

/** What a rule does when it fires — mirrors the Prisma `AutomationActionType` enum. */
export const automationActionTypeSchema = z.enum([
  'email',
  'sms',
  'push_notification',
  'create_task',
]);

/** What a rule does when it fires — {@link automationActionTypeSchema}. */
export type AutomationActionType = z.infer<typeof automationActionTypeSchema>;

/** One entry of the action catalog — the value the rule stores and its label. */
export interface AutomationActionMeta {
  value: AutomationActionType;
  label: string;
}

/** The action catalog (T12.5), served to the builder alongside the triggers. */
export const AUTOMATION_ACTION_CATALOG: readonly AutomationActionMeta[] = [
  { value: 'push_notification', label: 'Send push notification' },
  { value: 'email', label: 'Send email' },
  { value: 'sms', label: 'Send SMS' },
  { value: 'create_task', label: 'Create task' },
];

/**
 * Response of `GET /automation/catalog` — the three catalogs the builder (T12.6)
 * renders its trigger / action / timing pickers from, served from this one
 * shared source so the UI never hard-codes a list that could drift from the API.
 */
export interface AutomationCatalogResponse {
  triggers: readonly AutomationTriggerMeta[];
  actions: readonly AutomationActionMeta[];
  timings: readonly AutomationTimingMeta[];
  conditionFields: readonly AutomationConditionFieldMeta[];
  conditionOptions: {
    locations: { id: string; name: string }[];
    plans: { id: string; name: string }[];
    tags: string[];
  };
}

// ---------------------------------------------------------------------------
// Config bags
// ---------------------------------------------------------------------------

/**
 * A rule's `triggerConfig` (T12.5). Today just an optional `days` — the count
 * or day-window for the `needsDays` triggers (capped at ten years of days).
 * Kept a permissive object so future per-trigger settings can be added without
 * a migration.
 */
export const automationTriggerConfigSchema = z.object({
  days: z.number().int().min(1).max(3650).optional(),
});

/** A rule's trigger config — {@link automationTriggerConfigSchema}. */
export type AutomationTriggerConfig = z.infer<typeof automationTriggerConfigSchema>;

/**
 * A rule's `actionConfig` (T12.5) — the message the action delivers. `body` is
 * the template text (supports `{{member_first_name}}`-style tokens the executor
 * fills in), required so a rule always has something to send / a task title to
 * create; `subject` is the optional email subject line.
 */
export const automationActionConfigSchema = z.object({
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(2000),
});

/** A rule's action config — {@link automationActionConfigSchema}. */
export type AutomationActionConfig = z.infer<typeof automationActionConfigSchema>;

// ---------------------------------------------------------------------------
// Rules — list, create, update
// ---------------------------------------------------------------------------

/** A `(id, name)` reference to the staff user who authored a rule. */
export interface AutomationRef {
  id: string;
  name: string;
}

/**
 * One automation rule as the list/detail render it. `triggerConfig` /
 * `actionConfig` are the validated bags above; `createdBy` is the resolved
 * author ref (null once the staff user is deleted). `isTemplate` rows are the
 * reusable starting points and never appear in the active-rules list.
 */
export interface AutomationRuleRow {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  triggerConfig: AutomationTriggerConfig;
  timingOffset: AutomationTimingOffset;
  conditions: AutomationCondition[];
  actionType: AutomationActionType;
  actionConfig: AutomationActionConfig;
  active: boolean;
  isTemplate: boolean;
  createdBy: AutomationRef | null;
  createdAt: string;
  updatedAt: string;
}

/** Outcome of one run — mirrors the Prisma `AutomationRunStatus` enum. */
export const automationRunStatusSchema = z.enum(['QUEUED', 'SUCCESS', 'FAILED', 'SKIPPED']);

/** Outcome of one run — {@link automationRunStatusSchema}. */
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

/**
 * One row of a rule's run log — a firing (or attempted firing). `entityId` /
 * `entityType` point at what caused it; `detail` describes the (stubbed) action
 * taken. Append-only, newest `ranAt` first.
 */
export interface AutomationRunEntry {
  id: string;
  ruleId: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  entityId: string | null;
  entityType: string | null;
  detail: string;
  ranAt: string;
}

/** How many recent runs a rule's detail carries. */
export interface AutomationRuleDetail extends AutomationRuleRow {
  /** The rule's most recent runs, newest first. */
  runs: AutomationRunEntry[];
  /** Total runs ever recorded for the rule (not just the returned page). */
  runCount: number;
}

/**
 * A boolean query flag that survives the URL round-trip. `z.coerce.boolean()`
 * can't be used here: it runs JS `Boolean(...)`, so the string `'false'` becomes
 * `true` and the inactive filter is impossible to express. This accepts a real
 * boolean or the `'true'`/`'false'`/`'1'`/`'0'` strings a query string carries.
 */
const coercedBooleanFlag = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Sortable columns of the rules list. */
export const automationRuleSortSchema = z.enum(['createdAt', 'updatedAt', 'name']);

/**
 * Query for `GET /automation/rules`. Server-paginated;
 * `isTemplate` is always false here (templates have their own endpoint). `active`
 * / `triggerType` narrow the list, `search` matches the rule name.
 */
export const listAutomationRulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  triggerType: automationTriggerTypeSchema.optional(),
  active: coercedBooleanFlag.optional(),
  sort: automationRuleSortSchema.default('createdAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
});

/** Validated `GET /automation/rules` query — {@link listAutomationRulesQuerySchema}. */
export type ListAutomationRulesQuery = z.infer<typeof listAutomationRulesQuerySchema>;

/** Response of `GET /automation/rules` — one filtered page of active rules. */
export interface ListAutomationRulesResponse {
  data: AutomationRuleRow[];
  total: number;
  page: number;
  limit: number;
}

/** Response of `GET /automation/templates` — every reusable template, newest first. */
export interface ListAutomationTemplatesResponse {
  data: AutomationRuleRow[];
}

/**
 * Response of `GET /automation/stats` — the summary KPIs the automation console's
 * header cards render (parity with the reference admin). `totalRules` /
 * `activeRules` count the gym's non-template rules; `totalRuns` is every run ever
 * recorded; `messagesSent` is the successful (delivered) runs; `sentLast30Days`
 * is those successes within the trailing 30 days.
 */
export interface AutomationStats {
  totalRules: number;
  activeRules: number;
  totalRuns: number;
  messagesSent: number;
  sentLast30Days: number;
}

/**
 * The rule body shared by create and save-as-template. A `needsDays` trigger
 * (`membership_expiring`, `no_checkin`, `checkin_milestone`)
 * must carry `triggerConfig.days`; the refine rejects it otherwise so a
 * half-configured rule never persists.
 */
const automationRuleBase = z.object({
  name: z.string().trim().min(1).max(120),
  triggerType: automationTriggerTypeSchema,
  triggerConfig: automationTriggerConfigSchema.default({}),
  timingOffset: automationTimingOffsetSchema.default('0d'),
  conditions: automationConditionsSchema,
  actionType: automationActionTypeSchema,
  actionConfig: automationActionConfigSchema,
  active: z.boolean().default(true),
});

/** Require `triggerConfig.days` exactly for the triggers that need it. */
function refineDays(
  value: { triggerType: AutomationTriggerType; triggerConfig: AutomationTriggerConfig },
  ctx: z.RefinementCtx,
): void {
  const needs = TRIGGERS_NEEDING_DAYS.has(value.triggerType);
  if (needs && value.triggerConfig.days === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'This trigger requires triggerConfig.days',
      path: ['triggerConfig', 'days'],
    });
  }
}

/** A gym-recipient trigger ({@link GYM_RECIPIENT_TRIGGERS}) only takes the `email` action. */
function refineRecipientAction(
  value: { triggerType?: AutomationTriggerType; actionType?: AutomationActionType },
  ctx: z.RefinementCtx,
): void {
  if (
    value.triggerType !== undefined &&
    value.actionType !== undefined &&
    GYM_RECIPIENT_TRIGGERS.has(value.triggerType) &&
    value.actionType !== 'email'
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: GYM_RECIPIENT_ACTION_MESSAGE,
      path: ['actionType'],
    });
  }
}

/**
 * Body of `POST /automation/rules`. `status` (active) defaults true; the author
 * is resolved from the session, never trusted from the body. See
 * {@link automationRuleBase} for the per-trigger `days` rule.
 */
export const createAutomationRuleSchema = automationRuleBase.superRefine((value, ctx) => {
  refineDays(value, ctx);
  refineRecipientAction(value, ctx);
});

/** Validated `POST /automation/rules` body — {@link createAutomationRuleSchema}. */
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

/**
 * Body of `PATCH /automation/rules/:id` — every field optional; only provided
 * keys change. When `triggerType` and/or `triggerConfig` are supplied together
 * the same per-trigger `days` rule applies to the resulting pair; a lone field
 * is validated against itself and the fuller check runs server-side against the
 * merged record.
 */
export const updateAutomationRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    triggerType: automationTriggerTypeSchema.optional(),
    triggerConfig: automationTriggerConfigSchema.optional(),
    timingOffset: automationTimingOffsetSchema.optional(),
    conditions: automationConditionsSchema.optional(),
    actionType: automationActionTypeSchema.optional(),
    actionConfig: automationActionConfigSchema.optional(),
    active: z.boolean().optional(),
  })
  .superRefine(refineRecipientAction);

/** Validated `PATCH /automation/rules/:id` body — {@link updateAutomationRuleSchema}. */
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;

/** Body of `POST /automation/rules/:id/toggle` — the new active state. */
export const toggleAutomationRuleSchema = z.object({
  active: z.boolean(),
});

/** Validated toggle body — {@link toggleAutomationRuleSchema}. */
export type ToggleAutomationRuleInput = z.infer<typeof toggleAutomationRuleSchema>;

/**
 * Body of `POST /automation/rules/:id/save-as-template` — an optional new name
 * for the template copy (defaults to the source rule's name). The copy is
 * `isTemplate: true` and inactive, and reuses the source's trigger/action config.
 */
export const saveAsTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

/** Validated save-as-template body — {@link saveAsTemplateSchema}. */
export type SaveAsTemplateInput = z.infer<typeof saveAsTemplateSchema>;

/** Response of `GET /automation/rules/:id` (and every rule mutation). */
export type GetAutomationRuleResponse = AutomationRuleDetail;

/** Query for `GET /automation/rules/:id/runs` — a capped page of the run log. */
export const listAutomationRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Validated run-log query — {@link listAutomationRunsQuerySchema}. */
export type ListAutomationRunsQuery = z.infer<typeof listAutomationRunsQuerySchema>;

/** Response of `GET /automation/rules/:id/runs`, newest `ranAt` first. */
export interface ListAutomationRunsResponse {
  data: AutomationRunEntry[];
}
