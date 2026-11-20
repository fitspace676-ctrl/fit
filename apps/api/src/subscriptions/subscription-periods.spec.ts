import { describe, expect, it, vi } from 'vitest';
import { Prisma, SubscriptionInterval, SubscriptionStatus } from '@fit/db';
import type { InvoiceService } from '../billing/invoice.service';
import { parseFulfilment } from '../payments/order-fulfilment';
import {
  AlreadySubscribedError,
  applyRenewal,
  manualPaymentWindow,
  nextManualPeriod,
  startSubscription,
  type RenewalClient,
  type SubscriptionStartClient,
} from './subscription-periods';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-10T00:00:00.000Z');
const ISSUED = { id: 'inv-1', number: '2026-0001', seq: 1, year: 2026 };

function invoices() {
  const issue = vi.fn<(tx: unknown, input: Record<string, unknown>) => Promise<typeof ISSUED>>(
    () => Promise.resolve(ISSUED),
  );
  return { issue, service: { issue } as unknown as Pick<InvoiceService, 'issue'> };
}

describe('manualPaymentWindow', () => {
  const sub = (over: Partial<Parameters<typeof manualPaymentWindow>[0]> = {}) => ({
    provider: 'flitt',
    status: SubscriptionStatus.ACTIVE,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(NOW.getTime() + 3 * DAY_MS),
    ...over,
  });

  it('is due within 7 days of the period end, and not before', () => {
    expect(manualPaymentWindow(sub(), NOW)).toBe('due');
    expect(
      manualPaymentWindow(sub({ currentPeriodEnd: new Date(NOW.getTime() + 7 * DAY_MS) }), NOW),
    ).toBe('due');
    expect(
      manualPaymentWindow(sub({ currentPeriodEnd: new Date(NOW.getTime() + 8 * DAY_MS) }), NOW),
    ).toBe('not_due');
  });

  it('is always due while past due', () => {
    expect(
      manualPaymentWindow(
        sub({
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date(NOW.getTime() - 5 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe('due');
  });

  it('is not payable for another provider, a frozen, cancelling or finished subscription', () => {
    expect(manualPaymentWindow(sub({ provider: 'stub' }), NOW)).toBe('not_payable');
    expect(manualPaymentWindow(sub({ status: SubscriptionStatus.FROZEN }), NOW)).toBe(
      'not_payable',
    );
    expect(manualPaymentWindow(sub({ status: SubscriptionStatus.EXPIRED }), NOW)).toBe(
      'not_payable',
    );
    expect(manualPaymentWindow(sub({ cancelAtPeriodEnd: true }), NOW)).toBe('not_payable');
  });
});

describe('nextManualPeriod', () => {
  it('is contiguous with the period it pays for', () => {
    const end = new Date('2026-01-31T00:00:00.000Z');
    expect(nextManualPeriod(end, SubscriptionInterval.MONTH)).toEqual({
      nextPeriodStart: end,
      nextPeriodEnd: new Date('2026-02-28T00:00:00.000Z'),
    });
  });
});

describe('applyRenewal', () => {
  const sub = {
    id: 'sub-1',
    gymId: 'gym-1',
    memberId: 'member-1',
    status: SubscriptionStatus.PAST_DUE,
    currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
    priceAmount: 9000,
    currency: 'GEL',
    interval: SubscriptionInterval.MONTH,
    planName: 'Premium',
  };

  function client(count: number) {
    const updateMany = vi.fn((_args: { where: unknown; data: Record<string, unknown> }) =>
      Promise.resolve({ count }),
    );
    return { updateMany, tx: { subscription: { updateMany } } as unknown as RenewalClient };
  }

  it('advances once, guarded on the observed period end + status, and mints the invoice', async () => {
    const { tx, updateMany } = client(1);
    const { issue, service } = invoices();

    const issued = await applyRenewal(tx, service, {
      sub,
      ...nextManualPeriod(sub.currentPeriodEnd, sub.interval),
      provider: 'flitt',
      orderId: 'order-1',
    });

    expect(issued).toEqual(ISSUED);
    expect(updateMany.mock.calls[0]![0]).toEqual({
      where: { id: 'sub-1', currentPeriodEnd: sub.currentPeriodEnd, status: sub.status },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
        freezeDaysUsed: 0,
        paymentRetries: 0,
        provider: 'flitt',
      },
    });
    expect(issue.mock.calls[0]![1]).toMatchObject({
      subscriptionId: 'sub-1',
      orderId: 'order-1',
      amount: 9000,
      currency: 'GEL',
      issuedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
  });

  it('advances nothing and mints nothing when the period already moved', async () => {
    const { tx } = client(0);
    const { issue, service } = invoices();

    const issued = await applyRenewal(tx, service, {
      sub,
      ...nextManualPeriod(sub.currentPeriodEnd, sub.interval),
      provider: 'flitt',
    });

    expect(issued).toBeNull();
    expect(issue).not.toHaveBeenCalled();
  });
});

describe('startSubscription', () => {
  const input = {
    gymId: 'gym-1',
    memberId: 'member-1',
    planId: 'plan-1',
    planName: 'Premium',
    priceAmount: 9000,
    currency: 'GEL',
    interval: SubscriptionInterval.MONTH,
    trialDays: 0,
    provider: 'flitt',
    orderId: 'order-1',
    now: new Date('2026-06-01T00:00:00.000Z'),
  };

  function client(opts: { live?: boolean; createError?: Error } = {}) {
    const create = vi.fn((_args: { data: Record<string, unknown> }) =>
      opts.createError ? Promise.reject(opts.createError) : Promise.resolve({ id: 'sub-new' }),
    );
    const findFirst = vi.fn(() => Promise.resolve(opts.live ? { id: 'sub-old' } : null));
    return {
      create,
      tx: { subscription: { findFirst, create } } as unknown as SubscriptionStartClient,
    };
  }

  it('creates the subscription with the provider and ties the first invoice to the order', async () => {
    const { tx, create } = client();
    const { issue, service } = invoices();

    const started = await startSubscription(tx, service, input);

    expect(started).toEqual({ subscriptionId: 'sub-new', invoice: ISSUED });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      provider: 'flitt',
      priceAmount: 9000,
      currentPeriodStart: input.now,
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    });
    expect(issue.mock.calls[0]![1]).toMatchObject({ subscriptionId: 'sub-new', orderId: 'order-1' });
  });

  it('refuses a member who already holds a live subscription, and maps the race backstop', async () => {
    const { issue, service } = invoices();
    await expect(startSubscription(client({ live: true }).tx, service, input)).rejects.toBeInstanceOf(
      AlreadySubscribedError,
    );
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    await expect(
      startSubscription(client({ createError: p2002 }).tx, service, input),
    ).rejects.toBeInstanceOf(AlreadySubscribedError);
    expect(issue).not.toHaveBeenCalled();
  });
});

describe('parseFulfilment — subscription kinds', () => {
  it('round-trips the snapshots and rejects malformed ones', () => {
    const start = {
      kind: 'subscription_start',
      planId: 'plan-1',
      planName: 'Premium',
      priceAmount: 9000,
      currency: 'GEL',
      interval: 'MONTH',
    };
    expect(parseFulfilment(start)).toEqual(start);
    expect(parseFulfilment({ ...start, interval: 'WEEK' })).toBeNull();
    const renewal = {
      kind: 'subscription_renewal',
      subscriptionId: 'sub-1',
      periodEnd: '2026-06-01T00:00:00.000Z',
    };
    expect(parseFulfilment(renewal)).toEqual(renewal);
    expect(parseFulfilment({ ...renewal, periodEnd: 'not a date' })).toBeNull();
  });
});
