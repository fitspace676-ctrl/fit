import { Injectable } from '@nestjs/common';
import { GymMemberStatus, InvoiceStatus, PaymentStatus, Role, SubscriptionStatus } from '@fit/db';
import {
  MEMBERSHIP_STATUSES,
  type DashboardMembersQuery,
  type DashboardMembersResponse,
  type MembershipStatus,
  type MembershipStatusSlice,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { bucketKey, DAY_MS, emptyBuckets } from '../reports/report-window.util';
import { zonedDayStart } from '../reports/zoned-time.util';
import { atLocation, memberAtLocation } from '../common/location-filter.util';
import { resolveSegmentWindow } from './segment-window.util';
import {
  churnMoment,
  liveMembersAt,
  wasLiveAt,
  type SubscriptionTimelineRow,
} from './subscription-timeline.util';

/** Days each retention window looks back. */
const RETENTION_DAYS = { '30': 30, '60': 60, '90': 90 } as const;

/** Billing states that hold a membership while (or until) its period runs. */
const IN_FORCE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
]);

interface MemberTimelineRow extends SubscriptionTimelineRow {
  memberStatus: GymMemberStatus;
}

/**
 * Read side of the hand-built Members dashboard tab.
 *
 * Produces the whole tab in one round trip: the KPIs, the active-members trend,
 * signups against churn, the rolling retention rate, and members by standing.
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
 * ## One vocabulary with the overview and the members page
 *
 * "Active" is the #441 rule (`common/live-membership.util.ts`): a MEMBER, not
 * deleted, ACTIVE account, holding a TRIAL / ACTIVE / PAST_DUE membership whose
 * period contains the instant. A period that is over is not in force whatever its
 * status says; FROZEN is its own figure. The reconstruction lives in
 * `./subscription-timeline.util`, shared with the Revenue tab. `byStatus` counts
 * PEOPLE (one row each, see `standingNow`), `churned` counts people whose last
 * membership ended inside the window, and `newSignups` is the overview's
 * new-member population. With the header `period` the window is the overview's.
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
    // itself is a calendar question.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const now = new Date();
    // The header period when the console sends one (the overview's own window,
    // cut at now), else the rolling granularity window.
    const { win, period } = resolveSegmentWindow(query, zone, now);
    const lookbackMs = RETENTION_DAYS[query.retentionWindow] * DAY_MS;

    const [members, subscriptionRows, memberCount, payments, invoices] = await Promise.all([
      // Joiners in the window: the same population as the overview's new-member
      // KPI (non-deleted MEMBERs by `joinedAt`), so the two figures agree.
      this.prisma.client.gymMember.findMany({
        where: {
          role: Role.MEMBER,
          deletedAt: null,
          joinedAt: { gte: win.start, lt: win.end },
          // The member's HOME branch, straight off the column Stage 2 added.
          ...atLocation(query.locationId),
        },
        select: { joinedAt: true },
      }),
      // Every subscription, not just the window's: the active trend, retention
      // and churn all need state at instants BEFORE the window opens. Attributed
      // to the member's home branch; `Subscription.memberId` is NOT NULL, so the
      // branches still add up to the gym.
      this.prisma.client.subscription.findMany({
        where: {
          member: { role: Role.MEMBER, deletedAt: null, ...atLocation(query.locationId) },
        },
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          member: { select: { status: true } },
        },
      }),
      this.prisma.client.gymMember.count({
        where: { role: Role.MEMBER, deletedAt: null, ...atLocation(query.locationId) },
      }),
      // AGGREGATED in Postgres, not streamed into Node: lifetime value means the
      // member's whole life, so there is no date floor. Guest and walk-in orders
      // belong to no member's lifetime; trashed members' revenue is excluded to
      // match the denominator. Narrowed by the BUYER's home branch so numerator
      // and denominator are the same population.
      this.prisma.client.payment.aggregate({
        where: {
          status: PaymentStatus.CAPTURED,
          order: {
            memberId: { not: null },
            ...memberAtLocation(query.locationId, { deletedAt: null }),
          },
        },
        _sum: { amount: true, refundedAmount: true },
      }),
      // `orderId: null` stops an invoice raised against an order being counted
      // alongside that order's captured payment.
      this.prisma.client.invoice.aggregate({
        where: {
          status: InvoiceStatus.PAID,
          orderId: null,
          ...memberAtLocation(query.locationId, { deletedAt: null }),
        },
        _sum: { amount: true },
      }),
    ]);

    // The account's state decides "active" exactly as at check-in and in
    // `activeMemberWhere`: a suspended or invited account is never active.
    const subscriptions: MemberTimelineRow[] = subscriptionRows.map((row) => ({
      memberId: row.memberId,
      status: row.status,
      createdAt: row.createdAt,
      canceledAt: row.canceledAt,
      updatedAt: row.updatedAt,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      memberStatus: row.member.status,
      accountActive: row.member.status === GymMemberStatus.ACTIVE,
    }));

    /** The instant a bucket (or the window) is read at: its last moment, or now. */
    const readAt = (end: Date): Date => (end >= now ? now : new Date(end.getTime() - 1));

    /* -- Trends ---------------------------------------------------------- */

    const activeBuckets = emptyBuckets(win, zone);
    const signupBuckets = emptyBuckets(win, zone);
    const churnBuckets = emptyBuckets(win, zone);
    const retention: { label: string; value: number | null }[] = [];

    // Each bucket reads the state at its END (or now, for the bucket still
    // running), so the last point is the KPI and "{total} now" on the chart.
    const keys = [...activeBuckets.keys()];
    keys.forEach((key, index) => {
      const next = keys[index + 1];
      const at = readAt(next === undefined ? win.end : zonedDayStart(next, zone));
      const stillLive = liveMembersAt(subscriptions, at, now);
      activeBuckets.set(key, stillLive.size);

      const cohort = liveMembersAt(subscriptions, new Date(at.getTime() - lookbackMs), now);
      const kept = [...cohort].filter((id) => stillLive.has(id)).length;
      retention.push({
        label: key,
        // No cohort is not 0% retention — it is no retention rate at all.
        value: cohort.size === 0 ? null : Math.round((kept / cohort.size) * 1000) / 10,
      });
    });

    for (const member of members) {
      const key = bucketKey(member.joinedAt, win.bucket, zone);
      if (signupBuckets.has(key)) {
        signupBuckets.set(key, (signupBuckets.get(key) ?? 0) + 1);
      }
    }

    /* -- People: churn and standing now ---------------------------------- */

    const byMember = new Map<string, MemberTimelineRow[]>();
    for (const sub of subscriptions) {
      const rows = byMember.get(sub.memberId) ?? [];
      rows.push(sub);
      byMember.set(sub.memberId, rows);
    }

    const statusCounts = new Map<MembershipStatus, number>();
    let churned = 0;
    for (const rows of byMember.values()) {
      const status = standingNow(rows, now);
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

      // CHURNED: a person whose LAST membership ended inside the window and who
      // holds nothing now — nothing in force, frozen or scheduled. A person is
      // counted once, on the day their last membership ended.
      if (status !== 'expired') continue;
      let lastEnd: Date | null = null;
      for (const sub of rows) {
        const end = churnMoment(sub);
        if (end !== null && (lastEnd === null || end > lastEnd)) lastEnd = end;
      }
      if (lastEnd === null || lastEnd < win.start || lastEnd >= win.end) continue;
      churned += 1;
      const key = bucketKey(lastEnd, win.bucket, zone);
      if (churnBuckets.has(key)) {
        churnBuckets.set(key, (churnBuckets.get(key) ?? 0) + 1);
      }
    }

    /* -- Snapshots ------------------------------------------------------- */

    // `_sum` is null when nothing matched — worth the same as zero here.
    const grossFromMembers = (payments._sum.amount ?? 0) - (payments._sum.refundedAmount ?? 0);
    const fromSubscriptions = invoices._sum.amount ?? 0;
    const lifetime = grossFromMembers + fromSubscriptions;

    const newSignups = members.length;

    return {
      granularity: query.granularity,
      retentionWindow: query.retentionWindow,
      expiringWindow: query.expiringWindow,
      period,
      currency: locale.currency,
      kpis: {
        // The dashboard's active rule at the end of the window — at now for any
        // window that reaches today, where it equals the overview's figure.
        activeMembers: liveMembersAt(subscriptions, readAt(win.end), now).size,
        frozenMembers: statusCounts.get('frozen') ?? 0,
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
      // One row per PERSON who has ever held a membership, by where they stand
      // now, so the rows add up to that head-count and `active` is the KPI.
      byStatus: MEMBERSHIP_STATUSES.map(
        (status): MembershipStatusSlice => ({ status, count: statusCounts.get(status) ?? 0 }),
      ).filter((slice) => slice.count > 0),
    };
  }
}

/**
 * Where one person stands now, from all their subscriptions — exactly one of:
 *
 *  • `active`    — a membership in force on an ACTIVE account (the #441 rule).
 *  • `frozen`    — otherwise, a FROZEN membership on an account not suspended.
 *  • `suspended` — otherwise, a membership in force on an account that is not
 *                  ACTIVE (suspended or invited): paid for, but not let in.
 *  • `upcoming`  — otherwise, a membership whose period has not started yet.
 *  • `expired`   — otherwise: every membership they held has ended.
 *
 * `active` and `frozen` match `activeMemberWhere` / `frozenMemberWhere`, so these
 * rows agree with the overview, the plan mix and the members page.
 */
function standingNow(rows: MemberTimelineRow[], now: Date): MembershipStatus {
  if (rows.some((sub) => wasLiveAt(sub, now, now))) return 'active';
  const memberStatus = rows[0]?.memberStatus;
  if (
    memberStatus !== GymMemberStatus.SUSPENDED &&
    rows.some((sub) => sub.status === SubscriptionStatus.FROZEN)
  ) {
    return 'frozen';
  }
  const inForce = (sub: MemberTimelineRow) =>
    IN_FORCE_STATUSES.has(sub.status) &&
    sub.currentPeriodStart <= now &&
    sub.currentPeriodEnd >= now;
  if (rows.some(inForce)) return 'suspended';
  if (rows.some((sub) => IN_FORCE_STATUSES.has(sub.status) && sub.currentPeriodStart > now)) {
    return 'upcoming';
  }
  return 'expired';
}
