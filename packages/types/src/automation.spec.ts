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

  it('covers all 25 offered triggers with unique values', () => {
    const values = AUTOMATION_TRIGGER_CATALOG.map((t) => t.value);
    expect(values).toHaveLength(25);
    expect(new Set(values).size).toBe(25);
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

import { TRAINER_RECIPIENT_TRIGGERS, automationOfferSchema } from './automation';

describe('first_class_attended and anchors', () => {
  it('lists first_class_attended as a booking event in Classes', () => {
    const meta = AUTOMATION_TRIGGER_CATALOG.find((t) => t.value === 'first_class_attended');
    expect(meta).toMatchObject({
      category: 'Classes',
      entityType: 'booking',
      kind: 'event',
      recipient: 'member',
      label: 'First class attended',
    });
    expect(automationTriggerTypeSchema.safeParse('first_class_attended').success).toBe(true);
  });

  it('anchors class_booked and pt_session_booked to the entity start', () => {
    const anchored = AUTOMATION_TRIGGER_CATALOG.filter((t) => t.anchor === 'entity_start').map(
      (t) => t.value,
    );
    expect(anchored.sort()).toEqual(['class_booked', 'pt_session_booked']);
  });
});

describe('rule recipient', () => {
  const base = {
    name: 'Rule',
    actionType: 'email' as const,
    actionConfig: { body: 'Hello' },
  };

  it('derives trainer triggers from booking and session entities', () => {
    expect(TRAINER_RECIPIENT_TRIGGERS.has('class_booked')).toBe(true);
    expect(TRAINER_RECIPIENT_TRIGGERS.has('pt_session_cancelled')).toBe(true);
    expect(TRAINER_RECIPIENT_TRIGGERS.has('first_class_attended')).toBe(true);
    expect(TRAINER_RECIPIENT_TRIGGERS.has('member_joined')).toBe(false);
  });

  it('defaults to member', () => {
    const parsed = createAutomationRuleSchema.parse({ ...base, triggerType: 'member_joined' });
    expect(parsed.recipient).toBe('member');
  });

  it('accepts a trainer on a class trigger', () => {
    const parsed = createAutomationRuleSchema.safeParse({
      ...base,
      triggerType: 'class_booked',
      recipient: 'trainer',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a trainer on a member trigger', () => {
    const parsed = createAutomationRuleSchema.safeParse({
      ...base,
      triggerType: 'member_joined',
      recipient: 'trainer',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]).toMatchObject({
      path: ['recipient'],
      message: 'recipientNotAllowed',
    });
  });

  it('checks the pair on update and keeps recipient optional there', () => {
    expect(
      updateAutomationRuleSchema.safeParse({ triggerType: 'member_joined', recipient: 'trainer' })
        .success,
    ).toBe(false);
    expect(updateAutomationRuleSchema.parse({ name: 'x' }).recipient).toBeUndefined();
  });
});

describe('automationOfferSchema', () => {
  it('accepts an empty offer and every field at its limits', () => {
    expect(automationOfferSchema.safeParse({}).success).toBe(true);
    expect(
      automationOfferSchema.safeParse({
        discountPercent: 100,
        bonusPoints: 100000,
        offerCode: 'x'.repeat(40),
        offerExpiry: '2026-12-31',
      }).success,
    ).toBe(true);
    expect(automationOfferSchema.safeParse({ discountPercent: 0, bonusPoints: 0 }).success).toBe(
      true,
    );
  });

  it.each([
    { discountPercent: -1 },
    { discountPercent: 101 },
    { bonusPoints: 100001 },
    { bonusPoints: 1.5 },
    { offerCode: 'x'.repeat(41) },
    { offerExpiry: '31/12/2026' },
  ])('rejects %o', (offer) => {
    expect(automationOfferSchema.safeParse(offer).success).toBe(false);
  });

  it('rides along in actionConfig', () => {
    const parsed = automationActionConfigSchema.parse({ body: 'x', offer: { bonusPoints: 50 } });
    expect(parsed.offer).toEqual({ bonusPoints: 50 });
  });
});
