import { describe, expect, it } from 'vitest';
import {
  automationAssistRequestSchema,
  automationAssistResponseSchema,
  validateAutomationDraft,
  type AutomationAssistOptions,
} from './automation-assist';

const OPTIONS: AutomationAssistOptions = {
  locations: [
    { id: 'loc-saburtalo', name: 'საბურთალო' },
    { id: 'loc-vake', name: 'Vake' },
  ],
  plans: [{ id: 'plan-gold', name: 'Gold' }],
  tags: ['vip', 'student'],
};

const fullDraft = {
  name: 'Expiry reminder',
  triggerType: 'membership_expiring',
  triggerConfig: { days: 5 },
  timingOffset: '0d',
  conditions: [{ field: 'member_branch', operator: 'eq', value: 'loc-vake' }],
  actionType: 'email',
  actionConfig: {
    subject: 'Your plan ends soon',
    body: 'Hi {{member_first_name}}, your plan ends on {{member_expiry_date}}.',
  },
};

describe('automationAssistRequestSchema', () => {
  it('rejects an empty message', () => {
    expect(automationAssistRequestSchema.safeParse({ message: '   ' }).success).toBe(false);
  });

  it('defaults the locale to ka and history to []', () => {
    const parsed = automationAssistRequestSchema.parse({ message: 'hello' });
    expect(parsed.locale).toBe('ka');
    expect(parsed.history).toEqual([]);
  });

  it('rejects more than 20 history turns', () => {
    const history = Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' }));
    expect(automationAssistRequestSchema.safeParse({ message: 'hi', history }).success).toBe(false);
  });

  it('strips tenant data smuggled into the body', () => {
    const parsed = automationAssistRequestSchema.parse({
      message: 'hi',
      gymId: 'other-gym',
      locations: [{ id: 'x', name: 'y' }],
    });
    expect(parsed).not.toHaveProperty('gymId');
    expect(parsed).not.toHaveProperty('locations');
  });
});

describe('automationAssistResponseSchema', () => {
  it('accepts a draft response', () => {
    const result = automationAssistResponseSchema.safeParse({
      kind: 'draft',
      draft: fullDraft,
      explanation: 'Sends an email five days before expiry.',
      complete: true,
      model: 'gemini-flash-lite',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a question response with or without a draft', () => {
    expect(
      automationAssistResponseSchema.safeParse({
        kind: 'question',
        question: 'Which branch?',
        model: 'haiku',
      }).success,
    ).toBe(true);
    expect(
      automationAssistResponseSchema.safeParse({
        kind: 'question',
        question: 'Which branch?',
        draft: { triggerType: 'member_joined' },
        model: 'haiku',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(
      automationAssistResponseSchema.safeParse({ kind: 'other', model: 'haiku' }).success,
    ).toBe(false);
  });
});

describe('validateAutomationDraft', () => {
  it('passes a correct, complete draft', () => {
    const result = validateAutomationDraft(fullDraft, OPTIONS);
    expect(result.issues).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.draft.triggerType).toBe('membership_expiring');
  });

  it('reports an unknown trigger type and returns an empty draft', () => {
    const result = validateAutomationDraft({ ...fullDraft, triggerType: 'moon_rising' }, OPTIONS);
    expect(result.issues.some((issue) => issue.startsWith('triggerType:'))).toBe(true);
    expect(result.draft).toEqual({});
    expect(result.complete).toBe(false);
  });

  it('reports an unknown condition field', () => {
    const result = validateAutomationDraft(
      { ...fullDraft, conditions: [{ field: 'member_shoe_size', operator: 'eq', value: '42' }] },
      OPTIONS,
    );
    expect(result.issues.some((issue) => issue.startsWith('conditions.0.field:'))).toBe(true);
  });

  it('reports an operator that does not fit the field type', () => {
    const result = validateAutomationDraft(
      { ...fullDraft, conditions: [{ field: 'member_age', operator: 'contains', value: 30 }] },
      OPTIONS,
    );
    expect(result.issues).toContain('conditions.0.operator: Operator does not match field type');
  });

  it('reports an unknown merge token', () => {
    const result = validateAutomationDraft(
      { ...fullDraft, actionConfig: { body: 'Hi {{member_nickname}}' } },
      OPTIONS,
    );
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatch(/^Unknown merge token: \{\{member_nickname\}\}\. Allowed: /);
    expect(result.complete).toBe(false);
  });

  it('rejects a token the trigger cannot fill', () => {
    const result = validateAutomationDraft(
      { ...fullDraft, actionConfig: { body: 'Class {{class_name}}' } },
      OPTIONS,
    );
    expect(result.issues[0]).toMatch(/Unknown merge token: \{\{class_name\}\}/);
  });

  it('reports an unknown branch id with the available names', () => {
    const result = validateAutomationDraft(
      {
        ...fullDraft,
        conditions: [{ field: 'member_branch', operator: 'eq', value: 'loc-unknown' }],
      },
      OPTIONS,
    );
    expect(result.issues).toEqual(['Unknown branch: loc-unknown. Available: საბურთალო, Vake']);
    expect(result.complete).toBe(false);
  });

  it('rewrites a branch name to its id', () => {
    const result = validateAutomationDraft(
      {
        ...fullDraft,
        conditions: [{ field: 'member_branch', operator: 'in', value: [' vake ', 'საბურთალო'] }],
      },
      OPTIONS,
    );
    expect(result.issues).toEqual([]);
    expect(result.draft.conditions).toEqual([
      { field: 'member_branch', operator: 'in', value: ['loc-vake', 'loc-saburtalo'] },
    ]);
  });

  it("treats another gym's branch id as unknown", () => {
    const result = validateAutomationDraft(
      {
        ...fullDraft,
        conditions: [{ field: 'member_branch', operator: 'eq', value: 'loc-other-gym' }],
      },
      { ...OPTIONS, locations: [{ id: 'loc-vake', name: 'Vake' }] },
    );
    expect(result.issues).toEqual(['Unknown branch: loc-other-gym. Available: Vake']);
  });

  it('resolves plans by name and rejects unknown tags', () => {
    const result = validateAutomationDraft(
      {
        ...fullDraft,
        conditions: [
          { field: 'subscription_plan', operator: 'eq', value: 'gold' },
          { field: 'member_tags', operator: 'contains', value: 'retired' },
        ],
      },
      OPTIONS,
    );
    expect(result.draft.conditions?.[0]?.value).toBe('plan-gold');
    expect(result.issues).toEqual(['Unknown tag: retired. Available: vip, student']);
  });

  it('rejects conditions on a gym-recipient trigger', () => {
    const result = validateAutomationDraft(
      {
        name: 'Low stock',
        triggerType: 'product_stock_low',
        actionType: 'email',
        actionConfig: { body: 'Stock is low.' },
        conditions: [{ field: 'member_age', operator: 'gt', value: 18 }],
      },
      OPTIONS,
    );
    expect(result.issues).toEqual([
      'conditions: The product_stock_low trigger does not support conditions',
    ]);
  });

  it('rejects a non-email action on a gym-recipient trigger', () => {
    const result = validateAutomationDraft(
      {
        triggerType: 'product_stock_low',
        actionType: 'sms',
        actionConfig: { body: 'Stock is low.' },
      },
      OPTIONS,
    );
    expect(result.issues).toEqual(['actionType: This trigger only supports the email action']);
  });

  it('accepts membership_expiring without days as incomplete, not wrong', () => {
    const result = validateAutomationDraft(
      { ...fullDraft, triggerConfig: undefined, conditions: [] },
      OPTIONS,
    );
    expect(result.issues).toEqual([]);
    expect(result.complete).toBe(false);
  });
});

describe('validateAutomationDraft merge aliases', () => {
  it('accepts both a current token and an old alias', () => {
    const result = validateAutomationDraft(
      {
        ...fullDraft,
        actionConfig: { body: 'Hi {{first_name}} ({{member_first_name}}), see {{expiry_date}}.' },
      },
      OPTIONS,
    );
    expect(result.issues).toEqual([]);
  });

  it('accepts the session trainer alias on a PT trigger only', () => {
    const pt = validateAutomationDraft(
      {
        name: 'PT',
        triggerType: 'pt_session_booked',
        actionType: 'email',
        actionConfig: { body: 'With {{session_trainer_name}} / {{trainer_name}}' },
      },
      OPTIONS,
    );
    expect(pt.issues).toEqual([]);
    const member = validateAutomationDraft(
      {
        ...fullDraft,
        actionConfig: { body: 'With {{session_trainer_name}}' },
      },
      OPTIONS,
    );
    expect(member.issues[0]).toMatch(/Unknown merge token: \{\{session_trainer_name\}\}/);
  });
});
