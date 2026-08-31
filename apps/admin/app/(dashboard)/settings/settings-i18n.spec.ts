import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';

const FIELD_KEYS = [
  'name',
  'surname',
  'email',
  'phone',
  'gender',
  'dateOfBirth',
  // The membership's own start day. Added with `startDatePolicy` below, which is
  // meaningless without it — pin the label so the toggle that arms that window
  // cannot go missing the way `personalId` once did.
  'startDate',
  // National ID had a schema flag but no Settings control, so it could never be
  // switched on — which silently broke intake parity between the roster and the
  // POS till. Pin its label so the toggle cannot go missing again.
  'personalId',
  'address',
  'emergencyContact',
  'membershipPlan',
  'paymentMethod',
  'medicalNotes',
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

/**
 * The start-date window's own copy. Every key is pinned because two of them do
 * work no other setting's copy does: `maxDaysAheadToday` is the sentence that
 * stops `0` reading as "disabled", and `disabledHint` is what tells a gym why the
 * controls are inert. A missing label here would leave the card silently wrong
 * rather than visibly broken.
 */
const START_DATE_POLICY_KEYS = [
  'title',
  'subtitle',
  'maxDaysAheadLabel',
  'maxDaysAheadHint',
  'maxDaysAheadToday',
  'maxDaysAheadDays',
  'allowPastLabel',
  'allowPastDesc',
  'disabledHint',
] as const;

describe('start-date window settings i18n', () => {
  for (const locale of [en, ka] as const) {
    const policy = locale.admin.settings.startDatePolicy as Record<string, unknown>;
    it.each(START_DATE_POLICY_KEYS)('has "%s"', (key) => {
      expect(typeof policy[key]).toBe('string');
    });
  }

  it('interpolates the day count rather than hard-coding a number', () => {
    for (const locale of [en, ka] as const) {
      expect(locale.admin.settings.startDatePolicy.maxDaysAheadDays).toContain('{days}');
    }
  });
});
