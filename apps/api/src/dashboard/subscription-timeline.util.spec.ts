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

function sub(over: Partial<SubscriptionTimelineRow> = {}): SubscriptionTimelineRow {
  return {
    memberId: 'm1',
    status: SubscriptionStatus.ACTIVE,
    createdAt: JAN,
    canceledAt: null,
    updatedAt: JAN,
    ...over,
  };
}

describe('subscription timeline', () => {
  it('dates a cancellation by canceledAt, falling back to updatedAt', () => {
    expect(
      churnMoment(sub({ status: SubscriptionStatus.CANCELED, canceledAt: FEB, updatedAt: MAR })),
    ).toEqual(FEB);
    expect(
      churnMoment(sub({ status: SubscriptionStatus.CANCELED, canceledAt: null, updatedAt: MAR })),
    ).toEqual(MAR);
  });

  it('dates an expiry by updatedAt and leaves a live one open', () => {
    expect(churnMoment(sub({ status: SubscriptionStatus.EXPIRED, updatedAt: FEB }))).toEqual(FEB);
    expect(churnMoment(sub())).toBeNull();
  });

  it('is not live before it existed', () => {
    expect(wasLiveAt(sub({ createdAt: FEB }), JAN)).toBe(false);
  });

  // The churn boundary is exclusive at both ends and deliberately so: a
  // subscription cancelled at instant T was still live AT T — it stops being live
  // after it. Every bucket of the Members tab's active trend reads this, so the
  // boundary is pinned here rather than left to whoever edits the helper next.
  it('is live up to and including its churn instant, and not after', () => {
    const canceled = sub({ status: SubscriptionStatus.CANCELED, canceledAt: MAR });
    expect(wasLiveAt(canceled, FEB)).toBe(true);
    expect(wasLiveAt(canceled, MAR)).toBe(true);
    expect(wasLiveAt(canceled, new Date(MAR.getTime() + 1))).toBe(false);
  });

  // Frozen is a LIVE state: a paused membership is still a membership.
  it('counts a frozen subscription as live', () => {
    expect(wasLiveAt(sub({ status: SubscriptionStatus.FROZEN }), FEB)).toBe(true);
  });

  it('counts each member once however many subscriptions they hold', () => {
    const subs = [sub(), sub(), sub({ memberId: 'm2' })];
    expect(liveMembersAt(subs, FEB)).toEqual(new Set(['m1', 'm2']));
    expect(liveCountAt(subs, FEB)).toBe(2);
  });
});
