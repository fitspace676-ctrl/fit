// The goal editor's arithmetic — the part that keeps a 400 off the screen.
//
// `.test.tsx` rather than `.spec.ts` for the reason plan §5 gives: Vitest
// includes only `lib|hooks/**/*.spec.ts`, so a spec here would run in neither
// runner.
import type { MeGoal } from '@fit/types';

import {
  MAX_GOALS,
  draftErrors,
  emptyGoal,
  goalFraction,
  isValidDraft,
  isValidSet,
  parseAmount,
  toDrafts,
  toPayload,
  type GoalDraft,
} from './goal-editor';

function draft(overrides: Partial<GoalDraft> = {}): GoalDraft {
  return {
    key: 'k',
    label: 'Workouts',
    current: '3',
    target: '12',
    unit: 'sessions',
    ...overrides,
  };
}

describe('parsing what the member typed', () => {
  it('refuses a blank rather than reading it as zero', () => {
    // `Number('')` is 0 and `Number(' ')` is 0, so a blank target would post
    // zero and be refused as non-positive — an error with no visible cause.
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
  });

  it('refuses anything that is not a finite number', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('12kg')).toBeNull();
    expect(parseAmount('Infinity')).toBeNull();
  });

  it('accepts integers and decimals, trimmed', () => {
    expect(parseAmount(' 7 ')).toBe(7);
    expect(parseAmount('2.5')).toBe(2.5);
    expect(parseAmount('0')).toBe(0);
  });
});

describe('what the server will accept', () => {
  it('needs a label', () => {
    expect(isValidDraft(draft({ label: '   ' }))).toBe(false);
  });

  it('allows a zero CURRENT and refuses a zero TARGET', () => {
    // `putMeGoalsSchema`: `current` is `nonnegative`, `target` is `positive`.
    expect(isValidDraft(draft({ current: '0' }))).toBe(true);
    expect(isValidDraft(draft({ target: '0' }))).toBe(false);
    expect(isValidDraft(draft({ target: '-1' }))).toBe(false);
  });

  it('refuses a negative current', () => {
    expect(isValidDraft(draft({ current: '-1' }))).toBe(false);
  });

  it('treats an EMPTY set as valid — a PUT with no goals clears them', () => {
    expect(isValidSet([])).toBe(true);
  });

  it('refuses a ninth goal, which is the server s own cap', () => {
    const nine = Array.from({ length: MAX_GOALS + 1 }, (_, index) =>
      draft({ key: `k${String(index)}` }),
    );
    expect(isValidSet(nine)).toBe(false);
    expect(isValidSet(nine.slice(0, MAX_GOALS))).toBe(true);
  });
});

describe('round-tripping the server s goals', () => {
  it('keeps the id as the row key, so editing does not reshuffle the list', () => {
    const goals: MeGoal[] = [
      { id: 'g1', label: 'Workouts', current: 3, target: 12, unit: 'sessions' },
    ];
    expect(toDrafts(goals)).toEqual([
      { key: 'g1', label: 'Workouts', current: '3', target: '12', unit: 'sessions' },
    ]);
  });

  it('trims on the way out, so a stray space is not the difference', () => {
    expect(toPayload([draft({ label: '  Workouts  ', unit: ' kg ' })])).toEqual({
      goals: [{ label: 'Workouts', current: 3, target: 12, unit: 'kg' }],
    });
  });

  it('mints a unique key per new row', () => {
    expect(emptyGoal().key).not.toBe(emptyGoal().key);
  });
});

describe('the progress bar', () => {
  it('is the ratio, clamped into 0..1', () => {
    expect(goalFraction(draft({ current: '3', target: '12' }))).toBe(0.25);
    expect(goalFraction(draft({ current: '99', target: '12' }))).toBe(1);
  });

  it('is zero rather than NaN or Infinity while the target is unusable', () => {
    // A member types the label first and the target last; the bar must not
    // crash the row in between.
    expect(goalFraction(draft({ target: '' }))).toBe(0);
    expect(goalFraction(draft({ target: '0' }))).toBe(0);
  });
});

describe('WHICH box is wrong', () => {
  it('names the field, not merely the row — a disabled button can never do it', () => {
    expect(draftErrors(draft())).toEqual({ label: false, current: false, target: false });
    expect(draftErrors(draft({ label: '   ' })).label).toBe(true);
    // `target` is `positive`; `current` is `nonnegative`, so zero is fine there.
    expect(draftErrors(draft({ target: '0' })).target).toBe(true);
    expect(draftErrors(draft({ current: '0' })).current).toBe(false);
    expect(draftErrors(draft({ current: '-1' })).current).toBe(true);
    // A blank is NOT zero — `Number('')` is, which is the bug `parseAmount` exists for.
    expect(draftErrors(draft({ current: '' })).current).toBe(true);
  });

  it('flags the exact field `emptyGoal()` leaves blank — the row Save could not explain', () => {
    const fresh = draftErrors(emptyGoal());
    expect(fresh.target).toBe(true);
    expect(fresh.label).toBe(true);
    expect(fresh.current).toBe(false);
  });

  it('agrees with `isValidDraft` on every row', () => {
    const rows = [
      draft(),
      draft({ label: '' }),
      draft({ target: '0' }),
      draft({ current: 'abc' }),
      emptyGoal(),
    ];
    for (const row of rows) {
      const errors = draftErrors(row);
      const anyWrong = errors.label || errors.current || errors.target;
      expect(anyWrong).toBe(!isValidDraft(row));
    }
  });
});
