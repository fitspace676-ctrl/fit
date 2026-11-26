import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '@fit/db';
import {
  churnMoment,
  liveCountAt,
  liveMembersAt,
  wasLiveAt,
  type SubscriptionTimelineRow,
} from './subscription-timeline.util';

const JAN = new Date('2026-01-01T00:00:00.000Z');
const FEB = new Date('2026-02-01T00:00:00.000Z');
const MAR = new Date('2026-03-01T00:00:00.000Z');
const APR = new Date('2026-04-01T00:00:00.000Z');
const NOW = new Date('2026-02-15T00:00:00.000Z');

function sub(over: Partial<SubscriptionTimelineRow> = {}): SubscriptionTimelineRow {
  return {
    memberId: 'm1',
    status: SubscriptionStatus.ACTIVE,
    createdAt: JAN,
    canceledAt: null,
    updatedAt: JAN,
    currentPeriodStart: JAN,
    currentPeriodEnd: APR,
    ...over,
  };
}

describe('subscription timeline', () => {
  it('dates a cancellation by canceledAt, falling back to updatedAt, within its period', () => {
    expect(
      churnMoment(sub({ status: SubscriptionStatus.CANCELED, canceledAt: FEB, updatedAt: MAR })),
    ).toEqual(FEB);
    expect(
      churnMoment(sub({ status: SubscriptionStatus.CANCELED, canceledAt: null, updatedAt: MAR })),
    ).toEqual(MAR);
    expect(
      churnMoment(
        sub({ status: SubscriptionStatus.CANCELED, canceledAt: APR, currentPeriodEnd: MAR }),
      ),
    ).toEqual(MAR);
  });

  // An import (or any later edit) touches `updatedAt` long after the membership
  // ran out; dating the expiry by it put every historic expiry on import day.
  it('dates an expiry by its period end, not by a later updatedAt', () => {
    const expired = sub({
      status: SubscriptionStatus.EXPIRED,
      currentPeriodEnd: FEB,
      updatedAt: APR,
    });
    expect(churnMoment(expired)).toEqual(FEB);
  });

  it('ends a live-status row at its period end and leaves a frozen one open', () => {
    expect(churnMoment(sub({ currentPeriodEnd: MAR }))).toEqual(MAR);
    expect(churnMoment(sub({ status: SubscriptionStatus.FROZEN }))).toBeNull();
  });

  it('is not in force before it existed, nor before a scheduled period starts', () => {
    expect(wasLiveAt(sub({ createdAt: FEB, currentPeriodStart: FEB }), JAN, NOW)).toBe(false);
    const scheduled = sub({ createdAt: JAN, currentPeriodStart: MAR });
    expect(wasLiveAt(scheduled, NOW, NOW)).toBe(false);
  });

  // The #441 rule: the status column alone does not make a membership live.
  it('is not in force once its period is over, whatever the status says', () => {
    const lapsed = sub({ currentPeriodEnd: FEB });
    expect(wasLiveAt(lapsed, FEB, NOW)).toBe(true);
    expect(wasLiveAt(lapsed, NOW, NOW)).toBe(false);
  });

  it('is in force up to and including its churn instant, and not after', () => {
    const canceled = sub({ status: SubscriptionStatus.CANCELED, canceledAt: MAR });
    expect(wasLiveAt(canceled, FEB, NOW)).toBe(true);
    expect(wasLiveAt(canceled, MAR, NOW)).toBe(true);
    expect(wasLiveAt(canceled, new Date(MAR.getTime() + 1), NOW)).toBe(false);
  });

  // Frozen is its own figure: in force until it was frozen, not after.
  it('counts a frozen subscription as active only before it was frozen', () => {
    const frozen = sub({ status: SubscriptionStatus.FROZEN, updatedAt: FEB });
    expect(wasLiveAt(frozen, new Date('2026-01-15T00:00:00.000Z'), NOW)).toBe(true);
    expect(wasLiveAt(frozen, NOW, NOW)).toBe(false);
  });

  it('never counts a member whose account is not active', () => {
    expect(wasLiveAt(sub({ accountActive: false }), NOW, NOW)).toBe(false);
  });

  it('counts each member once however many subscriptions they hold', () => {
    const subs = [sub(), sub(), sub({ memberId: 'm2' })];
    expect(liveMembersAt(subs, FEB, NOW)).toEqual(new Set(['m1', 'm2']));
    expect(liveCountAt(subs, FEB, NOW)).toBe(2);
  });
});
