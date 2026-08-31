import { describe, expect, it } from 'vitest';
import {
  gymMemberIntakeSettingsSchema,
  gymStartDatePolicySchema,
  isStartDateWithinPolicy,
  memberSignupSchemaFor,
  startDateBounds,
} from '@fit/types';
import { startDateHintKey } from './start-date';

/**
 * The join wizard's start-date field, and the two assumptions it rests on.
 *
 * The screen adds one input and then leans on machinery it did not write: the
 * gym's intake toggles decide whether the field is required, and the gym's
 * policy decides which days it may hold. Both of those are `@fit/types`
 * behaviour, and both are load-bearing HERE — if either stops holding, the
 * wizard silently either stops asking for a date it needs or offers days the API
 * will reject with a 400 the buyer cannot act on. So the contract is pinned from
 * this side too, not only from the package's own suite.
 */

const TODAY = '2026-08-30';

describe('startDateHintKey', () => {
  it('says "today only" rather than "the next 0 days"', () => {
    expect(startDateHintKey(gymStartDatePolicySchema.parse({ maxDaysAhead: 0 }))).toBe(
      'startDateHintToday',
    );
  });

  it('still says "today only" when a zero-width window allows the past', () => {
    // Backdating within nothing is still nothing; the wording must not promise a
    // choice the calendar will not offer.
    expect(
      startDateHintKey(gymStartDatePolicySchema.parse({ maxDaysAhead: 0, allowPast: true })),
    ).toBe('startDateHintToday');
  });

  it('describes a forward-only window as forward-only', () => {
    expect(startDateHintKey(gymStartDatePolicySchema.parse({}))).toBe('startDateHintAhead');
  });

  it('describes a backdating gym symmetrically, because its window opens both ways', () => {
    expect(
      startDateHintKey(gymStartDatePolicySchema.parse({ maxDaysAhead: 14, allowPast: true })),
    ).toBe('startDateHintWindow');
  });
});

describe('the bounds the picker is given', () => {
  it('offers exactly the days the policy accepts', () => {
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 14 });
    const { min, max } = startDateBounds(policy, TODAY);
    expect(min).toBe(TODAY);
    expect(max).toBe('2026-09-13');
    // The calendar disables everything outside [min, max]; the API validates
    // with `isStartDateWithinPolicy`. The two must agree at the edges or the
    // wizard offers a day that 400s.
    expect(isStartDateWithinPolicy(min, policy, TODAY)).toBe(true);
    expect(isStartDateWithinPolicy(max, policy, TODAY)).toBe(true);
    expect(isStartDateWithinPolicy('2026-09-14', policy, TODAY)).toBe(false);
    expect(isStartDateWithinPolicy('2026-08-29', policy, TODAY)).toBe(false);
  });

  it('opens backwards as far as it reaches forward when the gym allows the past', () => {
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 14, allowPast: true });
    expect(startDateBounds(policy, TODAY)).toEqual({ min: '2026-08-16', max: '2026-09-13' });
  });

  it('collapses to a single day at maxDaysAhead 0', () => {
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 0 });
    expect(startDateBounds(policy, TODAY)).toEqual({ min: TODAY, max: TODAY });
  });

  it('rejects a blank value, which is what an untouched field holds', () => {
    // The screen's readiness check calls this with `''` before the buyer picks
    // anything, so it must be false rather than throwing.
    expect(isStartDateWithinPolicy('', gymStartDatePolicySchema.parse({}), TODAY)).toBe(false);
  });
});

describe('the signup body the screen sends', () => {
  const base = {
    gymId: 'gym_1',
    name: 'ნინო ბერიძე',
    email: 'nino@example.com',
    password: 'correct-horse',
  };

  /**
   * A gym asking for nothing but the account, plus whatever `overrides` say.
   * The other identity toggles default ON, and leaving them there would have
   * every case below fail on a missing phone number rather than on the one field
   * these tests are about.
   */
  const intakeOf = (overrides: Record<string, boolean> = {}) =>
    gymMemberIntakeSettingsSchema.parse({
      phone: false,
      gender: false,
      dateOfBirth: false,
      personalId: false,
      ...overrides,
    });

  it('is rejected without a start date once the gym asks for one', () => {
    // This is the "for free" the screen relies on: `detailsReady` runs the same
    // schema, so switching the toggle on disables the pay button until the field
    // is filled, with no branch added to the component.
    const parsed = memberSignupSchemaFor(intakeOf({ startDate: true })).safeParse({
      ...base,
      startDate: '',
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path[0] === 'startDate')).toBe(true);
  });

  it('accepts the same body once the date is there', () => {
    expect(
      memberSignupSchemaFor(intakeOf({ startDate: true })).safeParse({
        ...base,
        startDate: '2026-09-01',
      }).success,
    ).toBe(true);
  });

  it('does not require a start date from a gym that never asks', () => {
    // The field is not rendered and the key is omitted rather than sent blank —
    // "starts today", which is what the API defaults an absent one to.
    const intake = intakeOf();
    expect(intake.startDate).toBe(false);
    expect(memberSignupSchemaFor(intake).safeParse(base).success).toBe(true);
  });

  it('rejects a malformed day even from a gym that does not require one', () => {
    expect(
      memberSignupSchemaFor(intakeOf()).safeParse({ ...base, startDate: '01/09/2026' }).success,
    ).toBe(false);
  });
});
