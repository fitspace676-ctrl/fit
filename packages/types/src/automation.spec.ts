import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TRIGGER_CATALOG,
  TRIGGERS_NEEDING_DAYS,
  automationActionConfigSchema,
  automationTriggerTypeSchema,
  createAutomationRuleSchema,
  listAutomationRulesQuerySchema,
} from './automation';

describe('automation trigger catalog', () => {
  it('every catalog value is a valid trigger enum member', () => {
    for (const meta of AUTOMATION_TRIGGER_CATALOG) {
      expect(automationTriggerTypeSchema.safeParse(meta.value).success).toBe(true);
    }
  });

  it('covers all 26 triggers with unique values', () => {
    const values = AUTOMATION_TRIGGER_CATALOG.map((t) => t.value);
    expect(values).toHaveLength(26);
    expect(new Set(values).size).toBe(26);
  });

  it('flags exactly the count/day-window triggers as needing days', () => {
    expect([...TRIGGERS_NEEDING_DAYS].sort()).toEqual(
      ['checkin_milestone', 'membership_expiring', 'no_checkin'].sort(),
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

describe('listAutomationRulesQuerySchema', () => {
  it('applies pagination + sort defaults for a bare query', () => {
    const parsed = listAutomationRulesQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sort).toBe('createdAt');
    expect(parsed.dir).toBe('desc');
    expect(parsed.active).toBeUndefined();
  });

  it('coerces the active flag from the query string in both directions', () => {
    // A URL always carries strings — `active=false` must mean inactive, not the
    // `Boolean('false') === true` footgun of `z.coerce.boolean()`.
    expect(listAutomationRulesQuerySchema.parse({ active: 'true' }).active).toBe(true);
    expect(listAutomationRulesQuerySchema.parse({ active: 'false' }).active).toBe(false);
    expect(listAutomationRulesQuerySchema.parse({ active: '1' }).active).toBe(true);
    expect(listAutomationRulesQuerySchema.parse({ active: '0' }).active).toBe(false);
    expect(listAutomationRulesQuerySchema.parse({ active: true }).active).toBe(true);
  });

  it('rejects a non-boolean active flag', () => {
    expect(listAutomationRulesQuerySchema.safeParse({ active: 'maybe' }).success).toBe(false);
  });
});
