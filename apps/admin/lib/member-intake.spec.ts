// @fit/admin — Add-Member intake helpers.
//
// The start-date window is the one piece of member-intake config that is not a
// boolean, and it is the piece the console and the API have to agree on to the
// day: the form offers `[min, max]` as the picker's bounds, and the API rejects
// anything outside the bounds IT derives. A drift of one day between them is a
// save that fails on a date the desk was offered.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { gymStartDatePolicySchema, isStartDateWithinPolicy } from '@fit/types';
import { composeName, gymStartDateWindow, memberIntakeConfig } from './member-intake';

/** A fixed instant: 2026-08-30 22:00 UTC — already 2026-08-31 in Tbilisi (UTC+4). */
const NOW = new Date('2026-08-30T22:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
});

/** Freeze the clock so "today" is a value the assertions can name. */
function freeze(): void {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
}

describe('gymStartDateWindow', () => {
  it("anchors on today in the GYM's zone, not the runtime's", () => {
    freeze();
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 0 });
    // The same instant is two different calendar days in these two zones, which
    // is exactly the case a browser-side `new Date()` would get wrong for a
    // manager signed in from another country.
    expect(gymStartDateWindow(policy, 'Asia/Tbilisi')).toEqual({
      min: '2026-08-31',
      max: '2026-08-31',
    });
    expect(gymStartDateWindow(policy, 'UTC')).toEqual({ min: '2026-08-30', max: '2026-08-30' });
  });

  it('opens the window forward only while backdating is off', () => {
    freeze();
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 14, allowPast: false });
    expect(gymStartDateWindow(policy, 'UTC')).toEqual({ min: '2026-08-30', max: '2026-09-13' });
  });

  it('opens it as far back as it reaches forward once backdating is allowed', () => {
    freeze();
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 14, allowPast: true });
    expect(gymStartDateWindow(policy, 'UTC')).toEqual({ min: '2026-08-16', max: '2026-09-13' });
  });

  it('agrees with the validator the API applies to the same day', () => {
    freeze();
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 3 });
    const { min, max } = gymStartDateWindow(policy, 'UTC');
    // Both ends are offerable, and the day past each end is not — the console and
    // the API reading the same policy must not disagree by a day at the edges.
    for (const day of [min, max]) {
      expect(isStartDateWithinPolicy(day, policy, '2026-08-30')).toBe(true);
    }
    expect(isStartDateWithinPolicy('2026-09-03', policy, '2026-08-30')).toBe(false);
  });

  it('falls back to the runtime zone rather than throwing on an unknown one', () => {
    freeze();
    const policy = gymStartDatePolicySchema.parse({ maxDaysAhead: 0 });
    // A hand-edited settings blob can carry a zone `Intl` refuses; a roster that
    // will not render is a worse answer than a date in the server's own zone.
    expect(() => gymStartDateWindow(policy, 'Mars/Olympus_Mons')).not.toThrow();
  });
});

describe('memberIntakeConfig', () => {
  it('falls back to the contract defaults when the settings call failed', () => {
    freeze();
    const config = memberIntakeConfig(null);
    // Off by default: a gym that has never opened Settings is not suddenly asked
    // when its memberships begin.
    expect(config.intake.startDate).toBe(false);
    expect(config.intake.name).toBe(true);
    // The default 14-day window still resolves, so the picker is bounded even
    // though nothing is currently asking it for a date.
    expect(config.startDateWindow).toEqual({ min: '2026-08-31', max: '2026-09-14' });
  });
});

describe('composeName', () => {
  it('joins the two inputs and drops an empty half', () => {
    expect(composeName('Ana', 'Beridze')).toBe('Ana Beridze');
    expect(composeName('  Ana ', '')).toBe('Ana');
  });
});
