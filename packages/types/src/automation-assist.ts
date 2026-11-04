import { z } from 'zod';
import {
  GYM_RECIPIENT_TRIGGERS,
  createAutomationRuleSchema,
  updateAutomationRuleSchema,
} from './automation';
import type { AutomationCondition } from './automation-conditions';
import { AUTOMATION_MERGE_FIELDS, mergeFieldsForTrigger } from './automation-merge-fields';

// @fit/types/automation-assist — the contract between the admin builder's
// "Build with AI" panel and `POST /automation/assist`.
//
// The assistant turns an operator's natural-language request (Georgian or
// English) into a *draft* of an automation rule. It never saves anything: the
// draft is applied to the builder form, where the operator reviews, edits and
// saves it through the ordinary create/update path. A draft is deliberately
// partial (every field optional) so the assistant can fill what it understood
// and ask about the rest.

/**
 * A partial automation rule — the same shape as the PATCH body, so every field
 * is optional and the recipient/action refine still applies. `complete` on the
 * response says whether it also passes `createAutomationRuleSchema`.
 */
export const automationDraftSchema = updateAutomationRuleSchema;

/** A partial automation rule — {@link automationDraftSchema}. */
export type AutomationDraft = z.infer<typeof automationDraftSchema>;

/** One earlier exchange in the assistant panel (operator or assistant text). */
export const automationAssistTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

/** One earlier exchange — {@link automationAssistTurnSchema}. */
export type AutomationAssistTurn = z.infer<typeof automationAssistTurnSchema>;

/**
 * Body of `POST /automation/assist`.
 *
 * - `message` — the operator's request or refinement ("add a condition...").
 * - `draft` — the builder form as it stands, so a refinement edits it rather
 *   than starting over. Omitted/empty for a fresh request.
 * - `history` — the panel's earlier turns (operator + assistant text), newest
 *   last, so the model keeps the thread of a refinement.
 * - `model` — the agent model id (same ids as the admin AI agent's selector);
 *   the server resolves it exactly like `POST /agent/chat` does.
 *
 * Tenant data (branches, plans, tags) is never part of the body: the server
 * reads it from the tenant-scoped catalog.
 */
export const automationAssistRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  locale: z.enum(['ka', 'en']).default('ka'),
  draft: automationDraftSchema.optional(),
  history: z.array(automationAssistTurnSchema).max(20).default([]),
  model: z.string().min(1).max(64).optional(),
});

/** Validated `POST /automation/assist` body — {@link automationAssistRequestSchema}. */
export type AutomationAssistRequest = z.infer<typeof automationAssistRequestSchema>;

/**
 * Response of `POST /automation/assist`.
 *
 * - `draft` — the assistant understood enough to propose a rule. `draft` is the
 *   (possibly partial) rule to apply to the form; `explanation` is one or two
 *   plain sentences, in the operator's language, saying what the rule will do;
 *   `complete` is whether the draft already passes `createAutomationRuleSchema`.
 * - `question` — something was ambiguous or named a branch / plan / tag /
 *   trigger that does not exist for this gym. `question` is what the assistant
 *   needs to know; `draft` carries whatever it could already fill in.
 *
 * `model` is the agent model id that answered (after any provider fallback).
 */
export const automationAssistResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('draft'),
    draft: automationDraftSchema,
    explanation: z.string().trim().min(1).max(1000),
    complete: z.boolean(),
    model: z.string().min(1).max(64),
  }),
  z.object({
    kind: z.literal('question'),
    question: z.string().trim().min(1).max(1000),
    draft: automationDraftSchema.optional(),
    model: z.string().min(1).max(64),
  }),
]);

/** Response of `POST /automation/assist` — {@link automationAssistResponseSchema}. */
export type AutomationAssistResponse = z.infer<typeof automationAssistResponseSchema>;

/** The error codes `POST /automation/assist` answers with (besides a 400 on a bad body). */
export const AUTOMATION_ASSIST_ERROR_CODES = {
  /** No provider API key is configured, so no model could be resolved (503). */
  notConfigured: 'AUTOMATION_ASSIST_NOT_CONFIGURED',
  /** The model provider failed or returned something unusable (502). */
  failed: 'AUTOMATION_ASSIST_FAILED',
} as const;

// ---------------------------------------------------------------------------
// Draft validation against the tenant's own options
// ---------------------------------------------------------------------------

/**
 * The tenant data a draft may reference: the gym's branches, plans and member
 * tags, exactly as `GET /automation/catalog` serves them as `conditionOptions`.
 * The server always reads these from the tenant-scoped catalog, never the body.
 */
export interface AutomationAssistOptions {
  locations: { id: string; name: string }[];
  plans: { id: string; name: string }[];
  tags: string[];
}

/** What {@link validateAutomationDraft} found. */
export interface AutomationDraftValidation {
  /** The parsed draft, with branch/plan names resolved to ids (`{}` when unparseable). */
  draft: AutomationDraft;
  /** Whether the draft has no issues and also passes `createAutomationRuleSchema`. */
  complete: boolean;
  /** Human-readable problems, one per line, fed back to the model to fix. */
  issues: string[];
}

const MERGE_TOKEN_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

const sameText = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

const availableList = (names: readonly string[]): string =>
  names.length > 0 ? names.join(', ') : 'none';

/**
 * Map one branch/plan reference onto the tenant's options: an exact id stays,
 * a name (case-insensitive, trimmed) becomes its id, anything else is reported.
 */
function resolveReference(
  value: string,
  choices: readonly { id: string; name: string }[],
  label: string,
  issues: string[],
): string {
  if (choices.some((choice) => choice.id === value)) return value;
  const byName = choices.find((choice) => sameText(choice.name, value));
  if (byName) return byName.id;
  issues.push(
    `Unknown ${label}: ${value}. Available: ${availableList(choices.map((choice) => choice.name))}`,
  );
  return value;
}

function resolveTag(value: string, tags: readonly string[], issues: string[]): string {
  if (tags.includes(value)) return value;
  const match = tags.find((tag) => sameText(tag, value));
  if (match !== undefined) return match;
  issues.push(`Unknown tag: ${value}. Available: ${availableList(tags)}`);
  return value;
}

function resolveConditionValue(
  condition: AutomationCondition,
  options: AutomationAssistOptions,
  issues: string[],
): AutomationCondition {
  const { field, value } = condition;
  if (value === undefined || typeof value === 'number') return condition;
  const map = (item: string): string => {
    if (field === 'member_branch') {
      return resolveReference(item, options.locations, 'branch', issues);
    }
    if (field === 'subscription_plan') {
      return resolveReference(item, options.plans, 'plan', issues);
    }
    if (field === 'member_tags') return resolveTag(item, options.tags, issues);
    return item;
  };
  return { ...condition, value: Array.isArray(value) ? value.map(map) : map(value) };
}

/** Every `{{token}}` in `text` that is not one of `allowed`. */
function unknownTokens(text: string | undefined, allowed: ReadonlySet<string>): string[] {
  if (!text) return [];
  const unknown: string[] = [];
  for (const match of text.matchAll(MERGE_TOKEN_PATTERN)) {
    const token = `{{${match[1]}}}`;
    if (!allowed.has(token) && !unknown.includes(token)) unknown.push(token);
  }
  return unknown;
}

/**
 * Check a model-proposed draft against the rule schema *and* this gym's data.
 *
 * - Shape: {@link automationDraftSchema}; a draft that does not parse is
 *   reported field by field (`path: message`) and returned as `{}`.
 * - Branch / plan conditions must name one of `options.locations` /
 *   `options.plans` — an id, or a name that is rewritten to its id. Tags must be
 *   one of `options.tags`. A branch id from another gym is simply unknown here.
 * - Merge tokens in the subject/body must be ones the trigger can fill.
 * - A gym-recipient trigger takes no conditions (and only the email action).
 *
 * A `needsDays` trigger without `days` is not an issue — the draft is just not
 * `complete` yet.
 */
export function validateAutomationDraft(
  input: unknown,
  options: AutomationAssistOptions,
): AutomationDraftValidation {
  const parsed = automationDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      draft: {},
      complete: false,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    };
  }

  const issues: string[] = [];
  const draft: AutomationDraft = { ...parsed.data };

  if (draft.conditions) {
    draft.conditions = draft.conditions.map((condition) =>
      resolveConditionValue(condition, options, issues),
    );
  }

  if (draft.actionConfig) {
    const fields = draft.triggerType
      ? mergeFieldsForTrigger(draft.triggerType)
      : AUTOMATION_MERGE_FIELDS;
    const offered = fields.map((field) => field.token);
    // Older alias names still interpolate, so a draft using one is not wrong.
    const allowed = new Set([
      ...offered,
      ...fields.flatMap((field) => (field.aliases ?? []).map((alias) => `{{${alias}}}`)),
    ]);
    const unknown = [
      ...unknownTokens(draft.actionConfig.subject, allowed),
      ...unknownTokens(draft.actionConfig.body, allowed),
    ].filter((token, index, all) => all.indexOf(token) === index);
    for (const token of unknown) {
      issues.push(`Unknown merge token: ${token}. Allowed: ${offered.join(', ')}`);
    }
  }

  if (draft.triggerType && GYM_RECIPIENT_TRIGGERS.has(draft.triggerType)) {
    if (draft.conditions && draft.conditions.length > 0) {
      issues.push(`conditions: The ${draft.triggerType} trigger does not support conditions`);
    }
  }

  const complete = issues.length === 0 && createAutomationRuleSchema.safeParse(draft).success;
  return { draft, complete, issues };
}
