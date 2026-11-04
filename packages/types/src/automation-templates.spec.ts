import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_TRIGGER_CATALOG,
  TRAINER_RECIPIENT_TRIGGERS,
  createAutomationRuleSchema,
} from './automation';
import { mergeFieldNames, mergeFieldsForTrigger } from './automation-merge-fields';
import {
  AUTOMATION_BUILT_IN_TEMPLATES,
  type AutomationBuiltInTemplate,
} from './automation-templates';

const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

function ruleBody(template: AutomationBuiltInTemplate, lang: 'en' | 'ka') {
  return {
    name: template.name[lang],
    triggerType: template.triggerType,
    triggerConfig: template.triggerConfig,
    timingOffset: template.timingOffset,
    conditions: template.conditions,
    actionType: template.actionType,
    recipient: template.recipient,
    actionConfig: {
      subject: template.subject[lang],
      body: template.body[lang],
      ...(template.offer ? { offer: template.offer } : {}),
    },
  };
}

describe('AUTOMATION_BUILT_IN_TEMPLATES', () => {
  it('has the 26 spec templates with unique snake_case keys', () => {
    expect(AUTOMATION_BUILT_IN_TEMPLATES).toHaveLength(26);
    const keys = AUTOMATION_BUILT_IN_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it.each(AUTOMATION_BUILT_IN_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s is a valid rule in both languages',
    (_key, template) => {
      for (const lang of ['en', 'ka'] as const) {
        const parsed = createAutomationRuleSchema.safeParse(ruleBody(template, lang));
        expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      }
    },
  );

  it.each(AUTOMATION_BUILT_IN_TEMPLATES.map((t) => [t.key, t] as const))(
    '%s only uses tokens its trigger can fill',
    (_key, template) => {
      const allowed = new Set(mergeFieldsForTrigger(template.triggerType).flatMap(mergeFieldNames));
      const texts = [template.subject.en, template.subject.ka, template.body.en, template.body.ka];
      for (const text of texts) {
        for (const match of text.matchAll(TOKEN)) {
          expect(allowed.has(match[1]!), `${match[1]} in ${template.key}`).toBe(true);
        }
      }
    },
  );

  it('uses the same tokens in en and ka', () => {
    const tokens = (text: string) =>
      [...text.matchAll(TOKEN)].map((m) => m[1]).sort((a, b) => a!.localeCompare(b!));
    for (const t of AUTOMATION_BUILT_IN_TEMPLATES) {
      expect(new Set(tokens(t.body.ka)), t.key).toEqual(new Set(tokens(t.body.en)));
    }
  });

  it('keeps Georgian copy free of dashes and Mtavruli', () => {
    for (const t of AUTOMATION_BUILT_IN_TEMPLATES) {
      for (const text of [t.name.ka, t.subject.ka, t.body.ka]) {
        expect(text, t.key).not.toMatch(/[—–Ა-Ჿ]/);
      }
    }
  });

  it('addresses the trainer only on trainer-capable triggers', () => {
    const trainer = AUTOMATION_BUILT_IN_TEMPLATES.filter((t) => t.recipient === 'trainer');
    expect(trainer).toHaveLength(5);
    for (const t of trainer) expect(TRAINER_RECIPIENT_TRIGGERS.has(t.triggerType)).toBe(true);
  });

  it('files each template under its trigger category', () => {
    for (const t of AUTOMATION_BUILT_IN_TEMPLATES) {
      const meta = AUTOMATION_TRIGGER_CATALOG.find((entry) => entry.value === t.triggerType);
      expect(meta?.category, t.key).toBe(t.category);
    }
  });
});
