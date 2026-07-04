import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => {
  const mockEnv: Record<string, unknown> = {};
  return { mockEnv };
});
vi.mock('../config/env', () => ({ env: mockEnv }));

import { SubscriptionInterval, SubscriptionStatus } from '@fit/db';
import { SubscriptionBillingService } from './subscription-billing.service';
import type { PaymentProvider, RenewalChargeResult } from './payment-provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';

/** A billable subscription row as the sweep's `select` projects it. */
interface BillableRow {
  id: string;
  gymId: string;
  memberId: string;
  status: SubscriptionStatus;
  priceAmount: number;
  currency: string;
  interval: SubscriptionInterval;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  paymentRetries: number;
  providerRef: string | null;
}

const row = (over?: Partial<BillableRow>): BillableRow => ({
  id: 'sub-1',
  gymId: 'gym-1',
  memberId: 'member-1',
  status: SubscriptionStatus.ACTIVE,
  priceAmount: 5000,
  currency: 'USD',
  interval: SubscriptionInterval.MONTH,
  currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
  paymentRetries: 0,
  providerRef: null,
  ...over,
});

type UpdateManyArgs = { where: Record<string, unknown>; data: Record<string, unknown> };

function setup(
  options: {
    due?: BillableRow[];
    enabled?: boolean;
    lock?: 'OK' | null;
    charge?: (input: unknown) => RenewalChargeResult | Promise<RenewalChargeResult>;
    updateCount?: number;
    providerKey?: string;
  } = {},
) {
  const {
    due = [],
    enabled = true,
    lock = 'OK',
    charge = () => ({ outcome: 'succeeded', providerRef: null }),
    updateCount = 1,
    providerKey = 'stub',
  } = options;

  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, {
    SUBSCRIPTION_BILLING_ENABLED: enabled,
    SUBSCRIPTION_BILLING_RETRY_OFFSET_DAYS: [2, 5, 7],
  });

  const findMany = vi.fn<(args: unknown) => Promise<BillableRow[]>>().mockResolvedValue(due);
  const updateMany = vi
    .fn<(args: UpdateManyArgs) => Promise<{ count: number }>>()
    .mockResolvedValue({ count: updateCount });
  const prisma = {
    client: { subscription: { findMany, updateMany } },
  } as unknown as PrismaService;

  const set = vi.fn<(...args: unknown[]) => Promise<'OK' | null>>().mockResolvedValue(lock);
  const redis = { client: { set } } as unknown as RedisService;

  const chargeRenewal = vi.fn(async (input: unknown) => charge(input));
  const provider = { key: providerKey, chargeRenewal } as unknown as PaymentProvider;

  return {
    service: new SubscriptionBillingService(prisma, redis, provider),
    findMany,
    updateMany,
    set,
    chargeRenewal,
  };
}

const NOW = new Date('2026-06-10T00:00:00.000Z');

afterEach(() => vi.restoreAllMocks());

describe('SubscriptionBillingService.runBillingCycle', () => {
  it('renews a due ACTIVE subscription: charges, advances the period, resets freeze usage', async () => {
    const { service, updateMany, chargeRenewal } = setup({ due: [row()] });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({
      subscriptionsDue: 1,
      renewed: 1,
      pastDue: 0,
      expired: 0,
      canceled: 0,
      errors: 0,
    });
    // Idempotent per period+rung: charge keyed by subscription, elapsed period end,
    // and retry rung (r0 for the first charge of a period).
    expect(chargeRenewal).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 'sub-1',
        amount: 5000,
        idempotencyKey: 'sub-1:2026-06-01T00:00:00.000Z:r0',
      }),
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
    const args = updateMany.mock.calls[0]![0];
    // Conditional on the observed period + status — the idempotency backstop.
    expect(args.where).toMatchObject({
      id: 'sub-1',
      currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
      status: SubscriptionStatus.ACTIVE,
    });
    expect(args.data).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      freezeDaysUsed: 0,
      paymentRetries: 0,
      provider: 'stub',
    });
  });

  it('recovers a past-due subscription to ACTIVE when the retry charge succeeds', async () => {
    const { service, updateMany } = setup({
      due: [
        row({
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-06-05T00:00:00.000Z'),
        }),
      ],
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ renewed: 1, pastDue: 0 });
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({ status: SubscriptionStatus.ACTIVE });
  });

  it('flags a failed charge PAST_DUE and does not advance the period', async () => {
    const { service, updateMany } = setup({
      due: [row()],
      charge: () => ({ outcome: 'failed', reason: 'card_declined' }),
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ renewed: 0, pastDue: 1, errors: 0 });
    const args = updateMany.mock.calls[0]![0];
    expect(args.data).toEqual({ status: SubscriptionStatus.PAST_DUE });
    // No period fields written on a failed charge.
    expect(args.data).not.toHaveProperty('currentPeriodEnd');
  });

  it('advances the retry ladder when an already-PAST_DUE retry fails again', async () => {
    const { service, updateMany } = setup({
      due: [
        row({
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-06-05T00:00:00.000Z'),
          paymentRetries: 1,
        }),
      ],
      charge: () => ({ outcome: 'failed', reason: 'card_declined' }),
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ pastDue: 1, renewed: 0 });
    // Failed retry: no status change, but the ladder rung advances (pinned to the
    // observed count so a re-run can't double-count).
    const args = updateMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({
      status: SubscriptionStatus.PAST_DUE,
      paymentRetries: 1,
    });
    expect(args.data).toEqual({ paymentRetries: 2 });
  });

  it('does not advance a past-due subscription still waiting between retry rungs', async () => {
    const { service, updateMany, chargeRenewal } = setup({
      // 1 retry done → next rung is +5 days (2026-06-10); at 2026-06-08 still waiting.
      due: [
        row({
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-06-05T00:00:00.000Z'),
          paymentRetries: 1,
        }),
      ],
    });

    const summary = await service.runBillingCycle({ now: new Date('2026-06-08T00:00:00.000Z') });

    expect(summary).toMatchObject({ subscriptionsDue: 1, renewed: 0, pastDue: 0, expired: 0 });
    expect(chargeRenewal).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('expires a past-due subscription once its retry ladder is exhausted', async () => {
    const { service, updateMany, chargeRenewal } = setup({
      // 3 failed retries == the default 3-rung ladder → exhausted, expire.
      due: [row({ status: SubscriptionStatus.PAST_DUE, paymentRetries: 3 })],
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ expired: 1, renewed: 0 });
    expect(chargeRenewal).not.toHaveBeenCalled();
    expect(updateMany.mock.calls[0]![0].data).toEqual({ status: SubscriptionStatus.EXPIRED });
  });

  it('recovers a mid-ladder past-due subscription and clears the retry counter on success', async () => {
    const { service, updateMany } = setup({
      // 1 retry done → next rung +5 days (2026-06-10); NOW is 2026-06-10 → retry due.
      due: [
        row({
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-06-05T00:00:00.000Z'),
          paymentRetries: 1,
        }),
      ],
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ renewed: 1, pastDue: 0 });
    expect(updateMany.mock.calls[0]![0].data).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      paymentRetries: 0,
    });
  });

  it('scopes the idempotency key to the retry rung so each rung is a fresh attempt', async () => {
    const { service, chargeRenewal } = setup({
      due: [
        row({
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
          paymentRetries: 2,
        }),
      ],
    });

    await service.runBillingCycle({ now: NOW });

    expect(chargeRenewal).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'sub-1:2026-06-01T00:00:00.000Z:r2' }),
    );
  });

  it('honours a scheduled cancellation at period end instead of charging', async () => {
    const { service, updateMany, chargeRenewal } = setup({
      due: [row({ cancelAtPeriodEnd: true })],
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ canceled: 1, renewed: 0 });
    expect(chargeRenewal).not.toHaveBeenCalled();
    const args = updateMany.mock.calls[0]![0];
    expect(args.data).toMatchObject({ status: SubscriptionStatus.CANCELED, canceledAt: NOW });
  });

  it('treats a thrown provider error as an infrastructure fault: no write, retry next pass', async () => {
    const { service, updateMany } = setup({
      due: [row()],
      charge: () => {
        throw new Error('provider unreachable');
      },
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ errors: 1, renewed: 0, pastDue: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not count a renewal the conditional update did not apply (idempotency)', async () => {
    const { service } = setup({ due: [row()], updateCount: 0 });

    const summary = await service.runBillingCycle({ now: NOW });

    // Another runner already advanced this period — charge attempted, but no renewal counted.
    expect(summary).toMatchObject({ renewed: 0 });
  });

  it('processes each due subscription independently; one failure does not abort the rest', async () => {
    let call = 0;
    const { service } = setup({
      due: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })],
      charge: () => {
        call += 1;
        if (call === 2) throw new Error('boom');
        return { outcome: 'succeeded', providerRef: null };
      },
    });

    const summary = await service.runBillingCycle({ now: NOW });

    expect(summary).toMatchObject({ subscriptionsDue: 3, renewed: 2, errors: 1 });
  });

  describe('trial conversion (T5.6)', () => {
    /** A due TRIAL row whose trial ended 2026-06-01. */
    const trialRow = (over?: Partial<BillableRow>): BillableRow =>
      row({ status: SubscriptionStatus.TRIAL, ...over });

    it('sweeps TRIAL subscriptions too (status filter includes TRIAL)', async () => {
      const { service, findMany } = setup({ due: [] });
      await service.runBillingCycle({ now: NOW });
      const where = (findMany.mock.calls[0]![0] as { where: { status: { in: unknown[] } } }).where;
      expect(where.status.in).toContain(SubscriptionStatus.TRIAL);
    });

    it('converts a TRIAL to ACTIVE on the first successful charge, starting the paid period', async () => {
      const { service, updateMany, chargeRenewal } = setup({ due: [trialRow()] });

      const summary = await service.runBillingCycle({ now: NOW });

      expect(summary).toMatchObject({ renewed: 1, pastDue: 0, canceled: 0, errors: 0 });
      expect(chargeRenewal).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000 }));
      const args = updateMany.mock.calls[0]![0];
      // Conditional on the observed TRIAL status; converts to ACTIVE and rolls the
      // first paid period forward from the trial end.
      expect(args.where).toMatchObject({ status: SubscriptionStatus.TRIAL });
      expect(args.data).toMatchObject({
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
        paymentRetries: 0,
      });
    });

    it('flags a TRIAL PAST_DUE when its first charge fails', async () => {
      const { service, updateMany } = setup({
        due: [trialRow()],
        charge: () => ({ outcome: 'failed', reason: 'card_declined' }),
      });

      const summary = await service.runBillingCycle({ now: NOW });

      expect(summary).toMatchObject({ pastDue: 1, renewed: 0 });
      expect(updateMany.mock.calls[0]![0].data).toEqual({ status: SubscriptionStatus.PAST_DUE });
    });

    it('charges nothing when a member cancelled during the trial', async () => {
      const { service, updateMany, chargeRenewal } = setup({
        due: [trialRow({ cancelAtPeriodEnd: true })],
      });

      const summary = await service.runBillingCycle({ now: NOW });

      expect(summary).toMatchObject({ canceled: 1, renewed: 0 });
      expect(chargeRenewal).not.toHaveBeenCalled();
      expect(updateMany.mock.calls[0]![0].data).toMatchObject({
        status: SubscriptionStatus.CANCELED,
        canceledAt: NOW,
      });
    });
  });

  it('persists a providerRef the provider returns, but not when it returns none', async () => {
    const withRef = setup({
      due: [row()],
      charge: () => ({ outcome: 'succeeded', providerRef: 'ext_123' }),
    });
    await withRef.service.runBillingCycle({ now: NOW });
    expect(withRef.updateMany.mock.calls[0]![0].data).toMatchObject({ providerRef: 'ext_123' });

    const noRef = setup({ due: [row()], charge: () => ({ outcome: 'succeeded' }) });
    await noRef.service.runBillingCycle({ now: NOW });
    expect(noRef.updateMany.mock.calls[0]![0].data).not.toHaveProperty('providerRef');
  });
});

describe('SubscriptionBillingService.runScheduled', () => {
  it('skips entirely when the feature flag is off', async () => {
    const { service, findMany, set } = setup({ enabled: false });
    await service.runScheduled();
    expect(set).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('skips when another instance holds the daily lock', async () => {
    const { service, findMany, set } = setup({ enabled: true, lock: null });
    await service.runScheduled();
    expect(set).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('runs the sweep when enabled and the lock is won', async () => {
    const { service, findMany } = setup({ enabled: true, lock: 'OK', due: [] });
    await service.runScheduled();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('takes the lock with SET NX EX', async () => {
    const { service, set } = setup({ enabled: true, lock: 'OK' });
    await service.runScheduled();
    const args = set.mock.calls[0]!;
    expect(args[0]).toMatch(/^subscription-billing:lock:/);
    expect(args).toContain('NX');
  });
});
