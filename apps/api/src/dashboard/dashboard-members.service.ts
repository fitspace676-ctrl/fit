import { Injectable } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus, Role, SubscriptionStatus } from '@fit/db';
import {
  MEMBERSHIP_STATUSES,
  SALES_GRANULARITY_RANGE,
  type DashboardMembersQuery,
  type DashboardMembersResponse,
  type MembershipStatus,
  type MembershipStatusSlice,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { bucketKey, DAY_MS, emptyBuckets, resolveWindow } from '../reports/report-window.util';
import { atLocation, memberAtLocation } from '../common/location-filter.util';
import { churnMoment, liveCountAt, liveMembersAt } from './subscription-timeline.util';

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
 * The subscription-liveness reconstruction lives in `./subscription-timeline.util`,
 * shared with the Revenue tab so the two can never disagree about how many members
 * are active. It reads `LIVE_SUBSCRIPTION_STATUSES` from `@fit/db`, the state
 * machine that owns the definition — three hand-written copies of that list already
 * exist in this repo, and this is deliberately not a fourth.
 *
 * ## `locationId` narrows EVERY figure on this tab — all five reads, one rule
 *
 * Stage 2 gave `GymMember` a `locationId` (its home branch), and this tab is the
 * surface that unlock was for: every figure here counts members, or counts
 * subscriptions belonging to members, so once a member has a branch the whole tab
 * has one. Nothing is left half-narrowed, and there is no gym-wide caption to
 * write any more.
 *
 * All five reads take the PERSON half of the attribution rule in
 * `common/location-filter.util.ts` — the member's home branch — and that
 * consistency is the point rather than an implementation detail:
 *
 *   • `GymMember` reads (the signup series, `memberCount`) filter the column
 *     directly, served by `@@index([gymId, locationId, status])`.
 *   • `Subscription` reads (the active-member trend, retention, churn, the status
 *     split) hop through `member` — `Subscription.memberId` is NOT NULL, so the
 *     hop drops nothing and the branches still sum to the gym.
 *   • **`avgLtv` takes the member hop on BOTH sides, and that is the whole
 *     reason it was left gym-wide before.** Its numerator could equally be
 *     narrowed through the order's own branch (`{ order: { locationId } }`), and
 *     must not be: the denominator is a head-count of members homed here, so a
 *     till-attributed numerator would divide one population's money by another
 *     population's size. That is not a smaller average, it is a wrong one. Both
 *     halves therefore ask the same question — "what have the members who call
 *     this branch home ever paid us" — which is what a lifetime value is.
 *
 * The invoice half of that numerator keeps `orderId: null` as its double-count
 * guard; that set has no order to reach a branch through, which is exactly why the
 * member hop is the only honest path and why every invoice read in this codebase
 * now uses it.
 *
 * The console's caption for this tab —
 *
 *     Not split by branch — members have no home branch yet
 *
 * — is RETIRED. Every figure here is a branch figure; leaving the note up would be
 * its own kind of lie.
 */
@Injectable()
export class DashboardMembersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly locales: GymLocaleService,
  ) {}

  /** Build the whole Members tab for one control combination. */
  async get(query: DashboardMembersQuery): Promise<DashboardMembersResponse> {
    // The gym's own calendar. Fetched BEFORE the aggregates because the window
    // itself is a calendar question: `resolveWindow` has to know where midnight
    // is before it can say which days the chart covers.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity], zone);
    const lookbackMs = RETENTION_DAYS[query.retentionWindow] * DAY_MS;

    const [members, subscriptions, memberCount, payments, invoices] = await Promise.all([
      // In the same round trip as everything else — the gym's own currency is not
      // worth a second sequential query.
      this.prisma.client.gymMember.findMany({
        where: {
          role: Role.MEMBER,
          deletedAt: null,
          joinedAt: { lt: win.end },
          // The member's HOME branch, straight off the column Stage 2 added.
          ...atLocation(query.locationId),
        },
        select: { joinedAt: true },
      }),
      // Every subscription, not just the window's: the active-members trend and
      // retention both need state at instants BEFORE the window opens.
      this.prisma.client.subscription.findMany({
        // Attributed to the member's home branch. `Subscription.memberId` is NOT
        // NULL, so the hop is an equality on a real row and drops nothing — the
        // branches still add up to the gym's own trend.
        where: memberAtLocation(query.locationId, { deletedAt: null }),
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.gymMember.count({
        where: { role: Role.MEMBER, deletedAt: null, ...atLocation(query.locationId) },
      }),
      // AGGREGATED in Postgres, not streamed into Node. This read is unbounded
      // by design — lifetime value means the member's whole life, so there is no
      // date floor to apply — and it was pulling every captured payment the gym
      // has ever taken across the wire to add up two columns. At a few dozen
      // members that is invisible; at five years and five thousand it is
      // hundreds of thousands of rows, on every dashboard load.
      //
      // Guest and walk-in orders belong to no member's lifetime. Trashed
      // members' revenue is excluded from the numerator to match the
      // denominator's exclusion — a fair average over active members only.
      this.prisma.client.payment.aggregate({
        where: {
          status: PaymentStatus.CAPTURED,
          // Narrowed by the BUYER's home branch, not by the till the sale rang
          // up on — see the class note. `memberCount` below is the denominator,
          // and both have to be the same population or the average is wrong
          // rather than merely partial.
          order: {
            memberId: { not: null },
            ...memberAtLocation(query.locationId, { deletedAt: null }),
          },
        },
        _sum: { amount: true, refundedAmount: true },
      }),
      // `orderId: null` is what stops an admin-raised invoice against an order
      // being counted alongside that order's captured payment. The `member: { deletedAt: null }`
      // filter also drops invoices with null memberId (revenue attributable to no member),
      // symmetric with the payment-side exclusion of guest orders.
      this.prisma.client.invoice.aggregate({
        where: {
          status: InvoiceStatus.PAID,
          orderId: null,
          ...memberAtLocation(query.locationId, { deletedAt: null }),
        },
        _sum: { amount: true },
      }),
    ]);

    /* -- Trends ---------------------------------------------------------- */

    const activeBuckets = emptyBuckets(win, zone);
    const signupBuckets = emptyBuckets(win, zone);
    const churnBuckets = emptyBuckets(win, zone);
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
      const key = bucketKey(member.joinedAt, win.bucket, zone);
      if (signupBuckets.has(key)) {
        signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
      }
    }

    for (const sub of subscriptions) {
      const churnedAt = churnMoment(sub);
      if (churnedAt === null) continue;
      const key = bucketKey(churnedAt, win.bucket, zone);
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

    // `_sum` is null when nothing matched — a gym with no payments has no sum,
    // which is not the same fact as a sum of zero, but is worth the same here.
    const grossFromMembers = (payments._sum.amount ?? 0) - (payments._sum.refundedAmount ?? 0);
    const fromSubscriptions = invoices._sum.amount ?? 0;
    const lifetime = grossFromMembers + fromSubscriptions;

    const newSignups = [...signupBuckets.values()].reduce((sum, value) => sum + value, 0);
    const churned = [...churnBuckets.values()].reduce((sum, value) => sum + value, 0);

    return {
      granularity: query.granularity,
      retentionWindow: query.retentionWindow,
      expiringWindow: query.expiringWindow,
      currency: locale.currency,
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
