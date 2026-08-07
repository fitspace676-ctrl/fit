import { Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  LIVE_SUBSCRIPTION_STATUSES,
  PaymentStatus,
  Role,
  SubscriptionStatus,
} from '@fit/db';
import {
  MEMBERSHIP_STATUSES,
  SALES_GRANULARITY_RANGE,
  type DashboardMembersQuery,
  type DashboardMembersResponse,
  type MembershipStatus,
  type MembershipStatusSlice,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import {
  bucketKey,
  DAY_MS,
  DEFAULT_CURRENCY,
  emptyBuckets,
  resolveWindow,
} from '../reports/report-window.util';

/** Days each retention window looks back. */
const RETENTION_DAYS = { '30': 30, '60': 60, '90': 90 } as const;

/** The wire form of each subscription state, keyed by the DB enum. */
const STATUS_KEYS: Record<SubscriptionStatus, MembershipStatus> = {
  [SubscriptionStatus.TRIAL]: 'trial',
  [SubscriptionStatus.ACTIVE]: 'active',
  [SubscriptionStatus.PAST_DUE]: 'past-due',
  [SubscriptionStatus.FROZEN]: 'frozen',
  [SubscriptionStatus.CANCELED]: 'canceled',
  [SubscriptionStatus.EXPIRED]: 'expired',
};

/** The subscription fields every trend here reconstructs state from. */
interface SubscriptionRow {
  memberId: string;
  status: SubscriptionStatus;
  createdAt: Date;
  canceledAt: Date | null;
  updatedAt: Date;
}

/**
 * Read side of the hand-built Members dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, the active-members trend,
 * signups against churn, the rolling retention rate, and the billing-state split.
 * Every figure is a REAL aggregation over rows that exist today (same honesty
 * contract as {@link ReportDrilldownService}); time series are densely zero-filled
 * because a quiet bucket is a real zero, while the status breakdown omits states
 * nobody is in rather than padding them.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`. **Trash is filtered explicitly on every read** — `GymMember.deletedAt`
 * and `member: { deletedAt: null }` are applied to members, subscriptions, and
 * revenue reads alike, which the older `members` drill-down does not do and is why
 * its figures include trashed members and their revenue.
 *
 * `LIVE_SUBSCRIPTION_STATUSES` is imported from `@fit/db`, the state machine that
 * owns the definition. Three hand-written copies of that list already exist in
 * this repo; this is deliberately not a fourth.
 */
@Injectable()
export class DashboardMembersService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Build the whole Members tab for one control combination. */
  async get(query: DashboardMembersQuery): Promise<DashboardMembersResponse> {
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity]);
    const lookbackMs = RETENTION_DAYS[query.retentionWindow] * DAY_MS;

    const [members, subscriptions, memberCount, payments, invoices] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where: { role: Role.MEMBER, deletedAt: null, joinedAt: { lt: win.end } },
        select: { joinedAt: true },
      }),
      // Every subscription, not just the window's: the active-members trend and
      // retention both need state at instants BEFORE the window opens.
      this.prisma.client.subscription.findMany({
        where: { member: { deletedAt: null } },
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.gymMember.count({ where: { role: Role.MEMBER, deletedAt: null } }),
      // Guest and walk-in orders belong to no member's lifetime.
      // Trashed members' revenue is excluded from the LTV numerator to match
      // the denominator's exclusion — a fair average over active members only.
      this.prisma.client.payment.findMany({
        where: {
          status: PaymentStatus.CAPTURED,
          order: { memberId: { not: null }, member: { deletedAt: null } },
        },
        select: { amount: true, refundedAmount: true, currency: true },
      }),
      // `orderId: null` is what stops an admin-raised invoice against an order
      // being counted alongside that order's captured payment. The `member: { deletedAt: null }`
      // filter also drops invoices with null memberId (revenue attributable to no member),
      // symmetric with the payment-side exclusion of guest orders.
      this.prisma.client.invoice.findMany({
        where: { status: InvoiceStatus.PAID, orderId: null, member: { deletedAt: null } },
        select: { amount: true, currency: true },
      }),
    ]);

    /* -- Trends ---------------------------------------------------------- */

    const activeBuckets = emptyBuckets(win);
    const signupBuckets = emptyBuckets(win);
    const churnBuckets = emptyBuckets(win);
    const retention: { label: string; value: number | null }[] = [];

    for (const [key] of activeBuckets) {
      const at = new Date(`${key}T00:00:00.000Z`);
      activeBuckets.set(key, liveCountAt(subscriptions, at));

      const before = new Date(at.getTime() - lookbackMs);
      const cohort = liveMembersAt(subscriptions, before);
      const stillLive = liveMembersAt(subscriptions, at);
      const kept = [...cohort].filter((id) => stillLive.has(id)).length;
      retention.push({
        label: key,
        // No cohort is not 0% retention — it is no retention rate at all.
        value: cohort.size === 0 ? null : Math.round((kept / cohort.size) * 1000) / 10,
      });
    }

    for (const member of members) {
      const key = bucketKey(member.joinedAt, win.bucket);
      if (signupBuckets.has(key)) {
        signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
      }
    }

    for (const sub of subscriptions) {
      const churnedAt = churnMoment(sub);
      if (churnedAt === null) continue;
      const key = bucketKey(churnedAt, win.bucket);
      if (churnBuckets.has(key)) {
        churnBuckets.set(key, (churnBuckets.get(key) ?? 0) + 1);
      }
    }

    /* -- Snapshots ------------------------------------------------------- */

    const statusCounts = new Map<MembershipStatus, number>();
    for (const sub of subscriptions) {
      const key = STATUS_KEYS[sub.status];
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    }

    const grossFromMembers = payments.reduce(
      (sum, payment) => sum + payment.amount - payment.refundedAmount,
      0,
    );
    const fromSubscriptions = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
    const lifetime = grossFromMembers + fromSubscriptions;

    const newSignups = [...signupBuckets.values()].reduce((sum, value) => sum + value, 0);
    const churned = [...churnBuckets.values()].reduce((sum, value) => sum + value, 0);

    return {
      granularity: query.granularity,
      retentionWindow: query.retentionWindow,
      expiringWindow: query.expiringWindow,
      currency:
        payments[payments.length - 1]?.currency ?? invoices[0]?.currency ?? DEFAULT_CURRENCY,
      kpis: {
        activeMembers: liveMembersAt(subscriptions, win.end).size,
        newSignups,
        churned,
        avgLtv: memberCount === 0 ? 0 : Math.round(lifetime / memberCount),
      },
      activeOverTime: [...activeBuckets.entries()].map(([label, value]) => ({ label, value })),
      signupsVsChurn: [...signupBuckets.entries()].map(([label, signups]) => ({
        label,
        signups,
        churned: churnBuckets.get(label) ?? 0,
      })),
      retention,
      // Lifecycle order, from the contract's own list, so the chart's bars read
      // as a progression rather than in whatever order the Map filled.
      byStatus: MEMBERSHIP_STATUSES.map(
        (status): MembershipStatusSlice => ({ status, count: statusCounts.get(status) ?? 0 }),
      ).filter((slice) => slice.count > 0),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A subscription's terminal instant, or `null` while it is still live. Mirrors
 * the private helper in `report-drilldown.service.ts`; reproduced rather than
 * exported from there, so this service does not reach into another's internals.
 */
function churnMoment(sub: SubscriptionRow): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED) return sub.canceledAt ?? sub.updatedAt;
  if (sub.status === SubscriptionStatus.EXPIRED) return sub.updatedAt;
  return null;
}

/** Whether a subscription existed and had not yet ended at `at`. */
function wasLiveAt(sub: SubscriptionRow, at: Date): boolean {
  if (sub.createdAt >= at) return false;
  const churnedAt = churnMoment(sub);
  if (churnedAt !== null && churnedAt < at) return false;
  // A live-status row that has not churned was live; a terminal row that churned
  // after `at` was live then too.
  return churnedAt !== null || LIVE_SUBSCRIPTION_STATUSES.includes(sub.status);
}

/** The distinct members holding at least one live subscription at `at`. */
function liveMembersAt(subs: SubscriptionRow[], at: Date): Set<string> {
  const ids = new Set<string>();
  for (const sub of subs) {
    if (wasLiveAt(sub, at)) ids.add(sub.memberId);
  }
  return ids;
}

/** How many distinct members held a live subscription at `at`. */
function liveCountAt(subs: SubscriptionRow[], at: Date): number {
  return liveMembersAt(subs, at).size;
}
