import { z } from 'zod';
import { updateAutomationRuleSchema } from './automation';

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
