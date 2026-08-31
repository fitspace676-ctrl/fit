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
import { atLocation, memberAtLocation } from '../common/location-filter.util';
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
 *
 * ## `locationId` narrows every figure on this tab — under TWO stated rules
 *
 * Stage 2 gave `GymMember` a home branch, which closed the gap this tab used to
 * carry: `Invoice` and `Subscription` still own no `locationId`, but each names a
 * member that does, so the recurring stream finally has an honest path. Every
 * figure below is now a real branch figure. Nothing here is gym-wide any more, and
 * the console's "recurring revenue is gym-wide" caption is retired.
 *
 * The two rules are the ones in `common/location-filter.util.ts`, and this tab is
 * the one place they meet inside a single number, so both are named here:
 *
 * | Figure | Attributed by | Fragment |
 * |---|---|---|
 * | `revenueOverTime[].oneOff`, `byLocation` | the till it rang up on, frozen on `Payment.locationId` | {@link atLocation} |
 * | `revenueOverTime[].recurring` | the member's home branch, frozen on `Invoice.locationId` | {@link atLocation} |
 * | `mrrOverTime`, `kpis.mrr`, `projected`, `atRisk*` | the MEMBER's home branch, LIVE | {@link memberAtLocation} |
 * | `outstanding` | the member's home branch, frozen on `Invoice.locationId` | {@link atLocation} |
 *
 * **Stage 5 froze four of those five and deliberately left the fifth live**, which
 * is the one thing to understand before reading this tab. `Payment`, `Refund` and
 * `Invoice` now carry their own `locationId`, stamped at write time, so the reads
 * below are plain equalities served by `(gymId, locationId, createdAt)` instead of
 * relation filters issued in a loop. `Subscription` did not get a column: the gym
 * owner decided that a transferring member's recurring revenue FOLLOWS THEM, so
 * MRR keeps the live member hop on purpose.
 *
 * So this tab shows both rules at once, and that is intentional rather than a
 * half-finished migration: **money already taken stays where it was taken; the
 * recurring base follows the person.** Transfer a member today and their past
 * invoices stay in the old branch's `recurring` and `outstanding` while their MRR
 * moves to the new branch the same day. Freezing `Subscription` to "make it
 * consistent" would reverse a product decision — see `common/location-filter.util.ts`.
 *
 * **`outstanding` is the read that most wanted a hybrid, and does not get one.**
 * That set mixes order-backed invoices with subscription ones, so "order branch if
 * it has an order, member branch otherwise" is available and is exactly the trap:
 * a total assembled from two different attributions is a number whose definition
 * changes row by row, and it would not reconcile against either neighbour on the
 * screen. One rule for every invoice — the member who owes it — and a branch's
 * outstanding figure is then a straight answer to "what do the members we look
 * after owe us", which is also the list its staff would work down.
 *
 * ### The two composites, pinned
 *
 * `kpis.totalRevenue` and `kpis.revenuePerMember` were composites of a branch
 * figure and a gym-wide one. They are not any more, and their new shape is:
 *
 *   • **`kpis.totalRevenue` = takings rung up at this branch + recurring revenue
 *     from members homed at it.** Two attributions in one sum, deliberately: it is
 *     what a branch P&L is, and both halves partition the gym exactly, so the
 *     branches still add to the gym-wide total with nothing double-counted.
 *   • **`kpis.revenuePerMember` = that total ÷ live members homed at this branch.**
 *     Its numerator now includes the one-off half attributed by till, so a member
 *     homed at A who buys a shake at B nudges B's ratio up by that shake. Known,
 *     small, and preferable to the alternative — attributing takings by buyer
 *     would erase every guest and walk-in sale and put the branch's revenue out of
 *     step with its own cash reconciliation.
 *
 * Stage 5 still denormalises `locationId` onto `Payment` / `Refund` / `Invoice`
 * and adds `Subscription.locationId`. After Stage 2 that is an INDEX change, not a
 * truth change: it makes these filters index-served without moving one lari
 * between branches.
 *
 * The console's caption for this tab —
 *
 *     Recurring revenue, MRR, the projection and outstanding invoices are
 *     gym-wide — subscription billing has no branch yet. Total revenue combines
 *     this branch's one-off takings with the gym's recurring.
 *
 * — is RETIRED in full. Every clause of it is now false.
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
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: win.start, lt: win.end },
          // The till's own branch, off the column Stage 5 denormalised from the
          // order — index-served by `(gymId, locationId, createdAt)` where the
          // relation filter this replaced planned as a join plus a heap filter.
          ...atLocation(query.locationId),
        },
        select: {
          amount: true,
          refundedAmount: true,
          currency: true,
          createdAt: true,
          // The payment's OWN branch, not `order.location` as this read used
          // before. The filter above and this label have to come from one column
          // or the breakdown can disagree with the filter that produced it — and
          // it also drops a join from a read that returns every payment in the
          // window.
          location: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // `orderId: null` is the double-count guard — see the class comment.
      //
      // Branch-filtered on `Invoice.locationId`, which Stage 5 stamped from the
      // billed MEMBER's home branch at issue time — never from the order (`orderId`
      // is null on every row this read returns, so an order path would match
      // nothing at all). Same rule as `outstanding` below, which is what keeps the
      // two reconcilable.
      //
      // **This is now FROZEN where it used to be live, and that is the fix.**
      // `GymMember.locationId` is editable (`members.service.ts`), so under the old
      // member hop transferring one member silently rewrote their entire billing
      // history into the new branch — restating `recurring` for months already
      // closed, at both branches. A past charge does not move because a person
      // later did.
      //
      // No trash guard, matching the class note: cash that settled is revenue even
      // if the member was later moved to trash. The `deletedAt` filters below are
      // on the head-count reads only. (Dropping the guard here is also why the
      // column read beats the hop on more than speed — the hop needed a `member`
      // relation this figure did not otherwise want.)
      this.prisma.client.invoice.findMany({
        where: {
          status: InvoiceStatus.PAID,
          orderId: null,
          issuedAt: { gte: win.start, lt: win.end },
          ...atLocation(query.locationId),
        },
        select: { amount: true, currency: true, issuedAt: true },
        orderBy: { issuedAt: 'asc' },
      }),
      // NOT window-scoped: a debt does not stop being owed because the chart is
      // showing last week.
      //
      // Branch-scoped on the invoice's own column, and note what that decides.
      // This set MIXES order-backed and subscription invoices; attributing the
      // first kind by its order and the second by its member would make the
      // total's meaning change row by row. One rule wins — the member who owed it
      // when it was raised — so the figure reads "what the members homed here
      // still owe", whatever raised the document. See the class note.
      //
      // A NULL `locationId` (the member was purged, or their branch retired) is
      // excluded by the equality and stays in the gym-wide roll-up. That is the
      // same residual class the member hop already dropped, not a new gap.
      this.prisma.client.invoice.findMany({
        where: {
          status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
          ...atLocation(query.locationId),
        },
        select: { amount: true, status: true, dueDate: true },
      }),
      // Every subscription, not just the window's: the MRR trend needs state at
      // instants BEFORE the window opens. Branch-filtered through the member's
      // home branch — the same fragment `activeMembers`, the projection and the
      // Members tab's retention cohorts read, so the MRR card and the
      // active-member count beside it can never be about different populations.
      //
      // **Deliberately still the LIVE member hop, and the only read on this tab
      // that is.** Stage 5 gave `Payment`, `Refund` and `Invoice` frozen columns
      // and stopped here on purpose: the gym owner was asked whether a member who
      // transfers takes their recurring revenue with them, and said yes. So MRR
      // follows the person, by decision — `Subscription` gets no `locationId`, and
      // "finishing the job" by adding one would silently reverse that answer.
      // The invoice reads above are frozen precisely because they are the other
      // rule: money already taken stays where it was taken.
      this.prisma.client.subscription.findMany({
        where: memberAtLocation(query.locationId, { deletedAt: null }),
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
      // A payment with no branch is counted under its own label, never folded
      // into a named one: NULL means "not attributable" (its order's branch was
      // retired), not "the main branch". Dropping it instead would stop these
      // rows adding up to the gym total. Unreachable when a branch IS selected —
      // the filter is an equality on a real id.
      const label = payment.location?.name ?? NO_LOCATION_LABEL;
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
        // `windowRevenue` is this branch's till takings PLUS the recurring
        // revenue of the members homed here — the branch-P&L definition pinned in
        // the class note. Both halves partition the gym, so the branches sum back
        // to the gym-wide figure exactly once.
        totalRevenue: windowRevenue,
        mrr: mrrAt(subscriptions, win.end),
        // Divided by the live members homed at this branch, not the gym's. The
        // numerator's one-off half is attributed by till rather than by buyer, so
        // a cross-branch drop-in purchase lands in the ratio of the branch that
        // sold it; see the class note for why that is the lesser of the two errors.
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
      // `locationCount` stays a count of the GYM's branches on purpose: it answers
      // "is this gym multi-branch", which a filter on one branch does not change.
      // With a `locationId` the breakdown itself collapses to that single row —
      // redundant beside the filter, which is why the console hides the card in
      // that mode rather than the API nulling a real answer.
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
