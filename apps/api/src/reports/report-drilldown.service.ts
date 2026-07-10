import { Injectable } from '@nestjs/common';
import { PaymentStatus, Role, SubscriptionStatus } from '@fit/db';
import {
  REPORT_METRIC_DEFINITIONS,
  type ReportDrilldown,
  type ReportDrilldownQuery,
  type ReportKpi,
  type ReportMetric,
  type ReportSection,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import {
  bucketKey,
  DEFAULT_CURRENCY,
  emptyBuckets,
  isoDate,
  rate,
  resolveWindow,
  type ReportWindow,
} from './report-window.util';

/** Subscription states that count a member as currently subscribed (not churned). */
const LIVE_SUB_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
];

/** Weekday row labels for the peak-hours heatmap (Monday-first, matching bucketKey). */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** Label for revenue on orders with no linked plan (product / POS sales). */
const RETAIL_LABEL = 'Retail';
/** Label for revenue on orders with no linked location. */
const NO_LOCATION_LABEL = 'No location';

/** What a metric resolves to before it is wrapped as a {@link ReportDrilldown}. */
interface ComputedDrilldown {
  currency: string;
  kpis: ReportKpi[];
  sections: ReportSection[];
}

/**
 * Read side of the Reports drill-down framework (T12.12).
 *
 * Produces the chart-oriented {@link ReportDrilldown} for the three T12.12 metrics
 * — `revenue`, `members`, `attendance` — each a headline KPI row plus an ordered
 * list of typed {@link ReportSection}s the client renders with the brand Astryx
 * charts. Every figure is a REAL aggregation over rows that already exist (same
 * honesty contract as {@link AnalyticsService} / {@link ReportsService}); a section
 * with no source rows in the window is an empty section, never a fabricated zero.
 *
 * Revenue/member aggregates run on the **tenant-scoped** {@link TenantPrismaService}
 * (auto-constrained to the caller's gym). {@link CheckIn} is deliberately *not* in
 * the tenant extension's model set (see `check-in.service.ts`), so the attendance
 * queries pin `gymId` explicitly from {@link TenantContext}, exactly like the
 * reception feed.
 */
@Injectable()
export class ReportDrilldownService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** Build one drill-down report for on-screen rendering. */
  async run(metric: ReportMetric, query: ReportDrilldownQuery): Promise<ReportDrilldown> {
    const definition = REPORT_METRIC_DEFINITIONS[metric];
    const win = resolveWindow(query.range);
    const computed = await this.compute(metric, win);
    return {
      metric,
      name: definition.name,
      description: definition.description,
      range: query.range,
      currency: computed.currency,
      kpis: computed.kpis,
      sections: computed.sections,
    };
  }

  /**
   * Resolve one report section to its live data — the read behind a pinned
   * dashboard widget. Returns `null` when the metric no longer emits that section
   * id (a report changed shape), so the dashboard silently drops a stale pin rather
   * than render a broken widget.
   */
  async resolveSection(
    metric: ReportMetric,
    sectionId: string,
    query: ReportDrilldownQuery,
  ): Promise<{ currency: string; section: ReportSection } | null> {
    const computed = await this.compute(metric, resolveWindow(query.range));
    const section = computed.sections.find((candidate) => candidate.id === sectionId);
    return section ? { currency: computed.currency, section } : null;
  }

  private compute(metric: ReportMetric, win: ReportWindow): Promise<ComputedDrilldown> {
    switch (metric) {
      case 'revenue':
        return this.revenue(win);
      case 'members':
        return this.members(win);
      case 'attendance':
        return this.attendance(win);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Revenue                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Captured takings over the window, from {@link Payment} rows (status CAPTURED)
   * joined to their {@link Order} for the plan + location attribution. "Net" is
   * `amount − refundedAmount` throughout, in MINOR units. Subscriptions raise no
   * payments in the MVP, so this is order/POS revenue only — the plan breakdown
   * attributes each order to its `package` (or "Retail" for a product sale), never
   * fabricating subscription cash.
   */
  private async revenue(win: ReportWindow): Promise<ComputedDrilldown> {
    const payments = await this.prisma.client.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      select: {
        amount: true,
        refundedAmount: true,
        currency: true,
        createdAt: true,
        order: {
          select: {
            package: { select: { name: true } },
            location: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const currency = payments[payments.length - 1]?.currency ?? (await this.resolveCurrency());

    const overTime = emptyBuckets(win);
    const byPlan = new Map<string, number>();
    const byLocation = new Map<string, number>();
    const monthly = new Map<string, { orders: number; gross: number; refunded: number }>();
    let totalNet = 0;
    let totalRefunded = 0;

    for (const payment of payments) {
      const net = payment.amount - payment.refundedAmount;
      totalNet += net;
      totalRefunded += payment.refundedAmount;

      const timeKey = bucketKey(payment.createdAt, win.bucket);
      if (overTime.has(timeKey)) {
        overTime.set(timeKey, (overTime.get(timeKey) ?? 0) + net);
      }

      const planLabel = payment.order.package?.name ?? RETAIL_LABEL;
      byPlan.set(planLabel, (byPlan.get(planLabel) ?? 0) + net);

      const locationLabel = payment.order.location?.name ?? NO_LOCATION_LABEL;
      byLocation.set(locationLabel, (byLocation.get(locationLabel) ?? 0) + net);

      const monthKey = monthStart(payment.createdAt);
      const month = monthly.get(monthKey) ?? { orders: 0, gross: 0, refunded: 0 };
      month.orders += 1;
      month.gross += payment.amount;
      month.refunded += payment.refundedAmount;
      monthly.set(monthKey, month);
    }

    const orders = payments.length;
    const kpis: ReportKpi[] = [
      { id: 'total-revenue', label: 'Net revenue', value: totalNet, unit: 'money' },
      { id: 'orders', label: 'Orders', value: orders, unit: 'count' },
      {
        id: 'avg-order',
        label: 'Avg order',
        value: orders === 0 ? 0 : Math.round(totalNet / orders),
        unit: 'money',
      },
      { id: 'refunded', label: 'Refunded', value: totalRefunded, unit: 'money' },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'series',
        id: 'revenue-over-time',
        title: 'Revenue over time',
        unit: 'money',
        points: [...overTime.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        kind: 'breakdown',
        id: 'revenue-by-plan',
        title: 'Revenue by plan type',
        unit: 'money',
        items: sortedBreakdown(byPlan),
      },
      {
        kind: 'breakdown',
        id: 'revenue-by-location',
        title: 'Revenue by location',
        unit: 'money',
        items: sortedBreakdown(byLocation),
      },
      {
        kind: 'table',
        id: 'revenue-monthly',
        title: 'Monthly breakdown',
        columns: [
          { key: 'period', label: 'Month', type: 'date' },
          { key: 'orders', label: 'Orders', type: 'number' },
          { key: 'gross', label: 'Gross', type: 'money' },
          { key: 'refunded', label: 'Refunded', type: 'money' },
          { key: 'net', label: 'Net', type: 'money' },
        ],
        rows: [...monthly.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, m]) => ({
            period,
            orders: m.orders,
            gross: m.gross,
            refunded: m.refunded,
            net: m.gross - m.refunded,
          })),
      },
    ];

    return { currency, kpis, sections };
  }

  /* ---------------------------------------------------------------------- */
  /*  Members                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Membership health over the window. New members come from {@link GymMember}
   * `joinedAt` (role MEMBER); active-vs-expired and churn come from
   * {@link Subscription} states — a member is "active" if they hold any live
   * subscription ({@link LIVE_SUB_STATUSES}), "expired" if all their subscriptions
   * are terminal (CANCELED / EXPIRED). Churn is terminal subscriptions in a bucket
   * as a percentage of the subscriptions active at that bucket's start.
   */
  private async members(win: ReportWindow): Promise<ComputedDrilldown> {
    const [members, subscriptions, totalMembers] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where: { role: Role.MEMBER, joinedAt: { lt: win.end } },
        select: { joinedAt: true },
      }),
      this.prisma.client.subscription.findMany({
        select: {
          memberId: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.client.gymMember.count({ where: { role: Role.MEMBER } }),
    ]);

    // New members over time + the pre-window baseline for the cumulative column.
    const newOverTime = emptyBuckets(win);
    let joinedBefore = 0;
    for (const member of members) {
      if (member.joinedAt < win.start) {
        joinedBefore += 1;
        continue;
      }
      const key = bucketKey(member.joinedAt, win.bucket);
      if (newOverTime.has(key)) {
        newOverTime.set(key, (newOverTime.get(key) ?? 0) + 1);
      }
    }

    // Active vs expired — a current snapshot per member across all their subs.
    const memberLive = new Map<string, boolean>();
    for (const sub of subscriptions) {
      const isLive = LIVE_SUB_STATUSES.includes(sub.status);
      memberLive.set(sub.memberId, (memberLive.get(sub.memberId) ?? false) || isLive);
    }
    let active = 0;
    let expired = 0;
    for (const live of memberLive.values()) {
      if (live) {
        active += 1;
      } else {
        expired += 1;
      }
    }

    // Churn trend — terminal subs per bucket over the subs active at bucket start.
    const churnBuckets = emptyBuckets(win);
    const activeAtStart = emptyBuckets(win);
    for (const [key] of churnBuckets) {
      const bucketStart = new Date(`${key}T00:00:00.000Z`);
      let base = 0;
      for (const sub of subscriptions) {
        if (sub.createdAt < bucketStart && !isTerminalBefore(sub, bucketStart)) {
          base += 1;
        }
      }
      activeAtStart.set(key, base);
    }
    for (const sub of subscriptions) {
      const churnedAt = churnMoment(sub);
      if (!churnedAt || churnedAt < win.start || churnedAt >= win.end) {
        continue;
      }
      const key = bucketKey(churnedAt, win.bucket);
      if (churnBuckets.has(key)) {
        churnBuckets.set(key, (churnBuckets.get(key) ?? 0) + 1);
      }
    }

    // Monthly breakdown — new + churned + net + running total members.
    const monthlyNew = new Map<string, number>();
    for (const member of members) {
      if (member.joinedAt < win.start) {
        continue;
      }
      const key = monthStart(member.joinedAt);
      monthlyNew.set(key, (monthlyNew.get(key) ?? 0) + 1);
    }
    const monthlyChurn = new Map<string, number>();
    for (const sub of subscriptions) {
      const churnedAt = churnMoment(sub);
      if (!churnedAt || churnedAt < win.start || churnedAt >= win.end) {
        continue;
      }
      const key = monthStart(churnedAt);
      monthlyChurn.set(key, (monthlyChurn.get(key) ?? 0) + 1);
    }
    const monthKeys = [...new Set([...monthlyNew.keys(), ...monthlyChurn.keys()])].sort();
    let running = joinedBefore;
    const monthlyRows = monthKeys.map((period) => {
      const newMembers = monthlyNew.get(period) ?? 0;
      const churned = monthlyChurn.get(period) ?? 0;
      running += newMembers;
      return {
        period,
        newMembers,
        churned,
        netGrowth: newMembers - churned,
        totalMembers: running,
      };
    });

    const newInWindow = [...newOverTime.values()].reduce((sum, value) => sum + value, 0);
    const churnedInWindow = [...churnBuckets.values()].reduce((sum, value) => sum + value, 0);
    const baseAtWindowStart = [...activeAtStart.values()][0] ?? 0;
    const windowChurnRate = baseAtWindowStart === 0 ? 0 : rate(churnedInWindow, baseAtWindowStart);

    const kpis: ReportKpi[] = [
      { id: 'total-members', label: 'Total members', value: totalMembers, unit: 'count' },
      { id: 'new-members', label: 'New members', value: newInWindow, unit: 'count' },
      { id: 'active-members', label: 'Active', value: active, unit: 'count' },
      { id: 'churn-rate', label: 'Churn rate', value: windowChurnRate, unit: 'percent' },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'series',
        id: 'new-members-over-time',
        title: 'New members over time',
        unit: 'count',
        points: [...newOverTime.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        kind: 'split',
        id: 'active-vs-expired',
        title: 'Active vs expired',
        unit: 'count',
        slices: [
          { label: 'Active', value: active, tone: 'positive' },
          { label: 'Expired', value: expired, tone: 'negative' },
        ],
      },
      {
        kind: 'series',
        id: 'churn-rate-trend',
        title: 'Churn rate trend',
        unit: 'percent',
        points: [...churnBuckets.entries()].map(([label, churned]) => {
          const base = activeAtStart.get(label) ?? 0;
          return { label, value: base === 0 ? 0 : rate(churned, base) };
        }),
      },
      {
        kind: 'table',
        id: 'members-monthly',
        title: 'Monthly breakdown',
        columns: [
          { key: 'period', label: 'Month', type: 'date' },
          { key: 'newMembers', label: 'New members', type: 'number' },
          { key: 'churned', label: 'Churned', type: 'number' },
          { key: 'netGrowth', label: 'Net growth', type: 'number' },
          { key: 'totalMembers', label: 'Total members', type: 'number' },
        ],
        rows: monthlyRows,
      },
    ];

    return { currency: DEFAULT_CURRENCY, kpis, sections };
  }

  /* ---------------------------------------------------------------------- */
  /*  Attendance                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Gym arrivals over the window from {@link CheckIn}. `CheckIn` is not in the
   * tenant extension's scoped set, so `gymId` is pinned explicitly from
   * {@link TenantContext} (like the reception feed). Surfaces check-ins over time,
   * a weekday × hour peak-hours heatmap, and a per-day table with unique visitors.
   */
  private async attendance(win: ReportWindow): Promise<ComputedDrilldown> {
    const checkIns = await this.prisma.client.checkIn.findMany({
      where: { gymId: this.tenant.gymId, checkedInAt: { gte: win.start, lt: win.end } },
      select: { gymMemberId: true, checkedInAt: true },
      orderBy: { checkedInAt: 'asc' },
    });

    const overTime = emptyBuckets(win);
    const heatmap: number[][] = WEEKDAYS.map(() => new Array<number>(24).fill(0));
    const daily = new Map<string, { count: number; members: Set<string> }>();
    const uniqueMembers = new Set<string>();

    for (const checkIn of checkIns) {
      const at = checkIn.checkedInAt;
      uniqueMembers.add(checkIn.gymMemberId);

      const timeKey = bucketKey(at, win.bucket);
      if (overTime.has(timeKey)) {
        overTime.set(timeKey, (overTime.get(timeKey) ?? 0) + 1);
      }

      const weekday = (at.getUTCDay() + 6) % 7; // Monday = 0
      const row = heatmap[weekday];
      if (row) {
        const hour = at.getUTCHours();
        row[hour] = (row[hour] ?? 0) + 1;
      }

      const dayKey = isoDate(at);
      const day = daily.get(dayKey) ?? { count: 0, members: new Set<string>() };
      day.count += 1;
      day.members.add(checkIn.gymMemberId);
      daily.set(dayKey, day);
    }

    const total = checkIns.length;
    const days = Math.max(
      1,
      Math.round((win.end.getTime() - win.start.getTime()) / (24 * 3600000)),
    );
    const kpis: ReportKpi[] = [
      { id: 'total-checkins', label: 'Check-ins', value: total, unit: 'count' },
      { id: 'unique-members', label: 'Unique members', value: uniqueMembers.size, unit: 'count' },
      { id: 'avg-per-day', label: 'Avg / day', value: Math.round(total / days), unit: 'count' },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'series',
        id: 'checkins-over-time',
        title: 'Check-ins over time',
        unit: 'count',
        points: [...overTime.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        kind: 'heatmap',
        id: 'peak-hours',
        title: 'Peak hours',
        rowLabels: [...WEEKDAYS],
        colLabels: Array.from({ length: 24 }, (_, hour) => String(hour)),
        cells: heatmap,
      },
      {
        kind: 'table',
        id: 'attendance-daily',
        title: 'Daily breakdown',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'checkIns', label: 'Check-ins', type: 'number' },
          { key: 'uniqueMembers', label: 'Unique members', type: 'number' },
        ],
        rows: [...daily.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, day]) => ({
            date,
            checkIns: day.count,
            uniqueMembers: day.members.size,
          })),
      },
    ];

    return { currency: DEFAULT_CURRENCY, kpis, sections };
  }

  /**
   * The gym's reporting currency — the most recent captured payment's currency,
   * falling back to the schema default when the gym has taken none, mirroring
   * {@link ReportsService.resolveCurrency}.
   */
  private async resolveCurrency(): Promise<string> {
    const latest = await this.prisma.client.payment.findFirst({
      where: { status: PaymentStatus.CAPTURED },
      orderBy: { createdAt: 'desc' },
      select: { currency: true },
    });
    return latest?.currency ?? DEFAULT_CURRENCY;
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** A subscription's terminal instant (churn moment), or `null` if still live. */
function churnMoment(sub: {
  status: SubscriptionStatus;
  canceledAt: Date | null;
  updatedAt: Date;
}): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED) {
    return sub.canceledAt ?? sub.updatedAt;
  }
  if (sub.status === SubscriptionStatus.EXPIRED) {
    return sub.updatedAt;
  }
  return null;
}

/** Whether a subscription had already churned before the given instant. */
function isTerminalBefore(
  sub: { status: SubscriptionStatus; canceledAt: Date | null; updatedAt: Date },
  at: Date,
): boolean {
  const churnedAt = churnMoment(sub);
  return churnedAt !== null && churnedAt < at;
}

/** The `YYYY-MM-01` month key an instant falls into (UTC). */
function monthStart(at: Date): string {
  return isoDate(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)));
}

/** A label→value map as breakdown items, richest first, dropping empty slices. */
function sortedBreakdown(totals: Map<string, number>): { label: string; value: number }[] {
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value !== 0)
    .sort((a, b) => b.value - a.value);
}
