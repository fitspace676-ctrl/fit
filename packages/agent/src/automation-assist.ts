// The admin builder's "Build with AI" assistant: one operator message in, one
// automation-rule draft (or one clarifying question) out.
//
// Unlike the console agent (run-agent.ts) this is not a tool-use loop over the
// MCP tools. The model gets two local tools, `propose_rule` and `ask_operator`,
// and must call exactly one. A proposed rule is checked against the rule schema
// and this gym's own branches / plans / tags (validateAutomationDraft); a bad
// draft is sent back once with the issues so the model can fix it, and a second
// bad draft becomes a question for the operator. Nothing is ever saved here:
// the draft goes back to the builder form, which saves through the normal path.

import {
  AUTOMATION_ACTION_CATALOG,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_MERGE_FIELDS,
  AUTOMATION_TRIGGER_CATALOG,
  GYM_RECIPIENT_TRIGGERS,
  OPERATORS_BY_TYPE,
  automationActionTypeSchema,
  automationConditionFieldSchema,
  automationConditionOperatorSchema,
  automationTriggerTypeSchema,
  validateAutomationDraft,
  type AutomationAssistOptions,
  type AutomationAssistRequest,
  type AutomationAssistResponse,
  type AutomationDraft,
  type AutomationEntityType,
} from '@fit/types';
import type { AgentHistoryMessage, AgentTool, ModelDriver, ModelTurn } from './driver';
import { sanitizeGeorgianText } from './georgian-text';
import { createDriver, fallbackModels, type AgentModel } from './models';

/** Who the assistant is drafting for, read from the verified session. */
export interface AutomationAssistContext {
  gym: { name: string; slug: string };
  /** The console's language — the reply language when the message is unclear. */
  locale: 'ka' | 'en';
  /** Today's date (`YYYY-MM-DD`) in the gym's timezone. */
  today: string;
}

/** Seams for the API (fallback logging) and specs (a scripted driver). */
export interface DraftAutomationRuleExtra {
  onFallback?: (from: AgentModel, to: AgentModel, reason: string) => void;
  createDriver?: (model: AgentModel) => ModelDriver;
}

/** Model calls per request: the first try plus one repair round. */
const MAX_ATTEMPTS = 2;
/** The response schema caps `question` / `explanation` at this many characters. */
const MAX_TEXT = 1000;

const PROPOSE_RULE = 'propose_rule';
const ASK_OPERATOR = 'ask_operator';

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

/** JSON Schema of the rule fields, shared by both tools. */
const DRAFT_PROPERTIES: Record<string, unknown> = {
  name: { type: 'string', description: 'Short rule name, at most 120 characters.' },
  triggerType: { type: 'string', enum: [...automationTriggerTypeSchema.options] },
  triggerConfig: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        description: 'Only for triggers that need days (see the trigger list).',
      },
    },
  },
  timingOffset: {
    type: 'string',
    description: "Offset like '0d', '1d', '2h' or '-3d'. '0d' means immediately.",
  },
  conditions: {
    type: 'array',
    maxItems: 10,
    items: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: [...automationConditionFieldSchema.options] },
        operator: { type: 'string', enum: [...automationConditionOperatorSchema.options] },
        value: {
          anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'array', items: { type: 'string' } },
          ],
        },
      },
      required: ['field', 'operator'],
    },
  },
  actionType: { type: 'string', enum: [...automationActionTypeSchema.options] },
  actionConfig: {
    type: 'object',
    properties: {
      subject: { type: 'string', description: 'Email subject, at most 200 characters.' },
      body: {
        type: 'string',
        description: 'Message text (or the task title), at most 2000 characters.',
      },
    },
  },
};

const TOOLS: AgentTool[] = [
  {
    name: PROPOSE_RULE,
    description:
      'Propose the automation rule draft that matches the request. Always send the full, updated draft.',
    parameters: {
      type: 'object',
      properties: {
        ...DRAFT_PROPERTIES,
        explanation: {
          type: 'string',
          description:
            "One or two plain sentences, in the operator's language, on what the rule does.",
        },
      },
      required: ['explanation'],
    },
  },
  {
    name: ASK_OPERATOR,
    description:
      'Ask the operator one clarifying question when the request is ambiguous or names something that does not exist.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: "The question, in the operator's language. List the real options.",
        },
        draft: {
          type: 'object',
          description: 'Whatever part of the rule is already clear (optional).',
          properties: DRAFT_PROPERTIES,
        },
      },
      required: ['question'],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ENTITY_TYPES: readonly AutomationEntityType[] = [
  ...new Set(AUTOMATION_TRIGGER_CATALOG.map((trigger) => trigger.entityType)),
];

function triggerLines(): string[] {
  return AUTOMATION_TRIGGER_CATALOG.map((trigger) => {
    const parts = [
      `- ${trigger.value}: ${trigger.label}`,
      `kind=${trigger.kind}`,
      `entityType=${trigger.entityType}`,
      `recipient=${trigger.recipient}`,
    ];
    if (trigger.needsDays) parts.push(`needs triggerConfig.days (${trigger.daysLabel ?? 'days'})`);
    return parts.join('; ');
  });
}

function conditionLines(options: AutomationAssistOptions): string[] {
  return AUTOMATION_CONDITION_FIELDS.map((field) => {
    const parts = [
      `- ${field.key}`,
      `type=${field.type}`,
      `operators=${OPERATORS_BY_TYPE[field.type].join(', ')}`,
    ];
    if (field.enumValues) parts.push(`values=${field.enumValues.join(', ')}`);
    if (field.optionsSource === 'locations') {
      parts.push(
        `values (use the id)=${
          options.locations.map((l) => `${l.id} - ${l.name}`).join('; ') ||
          'none (this gym has no branches)'
        }`,
      );
    }
    if (field.optionsSource === 'plans') {
      parts.push(
        `values (use the id)=${
          options.plans.map((p) => `${p.id} - ${p.name}`).join('; ') ||
          'none (this gym has no plans)'
        }`,
      );
    }
    if (field.optionsSource === 'tags') {
      parts.push(`values=${options.tags.join(', ') || 'none (this gym has no tags)'}`);
    }
    return parts.join('; ');
  });
}

function mergeTokenLines(): string[] {
  const common = AUTOMATION_MERGE_FIELDS.filter((field) =>
    ENTITY_TYPES.every((entity) => field.contexts.includes(entity)),
  );
  const lines = [`- every trigger: ${common.map((field) => field.token).join(' ')}`];
  for (const entity of ENTITY_TYPES) {
    const extra = AUTOMATION_MERGE_FIELDS.filter(
      (field) => field.contexts.includes(entity) && !common.includes(field),
    );
    if (extra.length > 0) {
      lines.push(`- also for entityType=${entity}: ${extra.map((field) => field.token).join(' ')}`);
    }
  }
  return lines;
}

/** The assistant's system prompt — built per request from this gym's own options. */
export function buildAutomationAssistPrompt(
  options: AutomationAssistOptions,
  context: AutomationAssistContext,
): string {
  const gymOnly = [...GYM_RECIPIENT_TRIGGERS].join(', ');
  const localeName = context.locale === 'ka' ? 'Georgian' : 'English';
  return [
    `You draft automation rules for the gym "${context.gym.name}" in the FormaCore admin console.`,
    'A rule is "when TRIGGER happens (and CONDITIONS match), do ACTION". You only draft: the',
    'operator reviews the draft in the builder form and saves it. You never save anything.',
    `Today is ${context.today}.`,
    '',
    'Triggers:',
    ...triggerLines(),
    '',
    'Timing (timingOffset, format -?N followed by d or h; days at most 365, hours at most 8760):',
    "- '0d' means immediately when the trigger fires.",
    '- kind=event triggers fire when something happens: use only 0d or a positive delay after it.',
    '- kind=scan triggers (membership_expiring, birthday, no_checkin, invoice_overdue) are found by a',
    '  daily scan: a negative offset means that many days or hours before.',
    '- membership_expiring "N days before expiry" is triggerConfig.days=N with timingOffset 0d.',
    '- no_checkin: triggerConfig.days is the number of days without a check-in.',
    '- checkin_milestone: triggerConfig.days is the check-in count to reach.',
    '',
    'Conditions (optional, at most 10, all must match):',
    ...conditionLines(options),
    '- Value shape follows the operator: in/not_in take a string array; is_empty/is_not_empty take',
    '  no value at all; number fields take a number; every other operator takes one string.',
    '- Branch, plan and tag values must come from the lists above. Never invent one.',
    '',
    'Actions:',
    ...AUTOMATION_ACTION_CATALOG.map((action) => `- ${action.value}: ${action.label}`),
    '- email: set actionConfig.subject and actionConfig.body.',
    '- sms and push_notification: actionConfig.body is the message.',
    '- create_task: actionConfig.body is the task title.',
    `- Triggers sent to the gym itself (${gymOnly}) take only the email action and no conditions.`,
    '',
    'Merge tokens (write exactly as shown, only the ones for the trigger entityType, no others):',
    ...mergeTokenLines(),
    '',
    'Limits: name at most 120 characters, subject at most 200, body at most 2000.',
    '',
    'Language:',
    "- Write name, subject, body, explanation and question in the language of the operator's",
    `  latest message. If that is unclear, use ${localeName}.`,
    '- In Georgian write natural, short sentences. Never use em/en dashes or Mtavruli capitals.',
    '',
    'Decisions:',
    `- Call exactly one tool: ${PROPOSE_RULE} or ${ASK_OPERATOR}. Never answer with plain text.`,
    `- If a branch, plan or tag the operator names is not in the lists, or the trigger is`,
    `  ambiguous, call ${ASK_OPERATOR} and list the real options. Never make one up.`,
    '- When a current form is given, edit it and send the full updated draft, not a diff.',
    '- Fill what you understood; a missing detail the operator can still set in the form is fine.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Tool input cleanup
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const NUMBER_FIELDS = new Set<string>(
  AUTOMATION_CONDITION_FIELDS.filter((field) => field.type === 'number').map((field) => field.key),
);

const blank = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

function toNumber(value: unknown): unknown {
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return value;
}

/**
 * Drop the placeholders models fill optional fields with (`null`, `""`, `{}`,
 * `days: 0`) and coerce numeric strings, so a sensible draft is not rejected
 * for its packaging. Anything still wrong is left for the validator to report.
 */
function cleanDraftInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (blank(value)) continue;
    out[key] = value;
  }

  if (isRecord(out.triggerConfig)) {
    const days = toNumber(out.triggerConfig.days);
    if (blank(days) || days === 0) delete out.triggerConfig;
    else out.triggerConfig = { days };
  }

  if (Array.isArray(out.conditions)) {
    out.conditions = (out.conditions as unknown[]).map((condition): unknown => {
      if (!isRecord(condition)) return condition;
      const next: Record<string, unknown> = {
        field: condition.field,
        operator: condition.operator,
      };
      const empty = condition.operator === 'is_empty' || condition.operator === 'is_not_empty';
      if (!empty && !blank(condition.value)) {
        next.value =
          typeof condition.field === 'string' && NUMBER_FIELDS.has(condition.field)
            ? toNumber(condition.value)
            : condition.value;
      }
      return next;
    });
  }

  if (isRecord(out.actionConfig)) {
    const config: Record<string, unknown> = {};
    if (!blank(out.actionConfig.subject)) config.subject = out.actionConfig.subject;
    if (!blank(out.actionConfig.body)) config.body = out.actionConfig.body;
    if (Object.keys(config).length === 0) delete out.actionConfig;
    else out.actionConfig = config;
  }
  return out;
}

const clip = (text: string): string => (text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text);

const cleanText = (value: unknown): string =>
  typeof value === 'string' ? clip(sanitizeGeorgianText(value).trim()) : '';

/** Clean the operator-visible text of a validated draft. */
function sanitizeDraft(draft: AutomationDraft): AutomationDraft {
  const next: AutomationDraft = { ...draft };
  if (next.name !== undefined) next.name = sanitizeGeorgianText(next.name);
  if (next.actionConfig) {
    next.actionConfig = {
      ...next.actionConfig,
      body: sanitizeGeorgianText(next.actionConfig.body),
      ...(next.actionConfig.subject !== undefined
        ? { subject: sanitizeGeorgianText(next.actionConfig.subject) }
        : {}),
    };
  }
  return next;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function buildHistory(request: AutomationAssistRequest): AgentHistoryMessage[] {
  const history: AgentHistoryMessage[] = [];
  for (const turn of request.history) {
    // Providers want the conversation to open with the user.
    if (history.length === 0 && turn.role === 'assistant') continue;
    history.push(
      turn.role === 'user'
        ? { role: 'user', text: turn.content }
        : { role: 'assistant', text: turn.content, toolCalls: [] },
    );
  }
  const draft = request.draft && Object.keys(request.draft).length > 0 ? request.draft : undefined;
  const text = draft
    ? `${request.message}\n\nCurrent form (JSON): ${JSON.stringify(draft)}`
    : request.message;
  history.push({ role: 'user', text });
  return history;
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/**
 * Turn one operator request into a rule draft or a clarifying question.
 *
 * At most {@link MAX_ATTEMPTS} model calls: a proposed draft with issues is sent
 * back once as an error tool result, and a second bad draft becomes a question.
 * A provider error moves to the next configured provider (`fallbackModels`);
 * the response's `model` is whichever one answered. When every provider fails
 * the error is thrown for the caller to map.
 */
export async function draftAutomationRule(
  request: AutomationAssistRequest,
  options: AutomationAssistOptions,
  context: AutomationAssistContext,
  model: AgentModel,
  extra: DraftAutomationRuleExtra = {},
): Promise<AutomationAssistResponse> {
  const make = extra.createDriver ?? createDriver;
  const system = buildAutomationAssistPrompt(options, context);
  const history = buildHistory(request);
  const spares = fallbackModels(model);
  let active = model;
  let driver = make(model);

  const runTurn = async (): Promise<ModelTurn> => {
    for (;;) {
      try {
        return await driver.runTurn({ system, tools: TOOLS, history, onDelta: () => {} });
      } catch (err) {
        const spare = spares.shift();
        if (!spare) throw err;
        extra.onFallback?.(active, spare, err instanceof Error ? err.message : 'unknown');
        driver = make(spare);
        active = spare;
      }
    }
  };

  const ka = context.locale === 'ka';
  let issues: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const turn = await runTurn();
    const call = turn.toolCalls[0];

    if (!call) {
      const text = cleanText(turn.text);
      return {
        kind: 'question',
        question: text || (ka ? 'დააზუსტე, რა უნდა გააკეთოს წესმა?' : 'What should the rule do?'),
        model: active.id,
      };
    }

    if (call.name === ASK_OPERATOR) {
      const question = cleanText(call.input.question);
      const proposed = isRecord(call.input.draft) ? cleanDraftInput(call.input.draft) : undefined;
      const checked =
        proposed && Object.keys(proposed).length > 0
          ? validateAutomationDraft(proposed, options)
          : undefined;
      return {
        kind: 'question',
        question: question || (ka ? 'დააზუსტე მოთხოვნა.' : 'Could you clarify the request?'),
        ...(checked && checked.issues.length === 0 && Object.keys(checked.draft).length > 0
          ? { draft: sanitizeDraft(checked.draft) }
          : {}),
        model: active.id,
      };
    }

    if (call.name === PROPOSE_RULE) {
      const { explanation, ...fields } = call.input;
      const result = validateAutomationDraft(cleanDraftInput(fields), options);
      if (result.issues.length === 0) {
        return {
          kind: 'draft',
          draft: sanitizeDraft(result.draft),
          explanation:
            cleanText(explanation) ||
            (ka ? 'წესის შავი ვერსია მზადაა.' : 'The rule draft is ready.'),
          complete: result.complete,
          model: active.id,
        };
      }
      issues = result.issues;
    } else {
      issues = [`Unknown tool: ${call.name}. Call ${PROPOSE_RULE} or ${ASK_OPERATOR}.`];
    }

    history.push({ role: 'assistant', text: turn.text, toolCalls: [call] });
    history.push({
      role: 'tool',
      results: [{ id: call.id, name: call.name, output: issues.join('\n'), isError: true }],
    });
  }

  return {
    kind: 'question',
    question: clip(
      (ka ? 'ვერ დავადგინე ზუსტად: ' : 'I could not pin this down: ') + issues.join('; '),
    ),
    model: active.id,
  };
}
