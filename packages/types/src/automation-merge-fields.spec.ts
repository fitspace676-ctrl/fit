import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_MERGE_FIELDS,
  AUTOMATION_MERGE_GROUPS,
  AUTOMATION_MERGE_KEYS,
  RETIRED_MERGE_TOKENS,
} from './automation-merge-fields';
import { interpolateMergeFields } from './marketing';

describe('AUTOMATION_MERGE_FIELDS', () => {
  it('has unique keys and unique tokens', () => {
    const keys = AUTOMATION_MERGE_FIELDS.map((field) => field.key);
    const tokens = AUTOMATION_MERGE_FIELDS.map((field) => field.token);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('places every field in a known group', () => {
    for (const field of AUTOMATION_MERGE_FIELDS) {
      expect(AUTOMATION_MERGE_GROUPS).toContain(field.group);
    }
  });

  it('writes every token as a braced snake_case placeholder', () => {
    for (const field of AUTOMATION_MERGE_FIELDS) {
      expect(field.token).toMatch(/^\{\{[a-z0-9_]+\}\}$/);
    }
  });

  it('never offers a token it has also retired', () => {
    const offered = AUTOMATION_MERGE_FIELDS.map((field) => field.token.replace(/[{}]/g, ''));
    for (const retired of RETIRED_MERGE_TOKENS) {
      expect(offered).not.toContain(retired);
    }
  });
});

describe('merge tokens and the interpolator', () => {
  // The bug this guards: KNOWN_MERGE_KEYS once held only the marketing catalogue,
  // so an unfilled automation token was treated as a typo and passed through —
  // and a member received literal `{{member_checkin_count}}`.
  it('blanks every offered token when no value is supplied', () => {
    for (const field of AUTOMATION_MERGE_FIELDS) {
      expect(interpolateMergeFields(`x ${field.token} y`, {})).toBe('x  y');
    }
  });

  // A rule body saved before a token was retired must not start leaking braces.
  it('blanks a retired token too', () => {
    for (const token of RETIRED_MERGE_TOKENS) {
      expect(interpolateMergeFields(`x {{${token}}} y`, {})).toBe('x  y');
    }
  });

  it('still leaves a genuinely unknown token alone', () => {
    expect(interpolateMergeFields('hi {{not_a_field}}', {})).toBe('hi {{not_a_field}}');
  });

  it('lists both offered and retired tokens in AUTOMATION_MERGE_KEYS', () => {
    expect(AUTOMATION_MERGE_KEYS).toContain('member_checkin_count');
    expect(AUTOMATION_MERGE_KEYS).toContain('class_name');
  });
});

import { mergeFieldsForTrigger } from './automation-merge-fields';
import { AUTOMATION_TRIGGER_CATALOG } from './automation';

describe('contextual merge fields', () => {
  it('offers class tokens only for booking triggers and common tokens everywhere', () => {
    expect(mergeFieldsForTrigger('class_booked').map((f) => f.token)).toContain('{{class_name}}');
    expect(mergeFieldsForTrigger('member_joined').map((f) => f.token)).not.toContain(
      '{{class_name}}',
    );
    for (const trigger of AUTOMATION_TRIGGER_CATALOG) {
      expect(mergeFieldsForTrigger(trigger.value).map((f) => f.token)).toContain(
        '{{business_name}}',
      );
      expect(mergeFieldsForTrigger(trigger.value).map((f) => f.token)).toContain('{{member_age}}');
    }
    expect(mergeFieldsForTrigger('lead_created')).toEqual([]);
  });
});

describe('merge field aliases', () => {
  it('keeps every old token name known through aliases', () => {
    for (const old of [
      'member_first_name',
      'member_join_date',
      'join_date',
      'member_plan_name',
      'plan_name',
      'member_days_until_expiry',
      'payment_due_date',
      'class_trainer_name',
      'session_trainer_name',
      'class_location',
      'session_name',
      'invoice_amount',
      'invoice_date',
    ]) {
      expect(AUTOMATION_MERGE_KEYS).toContain(old);
      expect(interpolateMergeFields(`x {{${old}}} y`, {})).toBe('x  y');
    }
  });

  it('never reuses a name as both a token and an alias', () => {
    const tokens = AUTOMATION_MERGE_FIELDS.map((f) => f.token.replace(/[{}]/g, ''));
    const aliases = AUTOMATION_MERGE_FIELDS.flatMap((f) => f.aliases ?? []);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const alias of aliases) expect(tokens).not.toContain(alias);
  });

  it('drops the separate session trainer entry', () => {
    expect(AUTOMATION_MERGE_FIELDS.map((f) => f.key)).not.toContain('sessionTrainerName');
  });
});

describe('trainer and location tokens', () => {
  it('offers trainer_name and location on class and PT session triggers', () => {
    for (const trigger of ['class_booked', 'pt_session_booked'] as const) {
      const tokens = mergeFieldsForTrigger(trigger).map((f) => f.token);
      expect(tokens).toContain('{{trainer_name}}');
      expect(tokens).toContain('{{location}}');
    }
    expect(mergeFieldsForTrigger('member_joined').map((f) => f.token)).not.toContain(
      '{{trainer_name}}',
    );
  });

  it('offers cancelled_by only on PT sessions and refunds on invoice and order', () => {
    expect(mergeFieldsForTrigger('pt_session_cancelled').map((f) => f.token)).toContain(
      '{{cancelled_by}}',
    );
    expect(mergeFieldsForTrigger('class_booked').map((f) => f.token)).not.toContain(
      '{{cancelled_by}}',
    );
    expect(mergeFieldsForTrigger('refund_issued').map((f) => f.token)).toContain(
      '{{refund_amount}}',
    );
  });

  it('offers offer and staff tokens on every member trigger', () => {
    const tokens = mergeFieldsForTrigger('member_joined').map((f) => f.token);
    expect(tokens).toEqual(
      expect.arrayContaining(['{{discount_percent}}', '{{offer_code}}', '{{recipient_name}}']),
    );
  });
});
