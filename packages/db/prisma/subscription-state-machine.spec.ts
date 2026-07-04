// T8.3 — subscription state machine unit tests.
//
// Exercises the legal transition table, the guards, and the status-set predicates.
// Pure logic, no Prisma double needed — the machine only reads the
// `SubscriptionStatus` enum.

import { describe, expect, it } from 'vitest';
import { SubscriptionStatus } from '../generated/client';
import {
  applyEvent,
  availableEvents,
  canApplyEvent,
  ENTITLED_SUBSCRIPTION_STATUSES,
  InvalidSubscriptionTransitionError,
  isEntitledStatus,
  isLiveStatus,
  isTerminalStatus,
  LIVE_SUBSCRIPTION_STATUSES,
  nextStatus,
  SUBSCRIPTION_TRANSITIONS,
  TERMINAL_SUBSCRIPTION_STATUSES,
  type SubscriptionEvent,
} from './subscription-state-machine';

/** Every (from, event, to) the machine is meant to allow. */
const LEGAL: ReadonlyArray<[SubscriptionStatus, SubscriptionEvent, SubscriptionStatus]> = [
  [SubscriptionStatus.TRIAL, 'RENEW', SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.TRIAL, 'PAYMENT_FAILED', SubscriptionStatus.PAST_DUE],
  [SubscriptionStatus.TRIAL, 'CANCEL', SubscriptionStatus.CANCELED],
  [SubscriptionStatus.ACTIVE, 'RENEW', SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.ACTIVE, 'PAYMENT_FAILED', SubscriptionStatus.PAST_DUE],
  [SubscriptionStatus.ACTIVE, 'FREEZE', SubscriptionStatus.FROZEN],
  [SubscriptionStatus.ACTIVE, 'CANCEL', SubscriptionStatus.CANCELED],
  [SubscriptionStatus.PAST_DUE, 'RENEW', SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.PAST_DUE, 'PAYMENT_FAILED', SubscriptionStatus.PAST_DUE],
  [SubscriptionStatus.PAST_DUE, 'CANCEL', SubscriptionStatus.CANCELED],
  [SubscriptionStatus.PAST_DUE, 'EXPIRE', SubscriptionStatus.EXPIRED],
  [SubscriptionStatus.FROZEN, 'UNFREEZE', SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.FROZEN, 'CANCEL', SubscriptionStatus.CANCELED],
];

const ALL_STATUSES = Object.values(SubscriptionStatus);
const ALL_EVENTS: SubscriptionEvent[] = [
  'RENEW',
  'PAYMENT_FAILED',
  'FREEZE',
  'UNFREEZE',
  'CANCEL',
  'EXPIRE',
];

describe('subscription state machine — legal transitions', () => {
  it.each(LEGAL)('applyEvent(%s, %s) -> %s', (from, event, to) => {
    expect(applyEvent(from, event)).toBe(to);
    expect(nextStatus(from, event)).toBe(to);
    expect(canApplyEvent(from, event)).toBe(true);
  });

  it('the transition table contains exactly the legal pairs and no others', () => {
    const declared = new Set<string>();
    for (const [from, transitions] of Object.entries(SUBSCRIPTION_TRANSITIONS)) {
      for (const event of Object.keys(transitions)) {
        declared.add(`${from}:${event}`);
      }
    }
    const expected = new Set(LEGAL.map(([from, event]) => `${from}:${event}`));
    expect(declared).toStrictEqual(expected);
  });
});

describe('subscription state machine — illegal transitions', () => {
  // Every (status, event) pair not in LEGAL must be rejected.
  const legalKeys = new Set(LEGAL.map(([from, event]) => `${from}:${event}`));
  const illegal: Array<[SubscriptionStatus, SubscriptionEvent]> = [];
  for (const status of ALL_STATUSES) {
    for (const event of ALL_EVENTS) {
      if (!legalKeys.has(`${status}:${event}`)) {
        illegal.push([status, event]);
      }
    }
  }

  it.each(illegal)('rejects %s + %s', (status, event) => {
    expect(canApplyEvent(status, event)).toBe(false);
    expect(nextStatus(status, event)).toBeNull();
    expect(() => applyEvent(status, event)).toThrow(InvalidSubscriptionTransitionError);
  });

  it('the thrown error carries the offending from + event', () => {
    try {
      applyEvent(SubscriptionStatus.CANCELED, 'RENEW');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidSubscriptionTransitionError);
      const e = err as InvalidSubscriptionTransitionError;
      expect(e.from).toBe(SubscriptionStatus.CANCELED);
      expect(e.event).toBe('RENEW');
      expect(e.message).toContain('CANCELED');
    }
  });
});

describe('terminal states', () => {
  it.each([SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED])(
    '%s accepts no events',
    (status) => {
      expect(availableEvents(status)).toEqual([]);
      for (const event of ALL_EVENTS) {
        expect(canApplyEvent(status, event)).toBe(false);
      }
    },
  );
});

describe('availableEvents', () => {
  it('lists exactly the legal events per status', () => {
    expect(availableEvents(SubscriptionStatus.ACTIVE)).toEqual([
      'RENEW',
      'PAYMENT_FAILED',
      'FREEZE',
      'CANCEL',
    ]);
    expect(availableEvents(SubscriptionStatus.PAST_DUE)).toEqual([
      'RENEW',
      'PAYMENT_FAILED',
      'CANCEL',
      'EXPIRE',
    ]);
    expect(availableEvents(SubscriptionStatus.FROZEN)).toEqual(['UNFREEZE', 'CANCEL']);
    expect(availableEvents(SubscriptionStatus.TRIAL)).toEqual([
      'RENEW',
      'PAYMENT_FAILED',
      'CANCEL',
    ]);
  });
});

describe('status-set predicates', () => {
  it('live = TRIAL, ACTIVE, PAST_DUE, FROZEN (matches the partial unique index)', () => {
    expect(LIVE_SUBSCRIPTION_STATUSES).toEqual([
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
      SubscriptionStatus.FROZEN,
    ]);
    expect(isLiveStatus(SubscriptionStatus.TRIAL)).toBe(true);
    expect(isLiveStatus(SubscriptionStatus.ACTIVE)).toBe(true);
    expect(isLiveStatus(SubscriptionStatus.PAST_DUE)).toBe(true);
    expect(isLiveStatus(SubscriptionStatus.FROZEN)).toBe(true);
    expect(isLiveStatus(SubscriptionStatus.CANCELED)).toBe(false);
    expect(isLiveStatus(SubscriptionStatus.EXPIRED)).toBe(false);
  });

  it('terminal = CANCELED, EXPIRED', () => {
    expect(TERMINAL_SUBSCRIPTION_STATUSES).toEqual([
      SubscriptionStatus.CANCELED,
      SubscriptionStatus.EXPIRED,
    ]);
    expect(isTerminalStatus(SubscriptionStatus.CANCELED)).toBe(true);
    expect(isTerminalStatus(SubscriptionStatus.EXPIRED)).toBe(true);
    expect(isTerminalStatus(SubscriptionStatus.ACTIVE)).toBe(false);
  });

  it('entitled = TRIAL, ACTIVE, PAST_DUE — FROZEN is live but grants no access', () => {
    expect(ENTITLED_SUBSCRIPTION_STATUSES).toEqual([
      SubscriptionStatus.TRIAL,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAST_DUE,
    ]);
    expect(isEntitledStatus(SubscriptionStatus.TRIAL)).toBe(true);
    expect(isEntitledStatus(SubscriptionStatus.ACTIVE)).toBe(true);
    expect(isEntitledStatus(SubscriptionStatus.PAST_DUE)).toBe(true);
    expect(isEntitledStatus(SubscriptionStatus.FROZEN)).toBe(false);
    expect(isEntitledStatus(SubscriptionStatus.CANCELED)).toBe(false);
  });

  it('live and terminal partition every status', () => {
    for (const status of ALL_STATUSES) {
      expect(isLiveStatus(status)).toBe(!isTerminalStatus(status));
    }
  });
});
