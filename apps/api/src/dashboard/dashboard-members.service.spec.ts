import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvoiceStatus, PaymentStatus, Role, SubscriptionStatus } from '@fit/db';
import type { DashboardMembersQuery } from '@fit/types';
import { DashboardMembersService } from './dashboard-members.service';
import type { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

const DAY = 24 * 60 * 60 * 1000;

/** An instant `days` before now. `daily` spans 30 days, so ≤ 29 stays inside it. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY);
}

function member(over: { joinedAt?: Date; deletedAt?: Date | null } = {}) {
  return { joinedAt: over.joinedAt ?? daysAgo(10), deletedAt: over.deletedAt ?? null };
}

function subscription(over: {
  status?: SubscriptionStatus;
  createdAt?: Date;
  canceledAt?: Date | null;
  updatedAt?: Date;
  memberId?: string;
}) {
  return {
    memberId: over.memberId ?? 'mem-1',
    status: over.status ?? SubscriptionStatus.ACTIVE,
    createdAt: over.createdAt ?? daysAgo(200),
    canceledAt: over.canceledAt ?? null,
    updatedAt: over.updatedAt ?? daysAgo(200),
  };
}

function setup(
  rows: {
    members?: unknown[];
    subscriptions?: unknown[];
    payments?: unknown[];
    invoices?: unknown[];
    memberCount?: number;
  } = {},
) {
  const memberFindMany = vi.fn().mockResolvedValue(rows.members ?? []);
  const memberCount = vi.fn().mockResolvedValue(rows.memberCount ?? 0);
  const subscriptionFindMany = vi.fn().mockResolvedValue(rows.subscriptions ?? []);
  const paymentFindMany = vi.fn().mockResolvedValue(rows.payments ?? []);
  const invoiceFindMany = vi.fn().mockResolvedValue(rows.invoices ?? []);
  const prisma = {
    client: {
      gymMember: { findMany: memberFindMany, count: memberCount },
      subscription: { findMany: subscriptionFindMany },
      payment: { findMany: paymentFindMany },
      invoice: { findMany: invoiceFindMany },
    },
  } as unknown as TenantPrismaService;

  return {
    service: new DashboardMembersService(prisma),
    memberFindMany,
    memberCount,
    subscriptionFindMany,
    paymentFindMany,
    invoiceFindMany,
  };
}

const QUERY: DashboardMembersQuery = {
  granularity: 'daily',
  retentionWindow: '30',
  expiringWindow: '7',
};

describe('DashboardMembersService.get — trash', () => {
  afterEach(() => vi.clearAllMocks());

  // The bug the existing `members` drill-down has. Trashed members are hidden
  // from the roster and every live count; they must not inflate this tab either.
  it('excludes trashed members at the query level, on every read', async () => {
    const { service, memberFindMany, subscriptionFindMany } = setup();
    await service.get(QUERY);

    const memberArgs = memberFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(memberArgs.where).toMatchObject({ deletedAt: null });

    const subArgs = subscriptionFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(subArgs.where).toMatchObject({ member: { deletedAt: null } });
  });

  // The LTV denominator is a separate `count` call and would be just as easy to
  // leave unfiltered — a gym that trashed half its roster would see its average
  // halve for no reason.
  it('excludes trashed members from the LTV denominator too', async () => {
    const { service, memberCount } = setup();
    await service.get(QUERY);

    const args = memberCount.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ role: Role.MEMBER, deletedAt: null });
  });
});

describe('DashboardMembersService.get — active members', () => {
  afterEach(() => vi.clearAllMocks());

  // FROZEN is in LIVE_SUBSCRIPTION_STATUSES: a paused membership still occupies
  // the slot and still resumes. CANCELED is terminal.
  it('counts a frozen subscription as active and a canceled one as not', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ status: SubscriptionStatus.FROZEN, memberId: 'a' }),
        subscription({ status: SubscriptionStatus.ACTIVE, memberId: 'b' }),
        subscription({
          status: SubscriptionStatus.CANCELED,
          memberId: 'c',
          canceledAt: daysAgo(100),
          updatedAt: daysAgo(100),
        }),
      ],
    });

    const result = await service.get(QUERY);

    expect(result.kpis.activeMembers).toBe(2);
    expect(result.activeOverTime[result.activeOverTime.length - 1]?.value).toBe(2);
  });

  it('emits a dense series across the window', async () => {
    const { service } = setup();
    const result = await service.get(QUERY);
    expect(result.activeOverTime.length).toBeGreaterThanOrEqual(30);
    expect(result.retention).toHaveLength(result.activeOverTime.length);
    expect(result.signupsVsChurn).toHaveLength(result.activeOverTime.length);
  });
});

describe('DashboardMembersService.get — retention', () => {
  afterEach(() => vi.clearAllMocks());

  // The honesty case. A gym with nobody to retain had no retention rate; 0%
  // would claim everyone left.
  it('emits null, not zero, for a bucket with no denominator', async () => {
    const { service } = setup();
    const result = await service.get(QUERY);
    expect(result.retention.every((point) => point.value === null)).toBe(true);
  });

  it('reports 100 when every member from the lookback is still live', async () => {
    const { service } = setup({
      subscriptions: [subscription({ status: SubscriptionStatus.ACTIVE, memberId: 'a' })],
    });
    const result = await service.get(QUERY);
    expect(result.retention[result.retention.length - 1]?.value).toBe(100);
  });

  it('reports 0 — not null — when the lookback had members and all of them left', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({
          status: SubscriptionStatus.CANCELED,
          memberId: 'a',
          createdAt: daysAgo(200),
          canceledAt: daysAgo(5),
          updatedAt: daysAgo(5),
        }),
      ],
    });
    const result = await service.get(QUERY);
    expect(result.retention[result.retention.length - 1]?.value).toBe(0);
  });
});

describe('DashboardMembersService.get — LTV', () => {
  afterEach(() => vi.clearAllMocks());

  it('sums member payments and subscription invoices over the member count', async () => {
    const { service } = setup({
      memberCount: 2,
      payments: [{ amount: 10_000, refundedAmount: 1_000, currency: 'GEL' }],
      invoices: [{ amount: 5_000, currency: 'GEL' }],
    });

    const result = await service.get(QUERY);

    // (10_000 - 1_000) + 5_000 = 14_000 over 2 members.
    expect(result.kpis.avgLtv).toBe(7_000);
  });

  // An admin-raised invoice may name an order that ALSO has a captured payment.
  // Counting both would count that money twice, so the invoice read filters
  // `orderId: null` — assert the filter, since the double-count is invisible in
  // a total that happens to look plausible.
  it('reads only invoices with no linked order', async () => {
    const { service, invoiceFindMany } = setup();
    await service.get(QUERY);

    const args = invoiceFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ orderId: null, status: InvoiceStatus.PAID });
  });

  // Guest and walk-in revenue belongs to no member's lifetime.
  it('reads only payments attributable to a member', async () => {
    const { service, paymentFindMany } = setup();
    await service.get(QUERY);

    const args = paymentFindMany.mock.calls[0]?.[0] as {
      where: { status: PaymentStatus; order: Record<string, unknown> };
    };
    expect(args.where.status).toBe(PaymentStatus.CAPTURED);
    expect(args.where.order).toMatchObject({ memberId: { not: null } });
  });

  it('reports zero LTV rather than dividing by zero when the gym has no members', async () => {
    const { service } = setup({ memberCount: 0, payments: [{ amount: 500, refundedAmount: 0 }] });
    expect((await service.get(QUERY)).kpis.avgLtv).toBe(0);
  });

  // Trashed members' revenue must not inflate the LTV numerator while their absence
  // deflates the denominator. Revenue from a deleted member does not belong in their
  // lifetime value — they are no longer part of the roster.
  it("excludes trashed members' captured payments from the LTV numerator", async () => {
    const { service, paymentFindMany } = setup();
    await service.get(QUERY);

    const args = paymentFindMany.mock.calls[0]?.[0] as {
      where: { order: Record<string, unknown> };
    };
    expect(args.where.order).toMatchObject({ member: { deletedAt: null } });
  });

  it('excludes PAID invoices of trashed members from the LTV numerator', async () => {
    const { service, invoiceFindMany } = setup();
    await service.get(QUERY);

    const args = invoiceFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({ member: { deletedAt: null } });
  });
});

describe('DashboardMembersService.get — status breakdown', () => {
  afterEach(() => vi.clearAllMocks());

  it('maps every subscription state onto its wire form, in lifecycle order', async () => {
    const { service } = setup({
      subscriptions: [
        subscription({ status: SubscriptionStatus.EXPIRED, memberId: 'a', updatedAt: daysAgo(1) }),
        subscription({ status: SubscriptionStatus.TRIAL, memberId: 'b' }),
        subscription({ status: SubscriptionStatus.PAST_DUE, memberId: 'c' }),
        subscription({ status: SubscriptionStatus.PAST_DUE, memberId: 'd' }),
      ],
    });

    const result = await service.get(QUERY);

    expect(result.byStatus).toEqual([
      { status: 'trial', count: 1 },
      { status: 'past-due', count: 2 },
      { status: 'expired', count: 1 },
    ]);
  });

  it('omits states with no subscriptions rather than padding them with zeroes', async () => {
    const { service } = setup({
      subscriptions: [subscription({ status: SubscriptionStatus.ACTIVE })],
    });
    expect((await service.get(QUERY)).byStatus).toEqual([{ status: 'active', count: 1 }]);
  });
});

describe('DashboardMembersService.get — signups and churn', () => {
  afterEach(() => vi.clearAllMocks());

  it('buckets a join by joinedAt and a cancellation by its terminal instant', async () => {
    const joined = daysAgo(3);
    const canceled = daysAgo(1);
    const { service } = setup({
      members: [member({ joinedAt: joined })],
      subscriptions: [
        subscription({
          status: SubscriptionStatus.CANCELED,
          memberId: 'a',
          canceledAt: canceled,
          updatedAt: canceled,
        }),
      ],
    });

    const result = await service.get(QUERY);
    const joinKey = joined.toISOString().slice(0, 10);
    const cancelKey = canceled.toISOString().slice(0, 10);

    expect(result.signupsVsChurn.find((p) => p.label === joinKey)?.signups).toBe(1);
    expect(result.signupsVsChurn.find((p) => p.label === cancelKey)?.churned).toBe(1);
    expect(result.kpis.newSignups).toBe(1);
    expect(result.kpis.churned).toBe(1);
  });

  it('reports zeroes for an empty window without throwing', async () => {
    const { service } = setup();
    const result = await service.get(QUERY);
    expect(result.kpis).toEqual({ activeMembers: 0, newSignups: 0, churned: 0, avgLtv: 0 });
    expect(result.byStatus).toEqual([]);
  });
});
