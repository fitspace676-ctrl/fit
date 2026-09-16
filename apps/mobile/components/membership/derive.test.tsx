// The membership arithmetic — the module that exists because of `22 / 30`.
//
// A `.test.tsx` rather than a `.spec.ts` even though nothing here renders:
// `vitest.config.ts` includes only `lib|hooks/**/*.spec.ts`, so a spec under
// `components/` would be run by NEITHER runner. The extension is the boundary
// (plan §5), and jest is the side `components/**` is on.
import type { CreditPackSummary, MeSubscription } from '@fit/types';

import {
  ACTIVE_STATUSES,
  billingPeriodProgress,
  creditBalance,
  freezeAllowance,
  freezeOptions,
  hasLivePlan,
  isFrozen,
  isSetToCancel,
  periodPercent,
} from './derive';

const DAY = 86_400_000;
const T0 = new Date('2026-08-01T00:00:00.000Z');

function sub(overrides: Partial<MeSubscription> = {}): MeSubscription {
  return {
    id: 'sub_1',
    status: 'ACTIVE',
    planName: 'Premium',
    priceAmount: 5000,
    currency: 'GEL',
    interval: 'MONTH',
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-08-31T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    frozenAt: null,
    frozenUntil: null,
    freezeDaysPerPeriod: 30,
    freezeDaysUsed: 0,
    freezeDaysRemaining: 30,
    memberSince: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('which statuses mean "this member has a plan"', () => {
  it('counts PAST_DUE — the plan is live, the PAYMENT is what is wrong', () => {
    expect(hasLivePlan(sub({ status: 'PAST_DUE' }))).toBe(true);
  });

  it('counts CANCELED while the period has not lapsed', () => {
    // A cancelled-but-unexpired plan is still in force; the PERIOD ends it, not
    // the status. Same set as `apps/web`'s dashboard, on purpose.
    expect(hasLivePlan(sub({ status: 'CANCELED' }))).toBe(true);
  });

  it('does not count FROZEN or EXPIRED', () => {
    expect(hasLivePlan(sub({ status: 'FROZEN' }))).toBe(false);
    expect(hasLivePlan(sub({ status: 'EXPIRED' }))).toBe(false);
  });

  it('does not count "no subscription at all"', () => {
    expect(hasLivePlan(null)).toBe(false);
    expect(hasLivePlan(undefined)).toBe(false);
  });

  it('names exactly four statuses, so adding a fifth is a deliberate act', () => {
    expect([...ACTIVE_STATUSES]).toEqual(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED']);
  });
});

describe('the billing period', () => {
  it('subtracts two instants rather than asserting 22 of 30', () => {
    const period = billingPeriodProgress(sub(), new Date(T0.getTime() + 10 * DAY));
    expect(period).toEqual({ daysUsed: 10, daysTotal: 30, daysLeft: 20, hasPeriod: true });
    expect(periodPercent(period)).toBe(33);
  });

  it('clamps a period the member is past the end of', () => {
    const period = billingPeriodProgress(sub(), new Date(T0.getTime() + 99 * DAY));
    expect(period.daysUsed).toBe(30);
    expect(period.daysLeft).toBe(0);
  });

  it('clamps a period that has not started', () => {
    const period = billingPeriodProgress(sub(), new Date(T0.getTime() - 5 * DAY));
    expect(period.daysUsed).toBe(0);
    expect(period.daysLeft).toBe(30);
  });

  it.each([
    ['no subscription', null],
    ['empty instants', sub({ currentPeriodStart: '', currentPeriodEnd: '' })],
    ['unparseable instants', sub({ currentPeriodStart: 'soon', currentPeriodEnd: 'later' })],
    ['an end before its start', sub({ currentPeriodEnd: '2026-07-01T00:00:00.000Z' })],
  ])('answers "draw nothing" for %s', (_name, subscription) => {
    // Every one of these produces a NaN width otherwise, which React Native
    // renders as a crash rather than as a wrong bar.
    const period = billingPeriodProgress(subscription, T0);
    expect(period.hasPeriod).toBe(false);
    // `null`, NOT `0` — the caller removes the meter instead of drawing an
    // empty one, because a bar at zero reads as "your membership is spent".
    expect(periodPercent(period)).toBeNull();
  });
});

describe('the cancel notice', () => {
  it('is a status, and the only thing derived from `cancelAtPeriodEnd`', () => {
    // There is no member route that writes this field — enroll / freeze /
    // unfreeze are the only three (plan §7) — so nothing in this module turns
    // it into an action.
    expect(isSetToCancel(sub({ cancelAtPeriodEnd: true }))).toBe(true);
    expect(isSetToCancel(sub())).toBe(false);
    expect(isSetToCancel(null)).toBe(false);
  });
});

describe('freeze', () => {
  it('reads the allowance off the payload rather than discovering it as a 400', () => {
    const allowance = freezeAllowance(
      sub({ freezeDaysPerPeriod: 30, freezeDaysUsed: 25, freezeDaysRemaining: 5 }),
    );
    expect(allowance).toEqual({
      perPeriod: 30,
      used: 25,
      remaining: 5,
      offered: true,
      available: true,
    });
  });

  it('separates "your plan has no freezes" from "you have used them all"', () => {
    // Two different sentences in the catalogue, so two different flags.
    const none = freezeAllowance(
      sub({ freezeDaysPerPeriod: 0, freezeDaysUsed: 0, freezeDaysRemaining: 0 }),
    );
    expect(none.offered).toBe(false);

    const spent = freezeAllowance(
      sub({ freezeDaysPerPeriod: 14, freezeDaysUsed: 14, freezeDaysRemaining: 0 }),
    );
    expect(spent.offered).toBe(true);
    expect(spent.available).toBe(false);
  });

  it('offers only durations the member can actually spend', () => {
    expect(freezeOptions(60).map((option) => option.days)).toEqual([14, 30, 60]);
    expect(freezeOptions(30).map((option) => option.days)).toEqual([14, 30]);
    expect(freezeOptions(14).map((option) => option.days)).toEqual([14]);
  });

  it('offers the remainder when every named option is too long', () => {
    // Offering 14 days and having the server refuse it is exactly what the
    // allowance fields exist to prevent.
    expect(freezeOptions(9)).toEqual([{ days: 9, key: null }]);
  });

  it('offers nothing at all when there is nothing left', () => {
    expect(freezeOptions(0)).toEqual([]);
  });

  it('reports a frozen plan', () => {
    expect(isFrozen(sub({ status: 'FROZEN' }))).toBe(true);
    expect(isFrozen(sub())).toBe(false);
  });
});

describe('credit packs', () => {
  function pack(overrides: Partial<CreditPackSummary>): CreditPackSummary {
    return {
      id: 'cp',
      totalCredits: 10,
      remainingCredits: 10,
      expiresAt: null,
      planTitle: null,
      ...overrides,
    };
  }

  it('sums every pack the member holds, not just the first', () => {
    expect(
      creditBalance([
        pack({ id: 'a', totalCredits: 5, remainingCredits: 2 }),
        pack({ id: 'b', totalCredits: 10, remainingCredits: 7 }),
      ]),
    ).toEqual({ remaining: 9, total: 15, hasPacks: true });
  });

  it('distinguishes "no packs" from "packs, all spent"', () => {
    expect(creditBalance([])).toEqual({ remaining: 0, total: 0, hasPacks: false });
    expect(creditBalance([pack({ remainingCredits: 0 })])).toEqual({
      remaining: 0,
      total: 10,
      hasPacks: true,
    });
  });

  it('survives an undefined payload', () => {
    expect(creditBalance(undefined).remaining).toBe(0);
  });
});
