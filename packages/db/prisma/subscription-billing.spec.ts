// T5.4 — recurring-billing decision-rule unit tests.
//
// Exercises `classifyDueSubscription` — the pure branch chooser the renewal job
// runs on every due subscription. No Prisma / clock doubles: the rule reads only
// the passed state and `now`. Dates are UTC to match the period arithmetic.

import { describe, expect, it } from 'vitest';
import { SubscriptionInterval, SubscriptionStatus } from '../generated/client';
import {
  DEFAULT_RENEWAL_GRACE_DAYS,
  classifyDueSubscription,
  type BillableSubscription,
} from './subscription-billing';

const at = (iso: string): Date => new Date(iso);

/** A due ACTIVE monthly subscription whose period ended 2026-06-01. */
const base: BillableSubscription = {
  status: SubscriptionStatus.ACTIVE,
  currentPeriodEnd: at('2026-06-01T00:00:00.000Z'),
  interval: SubscriptionInterval.MONTH,
  cancelAtPeriodEnd: false,
};

describe('classifyDueSubscription', () => {
  it('skips a subscription whose period has not yet ended', () => {
    const result = classifyDueSubscription(base, { now: at('2026-05-31T23:59:59.000Z') });
    expect(result).toEqual({ action: 'skip' });
  });

  it('charges a due ACTIVE subscription, advancing the period contiguously', () => {
    const result = classifyDueSubscription(base, { now: at('2026-06-01T02:00:00.000Z') });
    expect(result).toEqual({
      action: 'charge',
      nextPeriodStart: at('2026-06-01T00:00:00.000Z'),
      nextPeriodEnd: at('2026-07-01T00:00:00.000Z'),
    });
  });

  it('keeps the cadence when the job runs late (period start stays the old end)', () => {
    const result = classifyDueSubscription(base, { now: at('2026-06-09T00:00:00.000Z') });
    // Next period runs from the ORIGINAL end, not from `now` — no drift.
    expect(result).toEqual({
      action: 'charge',
      nextPeriodStart: at('2026-06-01T00:00:00.000Z'),
      nextPeriodEnd: at('2026-07-01T00:00:00.000Z'),
    });
  });

  it('advances a YEAR plan by a full year', () => {
    const yearly: BillableSubscription = { ...base, interval: SubscriptionInterval.YEAR };
    const result = classifyDueSubscription(yearly, { now: at('2026-06-02T00:00:00.000Z') });
    expect(result).toEqual({
      action: 'charge',
      nextPeriodStart: at('2026-06-01T00:00:00.000Z'),
      nextPeriodEnd: at('2027-06-01T00:00:00.000Z'),
    });
  });

  it('cancels a due subscription flagged cancelAtPeriodEnd instead of charging', () => {
    const canceling: BillableSubscription = { ...base, cancelAtPeriodEnd: true };
    const result = classifyDueSubscription(canceling, { now: at('2026-06-01T02:00:00.000Z') });
    expect(result).toEqual({ action: 'cancel' });
  });

  it('prefers cancel over charge even for a past-due subscription', () => {
    const canceling: BillableSubscription = {
      ...base,
      status: SubscriptionStatus.PAST_DUE,
      cancelAtPeriodEnd: true,
    };
    // Well past the grace window, but the member asked to cancel.
    const result = classifyDueSubscription(canceling, { now: at('2026-07-01T00:00:00.000Z') });
    expect(result).toEqual({ action: 'cancel' });
  });

  it('retries (charges) a past-due subscription still inside its grace window', () => {
    const pastDue: BillableSubscription = { ...base, status: SubscriptionStatus.PAST_DUE };
    // 3 days after the elapsed end — inside the 7-day default grace.
    const result = classifyDueSubscription(pastDue, { now: at('2026-06-04T00:00:00.000Z') });
    expect(result.action).toBe('charge');
  });

  it('expires a past-due subscription once its grace window elapses', () => {
    const pastDue: BillableSubscription = { ...base, status: SubscriptionStatus.PAST_DUE };
    // 8 days after the elapsed end — past the 7-day default grace.
    const result = classifyDueSubscription(pastDue, { now: at('2026-06-09T00:00:00.000Z') });
    expect(result).toEqual({ action: 'expire' });
  });

  it('treats the exact grace boundary as still-in-grace (retry, not expire)', () => {
    const pastDue: BillableSubscription = { ...base, status: SubscriptionStatus.PAST_DUE };
    const boundary = at('2026-06-01T00:00:00.000Z');
    boundary.setUTCDate(boundary.getUTCDate() + DEFAULT_RENEWAL_GRACE_DAYS); // exactly grace end
    const result = classifyDueSubscription(pastDue, { now: boundary });
    expect(result.action).toBe('charge');
  });

  it('honours a custom grace window', () => {
    const pastDue: BillableSubscription = { ...base, status: SubscriptionStatus.PAST_DUE };
    const result = classifyDueSubscription(pastDue, {
      now: at('2026-06-02T00:00:01.000Z'),
      graceDays: 1,
    });
    expect(result).toEqual({ action: 'expire' });
  });

  it('never charges a due subscription with a zero-day grace once past-due', () => {
    const pastDue: BillableSubscription = { ...base, status: SubscriptionStatus.PAST_DUE };
    const result = classifyDueSubscription(pastDue, {
      now: at('2026-06-01T00:00:01.000Z'),
      graceDays: 0,
    });
    expect(result).toEqual({ action: 'expire' });
  });

  it.each([SubscriptionStatus.FROZEN, SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED])(
    'skips a %s subscription even when due',
    (status) => {
      const result = classifyDueSubscription(
        { ...base, status },
        { now: at('2026-07-01T00:00:00.000Z') },
      );
      expect(result).toEqual({ action: 'skip' });
    },
  );
});
