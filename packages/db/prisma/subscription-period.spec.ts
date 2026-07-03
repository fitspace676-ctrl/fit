// T5.3 — subscription billing-period arithmetic unit tests.
//
// Exercises the calendar-correct interval advance and the initial-period helper.
// Pure logic, no Prisma double — the module only does date maths. All dates are
// constructed and asserted in UTC to match how `addInterval` computes.

import { describe, expect, it } from 'vitest';
import { SubscriptionInterval } from '../generated/client';
import { addInterval, initialBillingPeriod } from './subscription-period';

/** ISO helper — build a UTC instant from a `YYYY-MM-DDT...Z` literal. */
const at = (iso: string): Date => new Date(iso);

describe('addInterval', () => {
  it('advances a MONTH to the same day-of-month next month', () => {
    expect(
      addInterval(at('2026-01-15T09:30:00.000Z'), SubscriptionInterval.MONTH).toISOString(),
    ).toBe('2026-02-15T09:30:00.000Z');
  });

  it('advances a YEAR to the same date next year', () => {
    expect(
      addInterval(at('2026-03-10T00:00:00.000Z'), SubscriptionInterval.YEAR).toISOString(),
    ).toBe('2027-03-10T00:00:00.000Z');
  });

  it('clamps a month-end overflow to the target month last day (Jan 31 -> Feb 28)', () => {
    expect(
      addInterval(at('2026-01-31T12:00:00.000Z'), SubscriptionInterval.MONTH).toISOString(),
    ).toBe('2026-02-28T12:00:00.000Z');
  });

  it('clamps into a leap February (Jan 31 2028 -> Feb 29)', () => {
    expect(
      addInterval(at('2028-01-31T00:00:00.000Z'), SubscriptionInterval.MONTH).toISOString(),
    ).toBe('2028-02-29T00:00:00.000Z');
  });

  it('clamps a leap-day YEAR advance to Feb 28 in a non-leap year', () => {
    expect(
      addInterval(at('2028-02-29T00:00:00.000Z'), SubscriptionInterval.YEAR).toISOString(),
    ).toBe('2029-02-28T00:00:00.000Z');
  });

  it('rolls a December MONTH into the next year', () => {
    expect(
      addInterval(at('2026-12-20T00:00:00.000Z'), SubscriptionInterval.MONTH).toISOString(),
    ).toBe('2027-01-20T00:00:00.000Z');
  });

  it('does not mutate its input', () => {
    const start = at('2026-01-15T00:00:00.000Z');
    addInterval(start, SubscriptionInterval.MONTH);
    expect(start.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });
});

describe('initialBillingPeriod', () => {
  it('starts at the given instant and ends one interval later', () => {
    const start = at('2026-06-01T00:00:00.000Z');
    expect(initialBillingPeriod(start, SubscriptionInterval.MONTH)).toEqual({
      currentPeriodStart: start,
      currentPeriodEnd: at('2026-07-01T00:00:00.000Z'),
    });
  });

  it('advances a YEAR plan by a full year', () => {
    const start = at('2026-06-01T00:00:00.000Z');
    expect(
      initialBillingPeriod(start, SubscriptionInterval.YEAR).currentPeriodEnd.toISOString(),
    ).toBe('2027-06-01T00:00:00.000Z');
  });
});
