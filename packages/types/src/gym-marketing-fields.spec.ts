import { describe, expect, it } from 'vitest';
import { MARKETING_MERGE_FIELD_DEFS } from './marketing-merge-fields';
import { gymMarketingFieldsSettingsSchema, gymSettingsStoredSchema } from './gym-settings';

describe('gymMarketingFieldsSettingsSchema', () => {
  // A field in the catalogue with no toggle is unhideable; a toggle with no field
  // is a switch for nothing.
  it('matches the catalogue key for key', () => {
    const catalogue = MARKETING_MERGE_FIELD_DEFS.map((f) => f.key).sort();
    const toggles = Object.keys(gymMarketingFieldsSettingsSchema.parse({})).sort();

    expect(toggles).toEqual(catalogue);
  });

  it('defaults every field on', () => {
    const parsed = gymMarketingFieldsSettingsSchema.parse({});

    for (const field of MARKETING_MERGE_FIELD_DEFS) {
      expect(parsed[field.key as keyof typeof parsed]).toBe(true);
    }
  });

  it('is part of the stored settings blob', () => {
    const stored = gymSettingsStoredSchema.parse({});

    expect(stored.marketingFields.firstName).toBe(true);
  });
});
