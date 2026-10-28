import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TRIGGER_CATALOG,
  GYM_RECIPIENT_TRIGGERS,
  TRIGGERS_NEEDING_DAYS,
  automationActionConfigSchema,
  automationTriggerTypeSchema,
  createAutomationRuleSchema,
  listAutomationRulesQuerySchema,
  updateAutomationRuleSchema,
} from './automation';

describe('automation trigger catalog', () => {
  it('every catalog value is a valid trigger enum member', () => {
    for (const meta of AUTOMATION_TRIGGER_CATALOG) {
      expect(automationTriggerTypeSchema.safeParse(meta.value).success).toBe(true);
    }
  });

  it('covers all 24 offered triggers with unique values', () => {
    const values = AUTOMATION_TRIGGER_CATALOG.map((t) => t.value);
    expect(values).toHaveLength(24);
    expect(new Set(values).size).toBe(24);
  });

  it('leaves out the triggers nothing fires yet', () => {
    const values: string[] = AUTOMATION_TRIGGER_CATALOG.map((t) => t.value);
    for (const missing of ['plan_upgraded', 'plan_downgraded', 'lead_created']) {
      expect(values).not.toContain(missing);
    }
  });

  it('fires membership_expired as an event, not a period-end scan', () => {
    const expired = AUTOMATION_TRIGGER_CATALOG.find((t) => t.value === 'membership_expired');
    expect(expired).toMatchObject({ kind: 'event', entityType: 'subscription' });
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
    expect(parsed.timingOffset).toBe('0d');
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

describe('gym-recipient triggers', () => {
  it('addresses only product_stock_low to the gym', () => {
    expect([...GYM_RECIPIENT_TRIGGERS]).toEqual(['product_stock_low']);
    for (const meta of AUTOMATION_TRIGGER_CATALOG) {
      expect(meta.recipient).toBe(meta.value === 'product_stock_low' ? 'gym' : 'member');
    }
  });

  const stockRule = {
    name: 'Stock low',
    triggerType: 'product_stock_low',
    actionConfig: { body: 'Restock' },
  };

  it('accepts the email action on a gym-recipient trigger', () => {
    expect(
      createAutomationRuleSchema.safeParse({ ...stockRule, actionType: 'email' }).success,
    ).toBe(true);
  });

  it.each(['push_notification', 'sms', 'create_task'])('rejects %s on create', (actionType) => {
    const result = createAutomationRuleSchema.safeParse({ ...stockRule, actionType });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['actionType']);
      expect(result.error.issues[0]?.message).toBe('This trigger only supports the email action');
    }
  });

  it('rejects a non-email action on update when both fields arrive', () => {
    const result = updateAutomationRuleSchema.safeParse({
      triggerType: 'product_stock_low',
      actionType: 'sms',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['actionType']);
  });

  it('leaves a lone update field to the server-side merged check', () => {
    expect(updateAutomationRuleSchema.safeParse({ actionType: 'sms' }).success).toBe(true);
    expect(updateAutomationRuleSchema.safeParse({ triggerType: 'product_stock_low' }).success).toBe(
      true,
    );
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
