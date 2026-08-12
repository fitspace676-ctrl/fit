import { describe, expect, it } from 'vitest';
import {
  MARKETING_MERGE_FIELD_DEFS,
  MARKETING_MERGE_GROUPS,
  MARKETING_MERGE_TOKEN_NAMES,
  RETIRED_MARKETING_TOKENS,
} from './marketing-merge-fields';
import { interpolateMergeFields } from './marketing';

describe('MARKETING_MERGE_FIELD_DEFS', () => {
  it('has unique keys and unique tokens', () => {
    const keys = MARKETING_MERGE_FIELD_DEFS.map((f) => f.key);
    const tokens = MARKETING_MERGE_FIELD_DEFS.map((f) => f.token);

    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('places every field in a known group', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(MARKETING_MERGE_GROUPS).toContain(field.group);
    }
  });

  it('writes every token as a braced snake_case placeholder', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(field.token).toMatch(/^\{\{[a-z0-9_]+\}\}$/);
    }
  });

  it('gives every field a non-empty label', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(field.label.length).toBeGreaterThan(0);
    }
  });

  it('never offers a token it has also retired', () => {
    const offered = MARKETING_MERGE_FIELD_DEFS.map((f) => f.token.replace(/[{}]/g, ''));
    for (const retired of RETIRED_MARKETING_TOKENS) {
      expect(offered).not.toContain(retired);
    }
  });

  // The seven tokens the composer offered before this change and the resolver
  // already filled. Re-spelling any of them silently breaks every saved
  // campaign and template body that uses it.
  it('preserves the spelling of every token that already shipped', () => {
    const offered = MARKETING_MERGE_FIELD_DEFS.map((f) => f.token);
    for (const token of [
      '{{first_name}}',
      '{{last_name}}',
      '{{email}}',
      '{{phone}}',
      '{{plan_name}}',
      '{{expiry_date}}',
      '{{business_name}}',
    ]) {
      expect(offered).toContain(token);
    }
  });

  it('lists both offered and retired names in MARKETING_MERGE_TOKEN_NAMES', () => {
    expect(MARKETING_MERGE_TOKEN_NAMES).toContain('first_name');
    expect(MARKETING_MERGE_TOKEN_NAMES).toContain('class_name');
  });
});

describe('marketing tokens and the interpolator', () => {
  it('blanks every offered token when no value is supplied', () => {
    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(interpolateMergeFields(`x ${field.token} y`, {})).toBe('x  y');
    }
  });

  // A campaign body saved before a token was retired must not start leaking braces.
  it('blanks a retired token too', () => {
    for (const token of RETIRED_MARKETING_TOKENS) {
      expect(interpolateMergeFields(`x {{${token}}} y`, {})).toBe('x  y');
    }
  });

  it('still leaves a genuinely unknown token alone', () => {
    expect(interpolateMergeFields('hi {{not_a_field}}', {})).toBe('hi {{not_a_field}}');
  });
});
