import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_MERGE_FIELDS,
  AUTOMATION_MERGE_GROUPS,
  AUTOMATION_MERGE_KEYS,
  RETIRED_MERGE_TOKENS,
} from './automation-merge-fields';
import { gymAutomationFieldsSettingsSchema } from './gym-settings';
import { interpolateMergeFields } from './marketing';

describe('AUTOMATION_MERGE_FIELDS', () => {
  // The settings schema is what lets a gym hide a chip. A field in the catalogue
  // with no toggle is unhideable; a toggle with no field is a switch for nothing.
  it('matches the settings schema key for key', () => {
    const catalogue = AUTOMATION_MERGE_FIELDS.map((field) => field.key).sort();
    const toggles = Object.keys(gymAutomationFieldsSettingsSchema.parse({})).sort();

    expect(catalogue).toEqual(toggles);
  });

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
