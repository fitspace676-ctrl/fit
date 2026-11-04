import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  automationAssistRequestSchema,
  type AutomationAssistOptions,
  type AutomationAssistRequest,
} from '@fit/types';
import {
  buildAutomationAssistPrompt,
  draftAutomationRule,
  type AutomationAssistContext,
} from './automation-assist';
import type { AgentHistoryMessage, ModelDriver, ModelTurn, RunTurnArgs } from './driver';
import type { AgentModel } from './models';

const OPTIONS: AutomationAssistOptions = {
  locations: [
    { id: 'loc-saburtalo', name: 'საბურთალო' },
    { id: 'loc-vake', name: 'ვაკე' },
  ],
  plans: [{ id: 'plan-gold', name: 'Gold' }],
  tags: ['vip'],
};

const CONTEXT: AutomationAssistContext = {
  gym: { name: 'Downtown Fitness', slug: 'downtown' },
  locale: 'ka',
  today: '2026-11-04',
};

const GEMINI: AgentModel = {
  id: 'gemini-flash-lite',
  label: 'Gemini Flash-Lite',
  provider: 'google',
  modelId: 'gemini-flash-lite-latest',
};

const request = (input: Record<string, unknown>): AutomationAssistRequest =>
  automationAssistRequestSchema.parse(input);

const validRule = {
  name: 'აბონემენტის შეხსენება',
  triggerType: 'membership_expiring',
  triggerConfig: { days: 5 },
  timingOffset: '0d',
  conditions: [],
  actionType: 'email',
  actionConfig: {
    subject: 'ფასდაკლება',
    body: 'გამარჯობა {{member_first_name}}, აბონემენტი {{member_expiry_date}}-ს იწურება.',
  },
};

const propose = (input: Record<string, unknown>, id = 'call-1'): ModelTurn => ({
  text: '',
  toolCalls: [{ id, name: 'propose_rule', input }],
});

/** A driver that plays back scripted turns and records what each call saw. */
function scripted(turns: Array<ModelTurn | Error>) {
  const systems: string[] = [];
  const histories: AgentHistoryMessage[][] = [];
  const runTurn = vi.fn((args: RunTurnArgs) => {
    systems.push(args.system);
    histories.push(structuredClone(args.history));
    const next = turns.shift() ?? { text: 'nothing', toolCalls: [] };
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const driver: ModelDriver = { runTurn };
  const createDriver = vi.fn((_model: AgentModel) => driver);
  return { runTurn, createDriver, systems, histories };
}

const savedEnv = { ...process.env };

beforeEach(() => {
  // No spare provider unless a test configures one.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('draftAutomationRule', () => {
  it('returns a complete draft from one valid propose_rule call', async () => {
    const driver = scripted([propose({ ...validRule, explanation: 'მეილი წავა 5 დღით ადრე.' })]);
    const result = await draftAutomationRule(
      request({ message: 'ვისაც 5 დღეში ეწურება, მეილი' }),
      OPTIONS,
      CONTEXT,
      GEMINI,
      { createDriver: driver.createDriver },
    );
    expect(result).toMatchObject({
      kind: 'draft',
      complete: true,
      explanation: 'მეილი წავა 5 დღით ადრე.',
      model: 'gemini-flash-lite',
      draft: { triggerType: 'membership_expiring', triggerConfig: { days: 5 } },
    });
    expect(driver.runTurn).toHaveBeenCalledTimes(1);
  });

  it('sends the issues back once and accepts the repaired draft', async () => {
    const driver = scripted([
      propose({ ...validRule, actionConfig: { body: 'Hi {{nickname}}' }, explanation: 'x' }),
      propose({ ...validRule, explanation: 'გასწორდა.' }, 'call-2'),
    ]);
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
    });
    expect(result.kind).toBe('draft');
    expect(driver.runTurn).toHaveBeenCalledTimes(2);
    const second = driver.histories[1]!;
    const toolTurn = second[second.length - 1]!;
    expect(toolTurn.role).toBe('tool');
    if (toolTurn.role !== 'tool') throw new Error('expected a tool turn');
    expect(toolTurn.results[0]).toMatchObject({
      id: 'call-1',
      name: 'propose_rule',
      isError: true,
    });
    expect(toolTurn.results[0]!.output).toContain('Unknown merge token: {{nickname}}');
    expect(second[second.length - 2]).toMatchObject({ role: 'assistant' });
  });

  it('turns a second bad draft into a question', async () => {
    const bad = { ...validRule, actionConfig: { body: 'Hi {{nickname}}' }, explanation: 'x' };
    const driver = scripted([propose(bad), propose(bad, 'call-2')]);
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
    });
    expect(driver.runTurn).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe('question');
    if (result.kind !== 'question') throw new Error('expected a question');
    expect(result.question).toMatch(/^ვერ დავადგინე ზუსტად: Unknown merge token: \{\{nickname\}\}/);
  });

  it('passes ask_operator through as a question with its valid draft', async () => {
    const driver = scripted([
      {
        text: '',
        toolCalls: [
          {
            id: 'q',
            name: 'ask_operator',
            input: { question: 'რომელ ფილიალს?', draft: { triggerType: 'member_joined' } },
          },
        ],
      },
    ]);
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
    });
    expect(result).toEqual({
      kind: 'question',
      question: 'რომელ ფილიალს?',
      draft: { triggerType: 'member_joined' },
      model: 'gemini-flash-lite',
    });
  });

  it('treats a plain-text reply as a question', async () => {
    const driver = scripted([{ text: 'რა არხით გავაგზავნო?', toolCalls: [] }]);
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
    });
    expect(result).toEqual({
      kind: 'question',
      question: 'რა არხით გავაგზავნო?',
      model: 'gemini-flash-lite',
    });
  });

  it('cleans dashes and Mtavruli out of the explanation and the message', async () => {
    const driver = scripted([
      propose({
        ...validRule,
        name: 'ᲒᲐᲛᲐᲠᲯᲝᲑᲐ',
        actionConfig: { subject: 'ფასდაკლება – 10%', body: 'გამარჯობა — {{member_first_name}}' },
        explanation: 'წესი — მზადაა',
      }),
    ]);
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
    });
    if (result.kind !== 'draft') throw new Error('expected a draft');
    expect(result.explanation).toBe('წესი - მზადაა');
    expect(result.draft.name).toBe('გამარჯობა');
    expect(result.draft.actionConfig).toEqual({
      subject: 'ფასდაკლება - 10%',
      body: 'გამარჯობა - {{member_first_name}}',
    });
  });

  it("only shows this gym's branches and questions a foreign branch id", async () => {
    const foreign = {
      ...validRule,
      conditions: [{ field: 'member_branch', operator: 'eq', value: 'loc-other-gym' }],
      explanation: 'x',
    };
    const driver = scripted([propose(foreign), propose(foreign, 'call-2')]);
    const result = await draftAutomationRule(
      request({
        message: 'სხვა დარბაზის ფილიალის წევრებს',
        // Smuggled tenant data never survives the request schema.
        locations: [{ id: 'loc-other-gym', name: 'სხვა დარბაზის ფილიალი' }],
      }),
      OPTIONS,
      CONTEXT,
      GEMINI,
      { createDriver: driver.createDriver },
    );
    const system = driver.systems[0]!;
    expect(system).toContain('loc-saburtalo - საბურთალო');
    expect(system).not.toContain('სხვა დარბაზის ფილიალი');
    expect(system).not.toContain('loc-other-gym');
    expect(result.kind).toBe('question');
    if (result.kind !== 'question') throw new Error('expected a question');
    expect(result.question).toContain('Unknown branch: loc-other-gym');
  });

  it('attaches the current form and earlier turns to the history', async () => {
    const driver = scripted([propose({ ...validRule, explanation: 'ok' })]);
    await draftAutomationRule(
      request({
        message: 'დაამატე VIP პირობა',
        draft: { triggerType: 'member_joined' },
        history: [
          { role: 'assistant', content: 'stray opener' },
          { role: 'user', content: 'პირველი' },
          { role: 'assistant', content: 'მეორე' },
        ],
      }),
      OPTIONS,
      CONTEXT,
      GEMINI,
      { createDriver: driver.createDriver },
    );
    const history = driver.histories[0]!;
    expect(history.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);
    const last = history[2]!;
    if (last.role !== 'user') throw new Error('expected a user turn');
    expect(last.text).toBe(
      'დაამატე VIP პირობა\n\nCurrent form (JSON): {"triggerType":"member_joined"}',
    );
  });

  it('falls back to the next provider when the first one throws', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic';
    const driver = scripted([
      new Error('API key expired'),
      propose({ ...validRule, explanation: 'ok' }),
    ]);
    const onFallback = vi.fn();
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
      onFallback,
    });
    expect(onFallback).toHaveBeenCalledWith(
      GEMINI,
      expect.objectContaining({ id: 'haiku' }),
      'API key expired',
    );
    expect(driver.createDriver).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'haiku' }));
    expect(result.model).toBe('haiku');
  });

  it('throws when every provider fails', async () => {
    const driver = scripted([new Error('down')]);
    await expect(
      draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
        createDriver: driver.createDriver,
      }),
    ).rejects.toThrow('down');
  });

  it('coerces model placeholders before validating', async () => {
    const driver = scripted([
      propose({
        ...validRule,
        triggerConfig: { days: '5' },
        conditions: [
          { field: 'member_age', operator: 'gt', value: '30' },
          { field: 'member_tags', operator: 'is_empty', value: '' },
        ],
        actionConfig: { subject: '', body: 'გამარჯობა' },
        explanation: 'ok',
      }),
    ]);
    const result = await draftAutomationRule(request({ message: 'go' }), OPTIONS, CONTEXT, GEMINI, {
      createDriver: driver.createDriver,
    });
    if (result.kind !== 'draft') throw new Error('expected a draft');
    expect(result.draft.triggerConfig).toEqual({ days: 5 });
    expect(result.draft.conditions).toEqual([
      { field: 'member_age', operator: 'gt', value: 30 },
      { field: 'member_tags', operator: 'is_empty' },
    ]);
    expect(result.draft.actionConfig).toEqual({ body: 'გამარჯობა' });
  });
});

describe('buildAutomationAssistPrompt', () => {
  it('lists the catalog, the timing rules and the tenant options', () => {
    const prompt = buildAutomationAssistPrompt(OPTIONS, CONTEXT);
    expect(prompt).toContain('Downtown Fitness');
    expect(prompt).toContain('Today is 2026-11-04.');
    expect(prompt).toContain('- membership_expiring: Membership expiring');
    expect(prompt).toContain('membership_expiring "N days before expiry" is triggerConfig.days=N');
    expect(prompt).toContain('plan-gold - Gold');
    expect(prompt).toContain('{{class_name}}');
    expect(prompt).toContain('product_stock_low');
    expect(prompt).toContain('refer to the gym with {{business_name}}');
    expect(prompt).toContain('Never show');
  });
});
