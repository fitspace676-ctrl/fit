import { Injectable } from '@nestjs/common';
import {
  InvoiceStatus,
  LocationStatus,
  PaymentStatus,
  SubscriptionInterval,
  SubscriptionStatus,
} from '@fit/db';
import {
  PROJECTION_WINDOW_DAYS,
  SALES_GRANULARITY_RANGE,
  type DashboardRevenueQuery,
  type DashboardRevenueResponse,
  type RevenueLocationSlice,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { zonedDayStart } from '../reports/zoned-time.util';
import {
  bucketKey,
  DAY_MS,
  emptyBuckets,
  isoDate,
  resolveWindow,
} from '../reports/report-window.util';
import {
  liveMembersAt,
  wasLiveAt,
  type SubscriptionTimelineRow,
} from './subscription-timeline.util';

/** Label for takings on an order that names no location. */
const NO_LOCATION_LABEL = 'No location';

/** Everything the projection and the MRR reconstruction read off a subscription. */
interface RevenueSubscriptionRow extends SubscriptionTimelineRow {
  priceAmount: number;
  interval: SubscriptionInterval;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/**
 * Read side of the hand-built Revenue dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, the two-stream revenue
 * trend, the MRR trend, the projection, the outstanding-invoice snapshot and the
 * location breakdown. Money is in MINOR units throughout.
 *
 * Two rules decide every figure here and are worth stating once:
 *
 * **Nothing is counted twice.** A subscription charge mints an `Invoice`; an order
 * mints a `Payment` and possibly an `Invoice` carrying that `orderId`. Summing
 * `Payment{CAPTURED}` with `Invoice{PAID, orderId: null}` therefore sees every
 * money movement exactly once, and `orderId: null` is the whole guard.
 *
 * **Trashed members are filtered from the head-count reads, not from the money.**
 * A soft-deleted member is not billing, so their subscriptions leave MRR, the
 * projection and the per-member denominator. Cash already taken stays: a payment
 * that settled is revenue whether or not the member was later moved to trash, and
 * `Invoice`/`Order` deliberately survive a purge (`SetNull`) for that reason.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`.
 */
@Injectable()
export class DashboardRevenueService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly locales: GymLocaleService,
  ) {}

  /** Build the whole Revenue tab for one control combination. */
  async get(query: DashboardRevenueQuery): Promise<DashboardRevenueResponse> {
    // The gym's own calendar. Fetched BEFORE the aggregates because the window
    // itself is a calendar question: `resolveWindow` has to know where midnight
    // is before it can say which days the chart covers.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity], zone);
    const days = PROJECTION_WINDOW_DAYS[query.projectionWindow];
    const now = new Date();
    // Calendar day, not instant: a charge due later today belongs in today's
    // bucket, and an invoice due today is not yet late.
    const todayStart = zonedDayStart(isoDate(now, zone), zone);
    const horizon = new Date(todayStart.getTime() + days * DAY_MS);

    const [payments, paidInvoices, unsettled, subscriptions, locationCount] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          refundedAmount: true,
          currency: true,
          createdAt: true,
          order: { select: { location: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // `orderId: null` is the double-count guard — see the class comment.
      this.prisma.client.invoice.findMany({
        where: {
          status: InvoiceStatus.PAID,
          orderId: null,
          issuedAt: { gte: win.start, lt: win.end },
        },
        select: { amount: true, currency: true, issuedAt: true },
        orderBy: { issuedAt: 'asc' },
      }),
      // Gym-wide and NOT window-scoped: a debt does not stop being owed because
      // the chart is showing last week.
      this.prisma.client.invoice.findMany({
        where: { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] } },
        select: { amount: true, status: true, dueDate: true },
      }),
      // Every subscription, not just the window's: the MRR trend needs state at
      // instants BEFORE the window opens.
      this.prisma.client.subscription.findMany({
        where: { member: { deletedAt: null } },
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
          priceAmount: true,
          interval: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      }),
      this.prisma.client.location.count({ where: { status: LocationStatus.ACTIVE } }),
    ]);

    /* -- The two revenue streams ----------------------------------------- */

    const recurringBuckets = emptyBuckets(win, zone);
    const oneOffBuckets = emptyBuckets(win, zone);
    const byLocation = new Map<string, number>();

    for (const payment of payments) {
      const net = payment.amount - payment.refundedAmount;
      const key = bucketKey(payment.createdAt, win.bucket, zone);
      if (oneOffBuckets.has(key)) {
        oneOffBuckets.set(key, (oneOffBuckets.get(key) ?? 0) + net);
      }
      const label = payment.order.location?.name ?? NO_LOCATION_LABEL;
      byLocation.set(label, (byLocation.get(label) ?? 0) + net);
    }

    for (const invoice of paidInvoices) {
      const key = bucketKey(invoice.issuedAt, win.bucket, zone);
      if (recurringBuckets.has(key)) {
        recurringBuckets.set(key, (recurringBuckets.get(key) ?? 0) + invoice.amount);
      }
    }

    const totalRecurring = sum([...recurringBuckets.values()]);
    const totalOneOff = sum([...oneOffBuckets.values()]);

    /* -- MRR -------------------------------------------------------------- */

    const mrrOverTime = [...recurringBuckets.keys()].map((label) => ({
      label,
      value: mrrAt(subscriptions, new Date(`${label}T00:00:00.000Z`)),
    }));

    /* -- Snapshots -------------------------------------------------------- */

    const activeMembers = liveMembersAt(subscriptions, win.end).size;
    const windowRevenue = totalRecurring + totalOneOff;

    let count = 0;
    let total = 0;
    let overdueCount = 0;
    let overdueTotal = 0;
    let failedCount = 0;
    let failedTotal = 0;
    for (const invoice of unsettled) {
      count += 1;
      total += invoice.amount;
      // An invoice with no stated deadline is outstanding but never overdue.
      if (invoice.dueDate !== null && invoice.dueDate < todayStart) {
        overdueCount += 1;
        overdueTotal += invoice.amount;
      }
      if (invoice.status === InvoiceStatus.FAILED) {
        failedCount += 1;
        failedTotal += invoice.amount;
      }
    }

    /* -- Projection -------------------------------------------------------- */

    const projectedBuckets = new Map<string, number>();
    for (let offset = 0; offset < days; offset += 1) {
      projectedBuckets.set(isoDate(new Date(todayStart.getTime() + offset * DAY_MS)), 0);
    }

    let atRiskCount = 0;
    let atRiskTotal = 0;
    for (const sub of subscriptions) {
      if (sub.status === SubscriptionStatus.PAST_DUE) {
        atRiskCount += 1;
        atRiskTotal += sub.priceAmount;
        continue;
      }
      // FROZEN is excluded because its period end moves when it resumes, so the
      // date on the row is not a charge date. `cancelAtPeriodEnd` is scheduled to
      // end, not to renew.
      if (sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.TRIAL) {
        continue;
      }
      if (sub.cancelAtPeriodEnd) continue;
      if (sub.currentPeriodEnd < todayStart || sub.currentPeriodEnd >= horizon) continue;
      const key = isoDate(sub.currentPeriodEnd, zone);
      projectedBuckets.set(key, (projectedBuckets.get(key) ?? 0) + sub.priceAmount);
    }

    const locations: RevenueLocationSlice[] = [...byLocation.entries()]
      .map(([location, value]) => ({ location, value }))
      .sort((a, b) => b.value - a.value);

    return {
      granularity: query.granularity,
      projectionWindow: query.projectionWindow,
      currency: locale.currency,
      kpis: {
        totalRevenue: windowRevenue,
        mrr: mrrAt(subscriptions, win.end),
        revenuePerMember: activeMembers === 0 ? 0 : Math.round(windowRevenue / activeMembers),
        outstandingTotal: total,
      },
      revenueOverTime: [...recurringBuckets.entries()].map(([label, recurring]) => ({
        label,
        recurring,
        oneOff: oneOffBuckets.get(label) ?? 0,
      })),
      mrrOverTime,
      projected: {
        total: sum([...projectedBuckets.values()]),
        points: [...projectedBuckets.entries()].map(([label, value]) => ({ label, value })),
        atRiskCount,
        atRiskTotal,
      },
      outstanding: { count, total, overdueCount, overdueTotal, failedCount, failedTotal },
      // Fewer than two active locations is not an empty breakdown — it is a
      // question that does not apply, and the client drops the card entirely.
      byLocation: locationCount < 2 ? null : locations,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

function sum(values: number[]): number {
  return values.reduce((running, value) => running + value, 0);
}

/** One subscription's price normalised to a month, in MINOR units. */
function monthlyValue(sub: RevenueSubscriptionRow): number {
  return sub.interval === SubscriptionInterval.YEAR
    ? Math.round(sub.priceAmount / 12)
    : sub.priceAmount;
}

/**
 * Whether a subscription was on a PAID plan at `at`.
 *
 * `updatedAt` is the boundary of what the row knows. At or after it, today's
 * status is exact, so only `ACTIVE` counts — a trial has not been charged, a
 * past-due charge was not collected, a frozen plan is paused. Before it, the row
 * has changed since and today's status says nothing about then; count it unless it
 * is a trial that never converted at all.
 *
 * Without that boundary a gym that churned half its base would draw a flat, low
 * MRR line for its whole history.
 */
function wasBillingAt(sub: RevenueSubscriptionRow, at: Date): boolean {
  if (!wasLiveAt(sub, at)) return false;
  if (sub.status === SubscriptionStatus.TRIAL) return false;
  if (at >= sub.updatedAt) return sub.status === SubscriptionStatus.ACTIVE;
  return true;
}

/** The monthly value of the paid subscription base at `at`. */
function mrrAt(subs: RevenueSubscriptionRow[], at: Date): number {
  let total = 0;
  for (const sub of subs) {
    if (wasBillingAt(sub, at)) total += monthlyValue(sub);
  }
  return total;
}
