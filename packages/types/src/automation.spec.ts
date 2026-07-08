import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TRIGGER_CATALOG,
  TRIGGERS_NEEDING_DAYS,
  automationActionConfigSchema,
  automationTriggerTypeSchema,
  createAutomationRuleSchema,
} from './automation';

describe('automation trigger catalog', () => {
  it('every catalog value is a valid trigger enum member', () => {
    for (const meta of AUTOMATION_TRIGGER_CATALOG) {
      expect(automationTriggerTypeSchema.safeParse(meta.value).success).toBe(true);
    }
  });

  it('covers all 31 triggers with unique values', () => {
    const values = AUTOMATION_TRIGGER_CATALOG.map((t) => t.value);
    expect(values).toHaveLength(31);
    expect(new Set(values).size).toBe(31);
  });

  it('flags exactly the count/day-window triggers as needing days', () => {
    expect([...TRIGGERS_NEEDING_DAYS].sort()).toEqual(
      ['checkin_milestone', 'lead_no_activity', 'membership_expiring', 'no_checkin'].sort(),
    );
  });
});

describe('createAutomationRuleSchema', () => {
  it('accepts a simple event rule with defaults', () => {
    const parsed = createAutomationRuleSchema.parse({
      name: 'Welcome',
      triggerType: 'member_joined',
      actionType: 'email',
      actionConfig: { body: 'Hi' },
    });
    expect(parsed.active).toBe(true);
    expect(parsed.timingOffset).toBe('day_of');
    expect(parsed.triggerConfig).toEqual({});
  });

  it('requires triggerConfig.days for a needs-days trigger', () => {
    const result = createAutomationRuleSchema.safeParse({
      name: 'Expiry',
      triggerType: 'membership_expiring',
      actionType: 'email',
      actionConfig: { body: 'Renew' },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['triggerConfig', 'days']);
    }
  });

  it('accepts a needs-days trigger when days is provided', () => {
    expect(
      createAutomationRuleSchema.safeParse({
        name: 'Expiry',
        triggerType: 'membership_expiring',
        triggerConfig: { days: 7 },
        actionType: 'email',
        actionConfig: { body: 'Renew' },
      }).success,
    ).toBe(true);
  });
});

describe('automationActionConfigSchema', () => {
  it('rejects an empty body', () => {
    expect(automationActionConfigSchema.safeParse({ body: '' }).success).toBe(false);
  });
});
