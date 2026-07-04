// T5.4 / T5.5 — recurring-billing decision-rule unit tests.
//
// Exercises `classifyDueSubscription` — the pure branch chooser the renewal job
// runs on every due subscription, including the dunning retry ladder (T5.5). No
// Prisma / clock doubles: the rule reads only the passed state and `now`. Dates are
// UTC to match the period arithmetic.

import { describe, expect, it } from 'vitest';
import { SubscriptionInterval, SubscriptionStatus } from '../generated/client';
import {
  DEFAULT_RENEWAL_RETRY_OFFSET_DAYS,
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
  paymentRetries: 0,
};

/** `base`, but past-due with `paymentRetries` failed retries so far. */
const pastDue = (paymentRetries: number): BillableSubscription => ({
  ...base,
  status: SubscriptionStatus.PAST_DUE,
  paymentRetries,
});

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

  it('prefers cancel over charge even for a past-due subscription with the ladder exhausted', () => {
    const canceling: BillableSubscription = { ...pastDue(3), cancelAtPeriodEnd: true };
    // Well past the ladder, but the member asked to cancel.
    const result = classifyDueSubscription(canceling, { now: at('2026-07-01T00:00:00.000Z') });
    expect(result).toEqual({ action: 'cancel' });
  });

  describe('dunning retry ladder', () => {
    it('waits before the first retry rung (skip on day +1 with the default 2,5,7 ladder)', () => {
      const result = classifyDueSubscription(pastDue(0), { now: at('2026-06-02T00:00:00.000Z') });
      expect(result).toEqual({ action: 'skip' });
    });

    it('retries once the first rung (+2 days) is reached', () => {
      const result = classifyDueSubscription(pastDue(0), { now: at('2026-06-03T00:00:00.000Z') });
      expect(result.action).toBe('charge');
    });

    it('treats the exact rung boundary as due (retry, not skip)', () => {
      // day +2 exactly — the +2 rung.
      const result = classifyDueSubscription(pastDue(0), { now: at('2026-06-03T00:00:00.000Z') });
      expect(result.action).toBe('charge');
    });

    it('waits between rungs (retried once, before the +5 rung → skip)', () => {
      // 1 retry done → next rung is +5 days (2026-06-06). Day +3 is still waiting.
      const result = classifyDueSubscription(pastDue(1), { now: at('2026-06-04T00:00:00.000Z') });
      expect(result).toEqual({ action: 'skip' });
    });

    it('retries on the second rung (+5 days) after one failed retry', () => {
      const result = classifyDueSubscription(pastDue(1), { now: at('2026-06-06T00:00:00.000Z') });
      expect(result.action).toBe('charge');
    });

    it('retries on the third rung (+7 days) after two failed retries', () => {
      const result = classifyDueSubscription(pastDue(2), { now: at('2026-06-08T00:00:00.000Z') });
      expect(result.action).toBe('charge');
    });

    it('expires once every rung has failed (retries == ladder length)', () => {
      const result = classifyDueSubscription(pastDue(3), { now: at('2026-06-09T00:00:00.000Z') });
      expect(result).toEqual({ action: 'expire' });
    });

    it('expires a past-due subscription whose retries exceed the ladder length', () => {
      const result = classifyDueSubscription(pastDue(9), { now: at('2026-06-30T00:00:00.000Z') });
      expect(result).toEqual({ action: 'expire' });
    });

    it('honours a custom retry ladder', () => {
      // A single-rung [1] ladder: retry on day +1, then expire on the next failure.
      const retryOffsetDays = [1];
      expect(
        classifyDueSubscription(pastDue(0), {
          now: at('2026-06-02T00:00:00.000Z'),
          retryOffsetDays,
        }).action,
      ).toBe('charge');
      expect(
        classifyDueSubscription(pastDue(1), {
          now: at('2026-06-02T00:00:00.000Z'),
          retryOffsetDays,
        }),
      ).toEqual({ action: 'expire' });
    });

    it('expires immediately on an empty ladder (no retries configured)', () => {
      const result = classifyDueSubscription(pastDue(0), {
        now: at('2026-06-01T00:00:01.000Z'),
        retryOffsetDays: [],
      });
      expect(result).toEqual({ action: 'expire' });
    });

    it('exposes a sane default ladder (+2/+5/+7)', () => {
      expect(DEFAULT_RENEWAL_RETRY_OFFSET_DAYS).toEqual([2, 5, 7]);
    });
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

  describe('trial conversion (T5.6)', () => {
    /** A TRIAL subscription whose trial ends 2026-06-01 (its `currentPeriodEnd`). */
    const trial: BillableSubscription = { ...base, status: SubscriptionStatus.TRIAL };

    it('skips a TRIAL still inside its trial window', () => {
      const result = classifyDueSubscription(trial, { now: at('2026-05-31T23:59:59.000Z') });
      expect(result).toEqual({ action: 'skip' });
    });

    it('charges a TRIAL at trial end, the first paid period running one interval from there', () => {
      // The caller converts TRIAL → ACTIVE on a successful charge; the period the
      // rule hands back starts at the trial end and runs a full month, contiguous.
      const result = classifyDueSubscription(trial, { now: at('2026-06-01T00:00:00.000Z') });
      expect(result).toEqual({
        action: 'charge',
        nextPeriodStart: at('2026-06-01T00:00:00.000Z'),
        nextPeriodEnd: at('2026-07-01T00:00:00.000Z'),
      });
    });

    it('charges nothing when the member cancelled during the trial (cancel wins)', () => {
      const canceling: BillableSubscription = { ...trial, cancelAtPeriodEnd: true };
      const result = classifyDueSubscription(canceling, { now: at('2026-06-01T02:00:00.000Z') });
      expect(result).toEqual({ action: 'cancel' });
    });
  });
});
