// T8.4 — subscription freeze policy unit tests.
//
// Exercises the allowance check and the resume-compensation maths. Pure logic, no
// Prisma double — the policy only does arithmetic over days/dates.

import { describe, expect, it } from 'vitest';
import {
  addDays,
  DEFAULT_FREEZE_DAYS_PER_PERIOD,
  evaluateFreezeAllowance,
  freezeUntil,
  MS_PER_DAY,
  resumeExtensionDays,
} from './subscription-freeze-policy';

describe('evaluateFreezeAllowance', () => {
  it('allows a request that fits within the remaining allowance', () => {
    expect(
      evaluateFreezeAllowance({ freezeDaysPerPeriod: 14, freezeDaysUsed: 0, durationDays: 10 }),
    ).toEqual({ allowed: true, remainingDays: 14 });
  });

  it('allows a request that exactly exhausts the allowance', () => {
    expect(
      evaluateFreezeAllowance({ freezeDaysPerPeriod: 14, freezeDaysUsed: 4, durationDays: 10 }),
    ).toEqual({ allowed: true, remainingDays: 10 });
  });

  it('rejects a request that overruns the allowance and reports the remainder', () => {
    // The plan's verify case: cap 14, 10 already used, asking for 5 more → only 4
    // left, so the second freeze is refused with remainingDays: 4.
    expect(
      evaluateFreezeAllowance({ freezeDaysPerPeriod: 14, freezeDaysUsed: 10, durationDays: 5 }),
    ).toEqual({ allowed: false, remainingDays: 4 });
  });

  it('never reports a negative remainder when usage already exceeds the cap', () => {
    expect(
      evaluateFreezeAllowance({ freezeDaysPerPeriod: 14, freezeDaysUsed: 20, durationDays: 1 }),
    ).toEqual({ allowed: false, remainingDays: 0 });
  });

  it('rejects every freeze when the plan disables freezing (cap 0)', () => {
    expect(
      evaluateFreezeAllowance({ freezeDaysPerPeriod: 0, freezeDaysUsed: 0, durationDays: 1 }),
    ).toEqual({ allowed: false, remainingDays: 0 });
  });

  it('rejects a non-positive duration', () => {
    expect(
      evaluateFreezeAllowance({ freezeDaysPerPeriod: 30, freezeDaysUsed: 0, durationDays: 0 }),
    ).toMatchObject({ allowed: false });
  });

  it('defaults the allowance to 30 days', () => {
    expect(DEFAULT_FREEZE_DAYS_PER_PERIOD).toBe(30);
  });
});

describe('addDays / freezeUntil', () => {
  const start = new Date('2026-06-10T00:00:00.000Z');

  it('advances a date by whole days without mutating the input', () => {
    const out = addDays(start, 10);
    expect(out.toISOString()).toBe('2026-06-20T00:00:00.000Z');
    expect(start.toISOString()).toBe('2026-06-10T00:00:00.000Z');
  });

  it('computes the auto-resume instant as start + duration', () => {
    expect(freezeUntil(start, 10).getTime()).toBe(start.getTime() + 10 * MS_PER_DAY);
  });
});

describe('resumeExtensionDays', () => {
  const frozenAt = new Date('2026-06-10T00:00:00.000Z');
  const frozenUntilDate = addDays(frozenAt, 10);

  it('credits the full duration when resumed at the scheduled end', () => {
    expect(resumeExtensionDays(frozenAt, frozenUntilDate, frozenUntilDate)).toBe(10);
  });

  it('credits only the elapsed days on an early unfreeze', () => {
    const now = addDays(frozenAt, 3);
    expect(resumeExtensionDays(frozenAt, frozenUntilDate, now)).toBe(3);
  });

  it('never credits more than the booked duration when resumed late', () => {
    const now = addDays(frozenAt, 99);
    expect(resumeExtensionDays(frozenAt, frozenUntilDate, now)).toBe(10);
  });

  it('credits nothing when resumed at or before the freeze began', () => {
    expect(resumeExtensionDays(frozenAt, frozenUntilDate, frozenAt)).toBe(0);
    expect(resumeExtensionDays(frozenAt, frozenUntilDate, addDays(frozenAt, -1))).toBe(0);
  });
});
