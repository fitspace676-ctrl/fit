import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { DEFAULT_FREEZE_DAYS_PER_PERIOD } from '@fit/db';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import type { TenantContext } from '../common/tenant/tenant.context';
import { MeSubscriptionService } from './me-subscription.service';

const MEMBER = { id: 'gm-1', joinedAt: new Date('2025-01-01T00:00:00.000Z') };

const INVOICE = {
  id: 'inv-1',
  issuedAt: new Date('2026-06-01T00:00:00.000Z'),
  amount: 5000,
  currency: 'GEL',
  status: 'PAID',
};

function baseSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'ACTIVE',
    priceAmount: 5000,
    currency: 'GEL',
    interval: 'MONTH',
    currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    cancelAtPeriodEnd: false,
    frozenAt: null,
    frozenUntil: null,
    freezeDaysUsed: 0,
    plan: { name: 'Premium', freezeDaysPerPeriod: 10 },
    ...overrides,
  };
}

function setup(
  opts: {
    userId?: string | null;
    member?: typeof MEMBER | null;
    invoices?: Array<typeof INVOICE>;
    subscription?: Record<string, unknown> | null;
  } = {},
) {
  const gymMemberFindFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue('member' in opts ? opts.member : MEMBER);
  const invoiceFindMany = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue(opts.invoices ?? [INVOICE]);
  const subscriptionFindFirst = vi
    .fn<(args: unknown) => Promise<unknown>>()
    .mockResolvedValue('subscription' in opts ? opts.subscription : baseSubscription());

  const prisma = {
    client: {
      gymMember: { findFirst: gymMemberFindFirst },
      invoice: { findMany: invoiceFindMany },
      subscription: { findFirst: subscriptionFindFirst },
    },
  } as unknown as TenantPrismaService;

  const tenant = {
    userId: 'userId' in opts ? opts.userId : 'user-1',
  } as unknown as TenantContext;

  return { service: new MeSubscriptionService(prisma, tenant), invoiceFindMany };
}

describe('MeSubscriptionService', () => {
  it('requires a member session', async () => {
    const { service } = setup({ userId: null });
    await expect(service.getMySubscription()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns the empty shape when the caller never joined the gym', async () => {
    const { service, invoiceFindMany } = setup({ member: null });
    await expect(service.getMySubscription()).resolves.toEqual({
      subscription: null,
      invoices: [],
    });
    expect(invoiceFindMany).not.toHaveBeenCalled();
  });

  it('surfaces billing history even when there is no live subscription', async () => {
    const { service } = setup({ subscription: null });
    const result = await service.getMySubscription();
    expect(result.subscription).toBeNull();
    expect(result.invoices).toEqual([
      {
        id: 'inv-1',
        date: '2026-06-01T00:00:00.000Z',
        amount: 5000,
        currency: 'GEL',
        status: 'PAID',
      },
    ]);
  });

  it('projects the subscription with plan freeze allowance and remaining days', async () => {
    const { service } = setup({ subscription: baseSubscription({ freezeDaysUsed: 4 }) });
    const result = await service.getMySubscription();
    expect(result.subscription).toMatchObject({
      id: 'sub-1',
      planName: 'Premium',
      freezeDaysPerPeriod: 10,
      freezeDaysUsed: 4,
      freezeDaysRemaining: 6,
      memberSince: '2025-01-01T00:00:00.000Z',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
    });
  });

  it('falls back to the schema default allowance when the plan is gone', async () => {
    const { service } = setup({
      subscription: baseSubscription({ plan: null, freezeDaysUsed: 0 }),
    });
    const result = await service.getMySubscription();
    expect(result.subscription).toMatchObject({
      planName: null,
      freezeDaysPerPeriod: DEFAULT_FREEZE_DAYS_PER_PERIOD,
      freezeDaysRemaining: DEFAULT_FREEZE_DAYS_PER_PERIOD,
    });
  });

  it('clamps remaining freeze days at zero when usage exceeds the allowance', async () => {
    const { service } = setup({
      subscription: baseSubscription({
        plan: { name: 'Basic', freezeDaysPerPeriod: 5 },
        freezeDaysUsed: 8,
      }),
    });
    const result = await service.getMySubscription();
    expect(result.subscription?.freezeDaysRemaining).toBe(0);
  });

  it('serialises freeze timestamps as ISO strings when present', async () => {
    const { service } = setup({
      subscription: baseSubscription({
        frozenAt: new Date('2026-06-10T00:00:00.000Z'),
        frozenUntil: new Date('2026-06-20T00:00:00.000Z'),
      }),
    });
    const result = await service.getMySubscription();
    expect(result.subscription).toMatchObject({
      frozenAt: '2026-06-10T00:00:00.000Z',
      frozenUntil: '2026-06-20T00:00:00.000Z',
    });
  });
});
