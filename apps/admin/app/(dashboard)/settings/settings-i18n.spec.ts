import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';

const FIELD_KEYS = [
  'name',
  'surname',
  'email',
  'phone',
  'gender',
  'dateOfBirth',
  'address',
  'emergencyContact',
  'membershipPlan',
  'paymentMethod',
  'medicalNotes',
  'tags',
] as const;

describe('member-intake settings i18n', () => {
  for (const locale of [en, ka] as const) {
    const m = locale.admin.settings.membership;
    it('has title/subtitle/requiredWarning + every field label', () => {
      expect(typeof m.title).toBe('string');
      expect(typeof m.subtitle).toBe('string');
      expect(typeof m.requiredWarning).toBe('string');
      for (const key of FIELD_KEYS) expect(typeof m.fields[key]).toBe('string');
    });
    it('no longer has grace-period keys', () => {
      expect('gracePeriodLabel' in m).toBe(false);
    });
  }
});
