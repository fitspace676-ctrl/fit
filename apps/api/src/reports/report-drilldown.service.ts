import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  LoyaltyRedemptionStatus,
  PaymentStatus,
  ReviewStatus,
  Role,
  SubscriptionStatus,
} from '@fit/db';
import {
  REPORT_METRIC_DEFINITIONS,
  reportCsvRow,
  reportXlsxRow,
  type ReportDrilldown,
  type ReportDrilldownQuery,
  type ReportDrilldownRow,
  type ReportKpi,
  type ReportMetric,
  type ReportSection,
  reportWindowInput,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { drilldownTables } from './drilldown-tabular.util';
import { buildWorkbook } from './xlsx';
import {
  bucketKey,
  emptyBuckets,
  isoDate,
  rate,
  resolveWindow,
  type ReportWindow,
  windowDays,
} from './report-window.util';
import { zonedParts } from './zoned-time.util';
import { resolveEmailLocale } from '../mail/email-locale';
import {
  localizeDrilldown,
  reportStrings,
  type ReportLocale,
  type ReportStrings,
} from './report-strings';

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
/** Bucket for class occurrences / bookings whose trainer was removed or never set. */
const UNASSIGNED_TRAINER_LABEL = 'Unassigned';

/** Booking outcomes that held a confirmed seat (attended or not) — the "booked" count. */
const CONFIRMED_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.BOOKED,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
];

/** What a metric resolves to before it is wrapped as a {@link ReportDrilldown}. */
interface ComputedDrilldown {
  currency: string;
  kpis: ReportKpi[];
  sections: ReportSection[];
}

/** Per-class running aggregate for the classes report. */
interface ClassAgg {
  sessions: number;
  capacity: number;
  booked: number;
  attended: number;
  noShow: number;
  canceled: number;
}

/** Per-trainer running aggregate for the staff report. */
interface TrainerAgg {
  classes: number;
  booked: number;
  attended: number;
  noShow: number;
  ratingSum: number;
  ratingCount: number;
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
    private readonly locale: GymLocaleService,
  ) {}

  /** Build one drill-down report for on-screen rendering. */
  async run(
    metric: ReportMetric,
    query: ReportDrilldownQuery,
    lang: ReportLocale | null = null,
  ): Promise<ReportDrilldown> {
    const definition = REPORT_METRIC_DEFINITIONS[metric];
    const { win, language, s } = await this.context(query, lang);
    const computed = await this.compute(metric, win, s);
    // Built in English and translated on the way out, by id — see `report-strings.ts`.
    return localizeDrilldown(
      {
        metric,
        name: definition.name,
        description: definition.description,
        range: query.range,
        // The days the window resolved to, for every range — see `ReportsService.runReport`.
        ...windowDays(win),
        currency: computed.currency,
        kpis: computed.kpis,
        sections: computed.sections,
      },
      language,
    );
  }

  /**
   * Stream one drill-down as CSV: each section in screen order, introduced by its
   * title, then its header row and its rows, separated by a blank line.
   *
   * A drill-down is several tables of different widths, and a single CSV cannot be
   * a grid of all of them at once. Titled blocks are the honest compromise — every
   * figure on the screen appears, and a reader (or a spreadsheet's text import)
   * can tell where one table ends and the next begins. The XLSX export is the one
   * to reach for when the sections need to stay separately sortable; it puts each
   * on its own tab.
   */
  async *streamDrilldownCsv(
    metric: ReportMetric,
    query: ReportDrilldownQuery,
    lang: ReportLocale | null = null,
  ): AsyncGenerator<string> {
    const built = await this.run(metric, query, lang);
    const tables = drilldownTables(built, reportStrings(await this.language(lang)).tabular);
    let first = true;
    for (const table of tables) {
      if (!first) {
        yield '\r\n';
      }
      first = false;
      yield `${csvCell(table.title)}\r\n`;
      yield `${table.columns.map((column) => csvCell(column.label)).join(',')}\r\n`;
      for (const row of table.rows) {
        yield `${reportCsvRow(table.columns, row).map(csvCell).join(',')}\r\n`;
      }
    }
  }

  /** Build one drill-down as an XLSX workbook — the KPI summary plus a tab per section. */
  async buildDrilldownXlsx(
    metric: ReportMetric,
    query: ReportDrilldownQuery,
    lang: ReportLocale | null = null,
  ): Promise<Buffer> {
    const built = await this.run(metric, query, lang);
    const tables = drilldownTables(built, reportStrings(await this.language(lang)).tabular);
    return buildWorkbook(
      tables.map((table) => ({
        name: table.title,
        headers: table.columns.map((column) => column.label),
        rows: table.rows.map((row) => reportXlsxRow(table.columns, row)),
      })),
    );
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
    lang: ReportLocale | null = null,
  ): Promise<{ currency: string; section: ReportSection } | null> {
    const built = await this.run(metric, query, lang);
    const section = built.sections.find((candidate) => candidate.id === sectionId);
    return section ? { currency: built.currency, section } : null;
  }

  /**
   * The query's window, answered in the gym's own zone (see `report-window.util`),
   * and the language to write in: the caller's when it said, the gym's otherwise.
   */
  /** The language a file export is written in — the caller's, else the gym's. */
  private async language(lang: ReportLocale | null): Promise<ReportLocale> {
    return lang ?? resolveEmailLocale((await this.locale.get()).language);
  }

  private async context(
    query: ReportDrilldownQuery,
    lang: ReportLocale | null,
  ): Promise<{ win: ReportWindow; language: ReportLocale; s: ReportStrings }> {
    const locale = await this.locale.get();
    const language = lang ?? resolveEmailLocale(locale.language);
    return {
      win: resolveWindow(reportWindowInput(query), locale.timezone),
      language,
      s: reportStrings(language),
    };
  }

  private compute(
    metric: ReportMetric,
    win: ReportWindow,
    s: ReportStrings,
  ): Promise<ComputedDrilldown> {
    switch (metric) {
      case 'sales':
        return this.sales(win, s);
      case 'revenue':
        return this.revenue(win, s);
      case 'members':
        return this.members(win);
      case 'attendance':
        return this.attendance(win);
      case 'classes':
        return this.classes(win, s);
      case 'staff':
        return this.staff(win);
      case 'pos':
        return this.pos(win, s);
      case 'loyalty':
        return this.loyalty(win, s);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Sales                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * The Sales drill-down — the segment's seven catalogue reports as one chart-first
   * page, the way the Members drill-down presents its own.
   *
   * The sales lens differs from the Revenue one in what it treats as a period's
   * figure. Revenue reads `Payment.refundedAmount`, which nets a refund back
   * against the sale that earned it. Sales counts money in and money out on the
   * days they MOVED — a refund issued today reduces today, not the month the sale
   * was reported in. Both are legitimate; they answer different questions, which is
   * why the two metrics coexist rather than one deriving from the other.
   */
  private async sales(win: ReportWindow, s: ReportStrings): Promise<ComputedDrilldown> {
    const [payments, refunds, planOrders] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          currency: true,
          method: true,
          createdAt: true,
          order: {
            select: {
              soldById: true,
              soldBy: {
                select: { firstName: true, lastName: true, user: { select: { name: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: {
          amount: true,
          createdAt: true,
          orderId: true,
          reason: true,
          processedBy: {
            select: { firstName: true, lastName: true, user: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.order.findMany({
        where: {
          packageId: { not: null },
          createdAt: { gte: win.start, lt: win.end },
          payment: { is: { status: PaymentStatus.CAPTURED } },
        },
        select: { total: true, package: { select: { name: true } } },
      }),
    ]);

    const currency = payments[payments.length - 1]?.currency ?? (await this.currency());

    const grossBuckets = emptyBuckets(win, win.zone);
    const refundBuckets = emptyBuckets(win, win.zone);
    const byMethod = new Map<string, number>();
    const bySeller = new Map<string, { label: string; value: number }>();
    let gross = 0;

    for (const payment of payments) {
      gross += payment.amount;
      const key = bucketKey(payment.createdAt, win.bucket, win.zone);
      if (grossBuckets.has(key)) {
        grossBuckets.set(key, (grossBuckets.get(key) ?? 0) + payment.amount);
      }
      const method = methodLabel(s, payment.method);
      byMethod.set(method, (byMethod.get(method) ?? 0) + payment.amount);

      const sellerKey = payment.order?.soldById ?? UNATTRIBUTED_SELLER_KEY;
      const seller = bySeller.get(sellerKey) ?? {
        label: payment.order?.soldBy ? sellerName(payment.order.soldBy, s) : s.values.unattributed,
        value: 0,
      };
      seller.value += payment.amount;
      bySeller.set(sellerKey, seller);
    }

    let refunded = 0;
    for (const refund of refunds) {
      refunded += refund.amount;
      const key = bucketKey(refund.createdAt, win.bucket, win.zone);
      if (refundBuckets.has(key)) {
        refundBuckets.set(key, (refundBuckets.get(key) ?? 0) + refund.amount);
      }
    }

    const byPlan = new Map<string, number>();
    for (const order of planOrders) {
      if (!order.package) {
        continue;
      }
      byPlan.set(order.package.name, (byPlan.get(order.package.name) ?? 0) + order.total);
    }

    // No gross tile: the owner removed it (2026-09-02). Net beside refunds says
    // the same thing without a second total to reconcile against.
    const kpis: ReportKpi[] = [
      { id: 'refunds', label: 'Refunds', value: refunded, unit: 'money' },
      { id: 'net-sales', label: 'Net sales', value: gross - refunded, unit: 'money' },
      { id: 'sale-count', label: 'Sales', value: payments.length, unit: 'count' },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'series',
        id: 'net-sales-over-time',
        title: 'Net sales over time',
        unit: 'money',
        points: [...grossBuckets.entries()].map(([label, value]) => ({
          label,
          value: value - (refundBuckets.get(label) ?? 0),
        })),
      },
      {
        kind: 'breakdown',
        id: 'sales-mix-by-method',
        title: 'Sales by payment method',
        unit: 'money',
        items: sortedBreakdown(byMethod),
      },
      {
        kind: 'breakdown',
        id: 'sales-by-seller',
        title: 'Sales by staff member',
        unit: 'money',
        items: [...bySeller.values()]
          .sort((a, b) => b.value - a.value)
          .map((entry) => ({ label: entry.label, value: entry.value })),
      },
      {
        kind: 'breakdown',
        id: 'top-selling-plans',
        title: 'Top selling plans',
        unit: 'money',
        items: sortedBreakdown(byPlan),
      },
      {
        kind: 'table',
        id: 'recent-refunds',
        title: 'Recent refunds',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'order', label: 'Order', type: 'text' },
          { key: 'amount', label: 'Amount', type: 'money' },
          { key: 'reason', label: 'Reason', type: 'text' },
          { key: 'processedBy', label: 'Processed by', type: 'text' },
        ],
        rows: refunds.slice(0, DRILLDOWN_TABLE_ROWS).map((refund) => ({
          date: isoDate(refund.createdAt, win.zone),
          order: refund.orderId.slice(-8).toUpperCase(),
          amount: refund.amount,
          reason: refund.reason,
          processedBy: refund.processedBy
            ? sellerName(refund.processedBy, s)
            : s.values.unattributed,
        })),
      },
    ];

    return { currency, kpis, sections };
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
  private async revenue(win: ReportWindow, s: ReportStrings): Promise<ComputedDrilldown> {
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

    const currency = payments[payments.length - 1]?.currency ?? (await this.currency());

    const overTime = emptyBuckets(win, win.zone);
    const byPlan = new Map<string, number>();
    const byLocation = new Map<string, number>();
    const monthly = new Map<string, { orders: number; gross: number; refunded: number }>();
    let totalNet = 0;
    let totalRefunded = 0;

    for (const payment of payments) {
      const net = payment.amount - payment.refundedAmount;
      totalNet += net;
      totalRefunded += payment.refundedAmount;

      const timeKey = bucketKey(payment.createdAt, win.bucket, win.zone);
      if (overTime.has(timeKey)) {
        overTime.set(timeKey, (overTime.get(timeKey) ?? 0) + net);
      }

      const planLabel = payment.order.package?.name ?? RETAIL_LABEL;
      byPlan.set(planLabel, (byPlan.get(planLabel) ?? 0) + net);

      const locationLabel = payment.order.location?.name ?? s.values.noLocation;
      byLocation.set(locationLabel, (byLocation.get(locationLabel) ?? 0) + net);

      const monthKey = monthStart(payment.createdAt, win.zone);
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
    const newOverTime = emptyBuckets(win, win.zone);
    let joinedBefore = 0;
    for (const member of members) {
      if (member.joinedAt < win.start) {
        joinedBefore += 1;
        continue;
      }
      const key = bucketKey(member.joinedAt, win.bucket, win.zone);
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
    const churnBuckets = emptyBuckets(win, win.zone);
    const activeAtStart = emptyBuckets(win, win.zone);
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
      const key = bucketKey(churnedAt, win.bucket, win.zone);
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
      const key = monthStart(member.joinedAt, win.zone);
      monthlyNew.set(key, (monthlyNew.get(key) ?? 0) + 1);
    }
    const monthlyChurn = new Map<string, number>();
    for (const sub of subscriptions) {
      const churnedAt = churnMoment(sub);
      if (!churnedAt || churnedAt < win.start || churnedAt >= win.end) {
        continue;
      }
      const key = monthStart(churnedAt, win.zone);
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

    return { currency: await this.currency(), kpis, sections };
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

    const overTime = emptyBuckets(win, win.zone);
    const heatmap: number[][] = WEEKDAYS.map(() => new Array<number>(24).fill(0));
    const daily = new Map<string, { count: number; members: Set<string> }>();
    const uniqueMembers = new Set<string>();

    for (const checkIn of checkIns) {
      const at = checkIn.checkedInAt;
      uniqueMembers.add(checkIn.gymMemberId);

      const timeKey = bucketKey(at, win.bucket, win.zone);
      if (overTime.has(timeKey)) {
        overTime.set(timeKey, (overTime.get(timeKey) ?? 0) + 1);
      }

      const { weekday, hour } = zonedParts(at, win.zone); // Monday = 0, gym's clock
      const row = heatmap[weekday];
      if (row) {
        row[hour] = (row[hour] ?? 0) + 1;
      }

      const dayKey = isoDate(at, win.zone);
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

    return { currency: await this.currency(), kpis, sections };
  }

  /* ---------------------------------------------------------------------- */
  /*  Classes                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Class programming health over the window, from {@link ClassInstance}
   * occurrences that *start* inside it and the {@link Booking} rows against them.
   * Surfaces the most-booked classes, the attended / no-show / cancelled split, the
   * cancellation-rate trend, and a per-class performance table (sessions, fill rate,
   * attendance rate). Every figure is a real count over rows in the window; a class
   * with no occurrences in the window simply does not appear.
   */
  private async classes(win: ReportWindow, s: ReportStrings): Promise<ComputedDrilldown> {
    const [instances, bookings] = await Promise.all([
      this.prisma.client.classInstance.findMany({
        where: { startsAt: { gte: win.start, lt: win.end } },
        select: {
          capacityOverride: true,
          bookedCount: true,
          template: { select: { title: true, capacity: true } },
          classType: { select: { name: true, capacity: true } },
        },
      }),
      this.prisma.client.booking.findMany({
        where: { classInstance: { startsAt: { gte: win.start, lt: win.end } } },
        select: {
          status: true,
          classInstance: {
            select: {
              startsAt: true,
              template: { select: { title: true } },
              classType: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const perClass = new Map<string, ClassAgg>();
    const classAgg = (title: string): ClassAgg => {
      let agg = perClass.get(title);
      if (!agg) {
        agg = { sessions: 0, capacity: 0, booked: 0, attended: 0, noShow: 0, canceled: 0 };
        perClass.set(title, agg);
      }
      return agg;
    };

    for (const instance of instances) {
      const agg = classAgg(
        instance.template?.title ?? instance.classType?.name ?? s.values.classFallback,
      );
      agg.sessions += 1;
      agg.capacity +=
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;
      agg.booked += instance.bookedCount;
    }

    const cancelTrend = emptyBuckets(win, win.zone);
    const totalTrend = emptyBuckets(win, win.zone);
    let attended = 0;
    let noShow = 0;
    let canceled = 0;
    for (const booking of bookings) {
      const agg = classAgg(
        booking.classInstance.template?.title ??
          booking.classInstance.classType?.name ??
          s.values.classFallback,
      );
      if (booking.status === BookingStatus.ATTENDED) {
        agg.attended += 1;
        attended += 1;
      } else if (booking.status === BookingStatus.NO_SHOW) {
        agg.noShow += 1;
        noShow += 1;
      } else if (booking.status === BookingStatus.CANCELED) {
        agg.canceled += 1;
        canceled += 1;
      }

      const key = bucketKey(booking.classInstance.startsAt, win.bucket, win.zone);
      if (totalTrend.has(key)) {
        totalTrend.set(key, (totalTrend.get(key) ?? 0) + 1);
        if (booking.status === BookingStatus.CANCELED) {
          cancelTrend.set(key, (cancelTrend.get(key) ?? 0) + 1);
        }
      }
    }

    const totalBooked = [...perClass.values()].reduce((sum, agg) => sum + agg.booked, 0);
    const attendanceBase = attended + noShow;

    const kpis: ReportKpi[] = [
      { id: 'classes-held', label: 'Classes held', value: instances.length, unit: 'count' },
      { id: 'total-booked', label: 'Seats booked', value: totalBooked, unit: 'count' },
      {
        id: 'attendance-rate',
        label: 'Attendance rate',
        value: attendanceBase === 0 ? 0 : rate(attended, attendanceBase),
        unit: 'percent',
      },
      {
        id: 'cancellation-rate',
        label: 'Cancellation rate',
        value: bookings.length === 0 ? 0 : rate(canceled, bookings.length),
        unit: 'percent',
      },
    ];

    const popularity = new Map<string, number>();
    for (const [title, agg] of perClass) {
      popularity.set(title, agg.booked);
    }

    const sections: ReportSection[] = [
      {
        kind: 'breakdown',
        id: 'most-popular-classes',
        title: 'Most popular classes',
        unit: 'count',
        items: sortedBreakdown(popularity),
      },
      {
        kind: 'split',
        id: 'attendance-distribution',
        title: 'Attendance distribution',
        unit: 'count',
        slices: [
          { label: 'Attended', value: attended, tone: 'positive' },
          { label: 'No-show', value: noShow, tone: 'negative' },
          { label: 'Cancelled', value: canceled, tone: 'neutral' },
        ],
      },
      {
        kind: 'series',
        id: 'cancellation-rate-trend',
        title: 'Cancellation rate trend',
        unit: 'percent',
        points: [...cancelTrend.entries()].map(([label, cancelledCount]) => {
          const total = totalTrend.get(label) ?? 0;
          return { label, value: total === 0 ? 0 : rate(cancelledCount, total) };
        }),
      },
      {
        kind: 'table',
        id: 'class-performance',
        title: 'Class performance',
        columns: [
          { key: 'class', label: 'Class', type: 'text' },
          { key: 'sessions', label: 'Sessions', type: 'number' },
          { key: 'booked', label: 'Booked', type: 'number' },
          { key: 'attended', label: 'Attended', type: 'number' },
          { key: 'noShow', label: 'No-show', type: 'number' },
          { key: 'fillRate', label: 'Fill rate', type: 'percent' },
          { key: 'attendanceRate', label: 'Attendance', type: 'percent' },
        ],
        rows: [...perClass.entries()]
          .sort(([, a], [, b]) => b.booked - a.booked)
          .map(([title, agg]): ReportDrilldownRow => {
            const base = agg.attended + agg.noShow;
            return {
              class: title,
              sessions: agg.sessions,
              booked: agg.booked,
              attended: agg.attended,
              noShow: agg.noShow,
              fillRate: agg.capacity === 0 ? 0 : rate(agg.booked, agg.capacity),
              attendanceRate: base === 0 ? 0 : rate(agg.attended, base),
            };
          }),
      },
    ];

    return { currency: await this.currency(), kpis, sections };
  }

  /* ---------------------------------------------------------------------- */
  /*  Staff                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Trainer delivery over the window. Attributes each {@link ClassInstance} (and its
   * {@link Booking} outcomes) to the instance's template trainer, and folds in the
   * VISIBLE {@link Review} ratings written in the window. Surfaces classes taught,
   * attendance rate, and seats booked per trainer, plus a performance table. A class
   * whose trainer was removed (or never set) is grouped under "Unassigned" rather
   * than dropped, so the totals still reconcile with the classes report.
   */
  private async staff(win: ReportWindow): Promise<ComputedDrilldown> {
    const [instances, bookings, reviews] = await Promise.all([
      this.prisma.client.classInstance.findMany({
        where: { startsAt: { gte: win.start, lt: win.end } },
        select: {
          trainer: { select: { name: true } },
          template: { select: { trainer: { select: { name: true } } } },
        },
      }),
      this.prisma.client.booking.findMany({
        where: { classInstance: { startsAt: { gte: win.start, lt: win.end } } },
        select: {
          status: true,
          classInstance: {
            select: {
              trainer: { select: { name: true } },
              template: { select: { trainer: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.client.review.findMany({
        where: { status: ReviewStatus.VISIBLE, createdAt: { gte: win.start, lt: win.end } },
        select: { trainer: { select: { name: true } }, rating: true },
      }),
    ]);

    const perTrainer = new Map<string, TrainerAgg>();
    const trainerAgg = (name: string): TrainerAgg => {
      let agg = perTrainer.get(name);
      if (!agg) {
        agg = { classes: 0, booked: 0, attended: 0, noShow: 0, ratingSum: 0, ratingCount: 0 };
        perTrainer.set(name, agg);
      }
      return agg;
    };

    for (const instance of instances) {
      trainerAgg(
        instance.template?.trainer?.name ?? instance.trainer?.name ?? UNASSIGNED_TRAINER_LABEL,
      ).classes += 1;
    }
    for (const booking of bookings) {
      const agg = trainerAgg(
        booking.classInstance.template?.trainer?.name ??
          booking.classInstance.trainer?.name ??
          UNASSIGNED_TRAINER_LABEL,
      );
      if ((CONFIRMED_BOOKING_STATUSES as BookingStatus[]).includes(booking.status)) {
        agg.booked += 1;
      }
      if (booking.status === BookingStatus.ATTENDED) {
        agg.attended += 1;
      } else if (booking.status === BookingStatus.NO_SHOW) {
        agg.noShow += 1;
      }
    }
    for (const review of reviews) {
      if (!review.trainer) {
        continue;
      }
      const agg = trainerAgg(review.trainer.name);
      agg.ratingSum += review.rating;
      agg.ratingCount += 1;
    }

    const classesTaught = new Map<string, number>();
    const attendanceRate = new Map<string, number>();
    const sessionsBooked = new Map<string, number>();
    let totalAttended = 0;
    let totalNoShow = 0;
    for (const [name, agg] of perTrainer) {
      classesTaught.set(name, agg.classes);
      sessionsBooked.set(name, agg.booked);
      const base = agg.attended + agg.noShow;
      if (base > 0) {
        attendanceRate.set(name, rate(agg.attended, base));
      }
      totalAttended += agg.attended;
      totalNoShow += agg.noShow;
    }

    const trainersActive = [...perTrainer.values()].filter((agg) => agg.classes > 0).length;
    const attendanceBase = totalAttended + totalNoShow;
    const totalBooked = [...perTrainer.values()].reduce((sum, agg) => sum + agg.booked, 0);

    const kpis: ReportKpi[] = [
      { id: 'trainers', label: 'Active trainers', value: trainersActive, unit: 'count' },
      { id: 'classes-held', label: 'Classes held', value: instances.length, unit: 'count' },
      { id: 'total-booked', label: 'Seats booked', value: totalBooked, unit: 'count' },
      {
        id: 'attendance-rate',
        label: 'Attendance rate',
        value: attendanceBase === 0 ? 0 : rate(totalAttended, attendanceBase),
        unit: 'percent',
      },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'breakdown',
        id: 'classes-taught-per-trainer',
        title: 'Classes taught per trainer',
        unit: 'count',
        items: sortedBreakdown(classesTaught),
      },
      {
        kind: 'breakdown',
        id: 'attendance-rate-per-trainer',
        title: 'Attendance rate per trainer',
        unit: 'percent',
        items: sortedBreakdown(attendanceRate),
      },
      {
        kind: 'breakdown',
        id: 'sessions-booked-per-trainer',
        title: 'Sessions booked per trainer',
        unit: 'count',
        items: sortedBreakdown(sessionsBooked),
      },
      {
        kind: 'table',
        id: 'staff-performance',
        title: 'Staff performance',
        columns: [
          { key: 'trainer', label: 'Trainer', type: 'text' },
          { key: 'classes', label: 'Classes', type: 'number' },
          { key: 'booked', label: 'Booked', type: 'number' },
          { key: 'attended', label: 'Attended', type: 'number' },
          { key: 'noShow', label: 'No-show', type: 'number' },
          { key: 'attendanceRate', label: 'Attendance', type: 'percent' },
          { key: 'rating', label: 'Avg rating', type: 'number' },
        ],
        rows: [...perTrainer.entries()]
          .sort(([, a], [, b]) => b.classes - a.classes)
          .map(([name, agg]): ReportDrilldownRow => {
            const base = agg.attended + agg.noShow;
            return {
              trainer: name,
              classes: agg.classes,
              booked: agg.booked,
              attended: agg.attended,
              noShow: agg.noShow,
              attendanceRate: base === 0 ? 0 : rate(agg.attended, base),
              rating:
                agg.ratingCount === 0 ? 0 : Math.round((agg.ratingSum / agg.ratingCount) * 10) / 10,
            };
          }),
      },
    ];

    return { currency: await this.currency(), kpis, sections };
  }

  /* ---------------------------------------------------------------------- */
  /*  Point of sale                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Point-of-sale takings over the window, from captured {@link Payment} rows joined
   * to their {@link Order}'s line items. "Net" is `amount − refundedAmount` in MINOR
   * units throughout. Surfaces daily sales, takings by payment method, the product
   * sales breakdown (positive line items grouped by label), and the end-of-day
   * summary table.
   */
  private async pos(win: ReportWindow, s: ReportStrings): Promise<ComputedDrilldown> {
    const payments = await this.prisma.client.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      select: {
        amount: true,
        refundedAmount: true,
        currency: true,
        method: true,
        createdAt: true,
        order: { select: { items: { select: { label: true, amount: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const currency = payments[payments.length - 1]?.currency ?? (await this.currency());

    const overTime = emptyBuckets(win, win.zone);
    const byMethod = new Map<string, number>();
    const byProduct = new Map<string, number>();
    const daily = new Map<string, { transactions: number; gross: number; refunded: number }>();
    let gross = 0;
    let refunded = 0;

    for (const payment of payments) {
      const net = payment.amount - payment.refundedAmount;
      gross += payment.amount;
      refunded += payment.refundedAmount;

      const key = bucketKey(payment.createdAt, win.bucket, win.zone);
      if (overTime.has(key)) {
        overTime.set(key, (overTime.get(key) ?? 0) + net);
      }

      const label = methodLabel(s, payment.method);
      byMethod.set(label, (byMethod.get(label) ?? 0) + net);

      for (const item of payment.order.items) {
        if (item.amount > 0) {
          byProduct.set(item.label, (byProduct.get(item.label) ?? 0) + item.amount);
        }
      }

      const dayKey = isoDate(payment.createdAt, win.zone);
      const day = daily.get(dayKey) ?? { transactions: 0, gross: 0, refunded: 0 };
      day.transactions += 1;
      day.gross += payment.amount;
      day.refunded += payment.refundedAmount;
      daily.set(dayKey, day);
    }

    const transactions = payments.length;
    const net = gross - refunded;
    const kpis: ReportKpi[] = [
      { id: 'net-sales', label: 'Net sales', value: net, unit: 'money' },
      { id: 'transactions', label: 'Transactions', value: transactions, unit: 'count' },
      {
        id: 'avg-sale',
        label: 'Avg sale',
        value: transactions === 0 ? 0 : Math.round(net / transactions),
        unit: 'money',
      },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'series',
        id: 'daily-sales',
        title: 'Daily sales',
        unit: 'money',
        points: [...overTime.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        kind: 'breakdown',
        id: 'sales-by-method',
        title: 'Sales by payment method',
        unit: 'money',
        items: sortedBreakdown(byMethod),
      },
      {
        kind: 'breakdown',
        id: 'product-sales',
        title: 'Product sales breakdown',
        unit: 'money',
        items: sortedBreakdown(byProduct),
      },
      {
        kind: 'table',
        id: 'end-of-day',
        title: 'End-of-day summaries',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'transactions', label: 'Transactions', type: 'number' },
          { key: 'gross', label: 'Gross', type: 'money' },
          { key: 'refunded', label: 'Refunded', type: 'money' },
          { key: 'net', label: 'Net', type: 'money' },
        ],
        rows: [...daily.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(
            ([date, day]): ReportDrilldownRow => ({
              date,
              transactions: day.transactions,
              gross: day.gross,
              refunded: day.refunded,
              net: day.gross - day.refunded,
            }),
          ),
      },
    ];

    return { currency, kpis, sections };
  }

  /* ---------------------------------------------------------------------- */
  /*  Loyalty                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Loyalty-program activity over the window (T12.10), from the append-only
   * {@link LoyaltyLedgerEntry} points ledger and the {@link LoyaltyRedemption} rows.
   * Points issued over time and the issued-vs-redeemed split come from the ledger's
   * signed deltas; redemptions-by-type and the recent-redemptions table come from the
   * redemption rows (cancelled redemptions, whose points were refunded, are excluded
   * from the aggregates but still listed).
   */
  private async loyalty(win: ReportWindow, s: ReportStrings): Promise<ComputedDrilldown> {
    const [ledger, redemptions] = await Promise.all([
      this.prisma.client.loyaltyLedgerEntry.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: { delta: true, createdAt: true },
      }),
      this.prisma.client.loyaltyRedemption.findMany({
        where: { redeemedAt: { gte: win.start, lt: win.end } },
        select: {
          rewardName: true,
          rewardType: true,
          pointsSpent: true,
          status: true,
          redeemedAt: true,
        },
        orderBy: { redeemedAt: 'desc' },
      }),
    ]);

    const issuedOverTime = emptyBuckets(win, win.zone);
    let issued = 0;
    let redeemed = 0;
    for (const entry of ledger) {
      if (entry.delta > 0) {
        issued += entry.delta;
        const key = bucketKey(entry.createdAt, win.bucket, win.zone);
        if (issuedOverTime.has(key)) {
          issuedOverTime.set(key, (issuedOverTime.get(key) ?? 0) + entry.delta);
        }
      } else if (entry.delta < 0) {
        redeemed += -entry.delta;
      }
    }

    const byRewardType = new Map<string, number>();
    let redemptionCount = 0;
    for (const redemption of redemptions) {
      if (redemption.status === LoyaltyRedemptionStatus.cancelled) {
        continue;
      }
      redemptionCount += 1;
      const label = s.values.rewardTypes[redemption.rewardType] ?? redemption.rewardType;
      byRewardType.set(label, (byRewardType.get(label) ?? 0) + 1);
    }

    const kpis: ReportKpi[] = [
      { id: 'points-issued', label: 'Points issued', value: issued, unit: 'count' },
      { id: 'points-redeemed', label: 'Points redeemed', value: redeemed, unit: 'count' },
      { id: 'net-points', label: 'Net points', value: issued - redeemed, unit: 'count' },
      { id: 'redemptions', label: 'Redemptions', value: redemptionCount, unit: 'count' },
    ];

    const sections: ReportSection[] = [
      {
        kind: 'series',
        id: 'points-issued-over-time',
        title: 'Points issued over time',
        unit: 'count',
        points: [...issuedOverTime.entries()].map(([label, value]) => ({ label, value })),
      },
      {
        kind: 'split',
        id: 'points-issued-vs-redeemed',
        title: 'Points issued vs redeemed',
        unit: 'count',
        slices: [
          { label: 'Issued', value: issued, tone: 'positive' },
          { label: 'Redeemed', value: redeemed, tone: 'negative' },
        ],
      },
      {
        kind: 'breakdown',
        id: 'redemptions-by-reward-type',
        title: 'Redemptions by reward type',
        unit: 'count',
        items: sortedBreakdown(byRewardType),
      },
      {
        kind: 'table',
        id: 'recent-redemptions',
        title: 'Recent redemptions',
        columns: [
          { key: 'date', label: 'Date', type: 'date' },
          { key: 'reward', label: 'Reward', type: 'text' },
          { key: 'type', label: 'Type', type: 'text' },
          { key: 'points', label: 'Points', type: 'number' },
          { key: 'status', label: 'Status', type: 'text' },
        ],
        rows: redemptions.slice(0, 20).map(
          (redemption): ReportDrilldownRow => ({
            date: isoDate(redemption.redeemedAt, win.zone),
            reward: redemption.rewardName,
            type: s.values.rewardTypes[redemption.rewardType] ?? redemption.rewardType,
            points: redemption.pointsSpent,
            status: capitalize(redemption.status),
          }),
        ),
      },
    ];

    return { currency: await this.currency(), kpis, sections };
  }

  /**
   * The gym's ISO-4217 currency — its configured `settings.locale.currency`. Public
   * because a dashboard segment holding no resolvable widget still has to report
   * the currency its (absent) money figures would be in, without computing a whole
   * report to learn it.
   */
  async currency(): Promise<string> {
    return (await this.locale.get()).currency;
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

/** The `YYYY-MM-01` month key an instant falls into, in `zone`. */
function monthStart(at: Date, zone: string): string {
  const { year, month } = zonedParts(at, zone);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Escape one CSV field (RFC 4180) — quote + double embedded quotes when needed. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const UNATTRIBUTED_SELLER_KEY = '__unattributed__';

/**
 * Rows a drill-down's detail table carries. A drill-down is a screen, not an
 * export — the catalogue report beside it is what produces the full list — so the
 * table shows the most recent handful and stops. Matches the loyalty drill-down's
 * existing cut-off.
 */
const DRILLDOWN_TABLE_ROWS = 20;

/**
 * A staff member's display name. Staff rows carry their own split first/last name;
 * an invited or plain membership has neither, and the cross-gym `User` name is the
 * fallback.
 */
function sellerName(
  staff: {
    firstName?: string | null;
    lastName?: string | null;
    user?: { name: string | null } | null;
  },
  s: ReportStrings,
): string {
  const split = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
  return split || staff.user?.name?.trim() || s.values.unattributed;
}

/** A label→value map as breakdown items, richest first, dropping empty slices. */
function sortedBreakdown(totals: Map<string, number>): { label: string; value: number }[] {
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((item) => item.value !== 0)
    .sort((a, b) => b.value - a.value);
}

/** Capitalise a lowercase enum value for display (e.g. `fulfilled` → `Fulfilled`). */
function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

/** Human label for a settlement method, in the report's language. */
function methodLabel(s: ReportStrings, method: string): string {
  const labels: Record<string, string> = {
    CASH: s.values.cash,
    CARD: s.values.card,
    BANK_TRANSFER: s.values.bankTransfer,
    MEMBER_ACCOUNT: s.values.memberAccount,
  };
  return labels[method] ?? method;
}
