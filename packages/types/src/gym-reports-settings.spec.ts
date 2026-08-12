import { describe, expect, it } from 'vitest';
import { REPORT_KEYS } from './reports';
import { gymReportsSettingsSchema, gymSettingsStoredSchema } from './gym-settings';

describe('gymReportsSettingsSchema', () => {
  // A report with no toggle is unhideable; a toggle with no report is a switch
  // for nothing. This is the test that catches a report added to the catalogue
  // without a matching toggle.
  it('matches REPORT_KEYS key for key', () => {
    const catalogue = [...REPORT_KEYS].sort();
    const toggles = Object.keys(gymReportsSettingsSchema.parse({})).sort();

    expect(toggles).toEqual(catalogue);
  });

  it('defaults every report on', () => {
    const parsed = gymReportsSettingsSchema.parse({});

    for (const key of REPORT_KEYS) {
      expect(parsed[key], `${key} should default on`).toBe(true);
    }
  });

  it('accepts a partial override and keeps the rest on', () => {
    const parsed = gymReportsSettingsSchema.parse({ 'refunds-detail': false });

    expect(parsed['refunds-detail']).toBe(false);
    expect(parsed['sales-summary']).toBe(true);
  });

  it('is part of the stored settings blob', () => {
    expect(gymSettingsStoredSchema.parse({}).reports['sales-summary']).toBe(true);
  });

  // Stored blobs written before this section existed must not break.
  it('defaults the whole section when it is absent from stored settings', () => {
    const stored = gymSettingsStoredSchema.parse({ brand: {} });

    expect(Object.keys(stored.reports)).toHaveLength(REPORT_KEYS.length);
  });
});
