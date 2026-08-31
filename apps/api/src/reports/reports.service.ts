import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  InstanceStatus,
  InvoiceStatus,
  PaymentStatus,
  Role,
  SubscriptionInterval,
  SubscriptionStatus,
  OrderStatus,
  PackageBillingInterval,
  PaymentMethod,
  ServiceType,
} from '@fit/db';
import {
  deriveOrderChannel,
  gymSettingsStoredSchema,
  REPORT_CATALOG,
  REPORT_DEFINITIONS,
  reportCsvRow,
  reportXlsxRow,
  type OrderChannel,
  type ReportCatalogResponse,
  type ReportColumn,
  type ReportKey,
  type ReportQuery,
  type ReportResult,
  type ReportRow,
  type ReportToggle,
  reportWindowInput,
  type ReportDigestSection,
  type ReportWindowInput,
  type ReportWindowPreset,
  decodeVariantRef,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { buildReportWorkbook } from './xlsx';
import {
  bucketKey,
  DAY_MS,
  emptyBuckets,
  isoDate,
  rate,
  resolveWindow,
  windowDays,
  type ReportWindow,
} from './report-window.util';
import { addZonedDays, zonedDayStart } from './zoned-time.util';
import { resolveEmailLocale } from '../mail/email-locale';
import {
  localizeColumns,
  localizeDefinition,
  reportStrings,
  type ReportLocale,
  type ReportStrings,
} from './report-strings';

/** The precomputed shape a report resolves to before it is shaped for a surface. */
interface ComputedReport {
  name: string;
  currency: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** The window the rows were computed over, for the response to echo. */
  window: ReportWindow;
}

/**
 * Read side of the admin console's Reports screen (T4.8).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every aggregate below
 * is auto-constrained to the caller's gym by the Prisma tenant extension, so the
 * whole report is this-gym-only by construction — there is no `gymId` to pass or
 * to forget, exactly like {@link AnalyticsService}.
 *
 * Every report is a REAL aggregation over rows that already exist, grouped by the
 * segment it is filed under (`@fit/types`'s `REPORT_SEGMENTS`): Sales reads
 * {@link Payment} / {@link Order} / {@link Refund} / {@link PromoRedemption},
 * Members reads {@link GymMember} / {@link Subscription} / {@link CheckIn},
 * Revenue and Classes the channels and bookings behind them.
 *
 * Two conventions run through all of them, and both are deliberate:
 *
 *   • A time series is DENSE — a period with no activity is a real zero, because
 *     the period happened. A categorical slice with no rows is ABSENT rather than
 *     zeroed, because the slice may simply not exist.
 *   • A rate with no denominator is `null`, never `0`. "Nobody churned" and
 *     "nobody was subscribed" are different facts and the file has to say which.
 *
 * The service produces {@link ReportRow}s keyed by the columns declared in
 * {@link REPORT_DEFINITIONS}; the CSV stream and the XLSX writer read those same
 * columns, so the on-screen table and both downloads never drift.
 *
 * Most aggregates ride the tenant extension's automatic scoping. {@link CheckIn}
 * is NOT in its model set (see `check-in.service.ts`), so the check-in log pins
 * `gymId` from {@link TenantContext} by hand — forgetting that would read every
 * gym's visits.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly locale: GymLocaleService,
  ) {}

  /**
   * `GET /admin/reports` — the catalogue this gym offers.
   *
   * Filtered by the gym's `reports` settings, which are a DISPLAY preference: a
   * report switched off is absent from this list, but `preview` and `export`
   * still serve it to anyone holding `Permission.ReportView`. Do not add a
   * permission check to those routes on the strength of this filter — a
   * bookmarked preview link and a scheduled export are both expected to keep
   * working after a gym tidies its hub.
   */
  async catalog(lang: ReportLocale | null = null): Promise<ReportCatalogResponse> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    const stored = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    const { reports } = stored;
    // The caller's language when it said, the gym's own otherwise — the same
    // rule every report body follows, so the hub and its previews agree.
    const language = lang ?? resolveEmailLocale(stored.locale.language);

    // Fail OPEN: a report only disappears when its toggle is explicitly `false`.
    // If a report ever reached REPORT_CATALOG without a matching toggle, reading
    // `reports[key]` would be `undefined` — falsy — and a strict truthiness check
    // would silently drop that report from every gym's hub. This is a display
    // preference, so the friendlier failure is to keep showing it until someone
    // deliberately hides it.
    return {
      reports: REPORT_CATALOG.filter((report) => reports[report.key as ReportToggle] !== false).map(
        (report) => localizeDefinition(report, language),
      ),
      segments: reportStrings(language).segments,
    };
  }

  /** Run one report for on-screen preview — its columns plus the computed rows. */
  async runReport(
    key: ReportKey,
    query: ReportQuery,
    lang: ReportLocale | null = null,
  ): Promise<ReportResult> {
    const computed = await this.computeReport(key, reportWindowInput(query), lang);
    return {
      key,
      name: computed.name,
      range: query.range,
      // The days the window RESOLVED to, for every range — a preset's are implied
      // by its token, but the screen's date control shows them, and the reader
      // should see the same window the figures were computed over.
      ...windowDays(computed.window),
      currency: computed.currency,
      columns: computed.columns,
      rows: computed.rows,
    };
  }

  /**
   * One section of the emailed digest: the same computation as {@link runReport}
   * over a window PRESET rather than a console range. The digest's monthly
   * cadence windows over `30d`, which the console no longer offers, so it cannot
   * go through {@link ReportQuery} — and a section carries no `range` of its own
   * because the digest states it once for all of them.
   */
  async runDigestSection(key: ReportKey, preset: ReportWindowPreset): Promise<ReportDigestSection> {
    // No caller language: the digest is written in the GYM's language, like
    // every other mail it sends.
    const computed = await this.computeReport(key, preset, null);
    return {
      key,
      name: computed.name,
      currency: computed.currency,
      columns: computed.columns,
      rows: computed.rows,
    };
  }

  /**
   * Stream one report as CSV, header row first then one line per row. Money cells
   * render as major-unit decimals and percentages to one decimal (see
   * {@link reportCsvRow}); each cell is RFC-4180 escaped before joining. The
   * controller pipes each yielded chunk straight to the response.
   */
  async *streamReportCsv(
    key: ReportKey,
    query: ReportQuery,
    lang: ReportLocale | null = null,
  ): AsyncGenerator<string> {
    const { columns, rows } = await this.computeReport(key, reportWindowInput(query), lang);
    yield `${columns.map((column) => csvCell(column.label)).join(',')}\r\n`;
    for (const row of rows) {
      yield `${reportCsvRow(columns, row).map(csvCell).join(',')}\r\n`;
    }
  }

  /**
   * Build one report as an XLSX workbook buffer. Reports are bounded aggregates, so
   * the workbook is assembled in memory (see {@link buildReportWorkbook}); money
   * cells are numeric major units and percentages numeric, so the spreadsheet can
   * sum and sort them.
   */
  async buildReportXlsx(
    key: ReportKey,
    query: ReportQuery,
    lang: ReportLocale | null = null,
  ): Promise<Buffer> {
    const { name, columns, rows } = await this.computeReport(key, reportWindowInput(query), lang);
    const headers = columns.map((column) => column.label);
    const cells = rows.map((row) => reportXlsxRow(columns, row));
    return buildReportWorkbook(name, headers, cells);
  }

  /* ---------------------------------------------------------------------- */
  /*  Computation                                                            */
  /* ---------------------------------------------------------------------- */

  /** Resolve a report to its columns, rows, and (for money reports) currency. */
  private async computeReport(
    key: ReportKey,
    input: ReportWindowInput,
    lang: ReportLocale | null,
  ): Promise<ComputedReport> {
    // The gym's own zone, for the same reason the dashboard passes it: "today"
    // and "this month" are calendar questions, and UTC answers them wrong for
    // the first hours of every day in Tbilisi.
    const locale = await this.locale.get();
    const win = resolveWindow(input, locale.timezone);
    // The language the CALLER reads, when it said (the console forwards its own
    // interface language); the gym's own otherwise (a scheduled export, the digest).
    const language = lang ?? resolveEmailLocale(locale.language);
    const s = reportStrings(language);
    const computed = await this.computeRows(key, win, s);
    return {
      ...computed,
      name: s.catalogue[key].name,
      columns: localizeColumns(key, computed.columns, language),
      window: win,
    };
  }

  /**
   * Dispatch one report key to its aggregate over an already-resolved window.
   * `s` is the language for the values a report WRITES ITSELF ("No plan", a
   * payment method); the labels around them are localised by the caller.
   */
  private async computeRows(
    key: ReportKey,
    win: ReportWindow,
    s: ReportStrings,
  ): Promise<Omit<ComputedReport, 'window'>> {
    const definition = REPORT_DEFINITIONS[key];

    switch (key) {
      /* ---- Sales -------------------------------------------------------- */
      case 'sales-summary': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesSummary(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'sales-by-payment-method': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesByPaymentMethod(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'plan-performance': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.planPerformance(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'sales-by-staff': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesByStaff(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'discounts-and-promotions': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.discountsAndPromotions(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'refunds-detail': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.refundsDetail(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'sales-transactions': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesTransactions(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'daily-reconciliation': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.dailyReconciliation(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'pos-transaction-log': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.posTransactionLog(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }

      /* ---- Revenue ------------------------------------------------------- */
      case 'revenue-summary': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueSummary(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'revenue-by-location': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueByLocation(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'outstanding-invoices': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.outstandingInvoices(win.zone, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'projected-revenue': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.projectedRevenue(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'refunds-accounting': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.refundsAccounting(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'revenue-by-channel': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueByChannel(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      /* ---- Classes ------------------------------------------------------- */
      case 'attendance-by-class':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.attendanceByClass(win, s),
        };
      case 'class-utilization':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.classUtilization(win, s),
        };
      case 'class-cancellations':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.classCancellations(win, s),
        };
      case 'waitlist-demand':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.waitlistDemand(win, s),
        };
      case 'pt-sessions':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.ptSessions(win, s),
        };

      /* ---- Trainers & staff ---------------------------------------------- */
      case 'trainer-performance':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.trainerPerformance(win, s),
        };
      /* ---- Members ------------------------------------------------------- */
      case 'membership-movement':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.membershipMovement(win),
        };
      case 'retention-and-churn':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.retentionAndChurn(win),
        };
      case 'members-at-risk':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.membersAtRisk(win.zone, s),
        };
      case 'expiring-memberships':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.expiringMemberships(win, s),
        };
      case 'member-roster':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.memberRoster(win.zone, s),
        };
      case 'member-check-in-log':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.memberCheckInLog(win, s),
        };
      case 'upcoming-occasions':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.upcomingOccasions(win, s),
        };
      case 'no-show-rate':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.noShowRate(win, s),
        };
    }
  }

  /**
   * The gym's reporting currency — its configured `settings.locale.currency`,
   * mirroring {@link AnalyticsService}.
   *
   * This used to be read off the most recent captured payment, so a gym that had
   * taken no money was reported in `USD` regardless of what it had configured, and
   * one foreign payment relabelled every column. The gym states its currency in
   * Settings; that is the answer, and it is the same one the POS and the catalogue
   * use.
   */
  private async resolveCurrency(): Promise<string> {
    return (await this.locale.get()).currency;
  }

  /* ---------------------------------------------------------------------- */
  /*  Sales                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Gross takings, refunds and net per bucket across the window.
   *
   * Gross is captured {@link Payment} rows bucketed by when the money came in;
   * refunds are {@link Refund} rows bucketed by when the money went back out. That
   * is deliberately NOT `Payment.refundedAmount`: that column is a running total
   * against the original sale, so a refund issued this month against last month's
   * order would land in last month's bucket and quietly restate a period that has
   * already been reported. Takings in the period minus refunds in the period is
   * what a till reconciles to.
   *
   * The series is dense — a period with no takings shows a real zero, because the
   * period genuinely happened and earned nothing. That is different from the
   * catalogue's other reports, where an absent SLICE (a channel, a trainer) is
   * omitted rather than invented.
   */
  private async salesSummary(win: ReportWindow): Promise<ReportRow[]> {
    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const gross = emptyBuckets(win, win.zone);
    const refunded = emptyBuckets(win, win.zone);
    const orders = emptyBuckets(win, win.zone);
    for (const payment of payments) {
      const key = bucketKey(payment.createdAt, win.bucket, win.zone);
      if (gross.has(key)) {
        gross.set(key, (gross.get(key) ?? 0) + payment.amount);
        orders.set(key, (orders.get(key) ?? 0) + 1);
      }
    }
    for (const refund of refunds) {
      const key = bucketKey(refund.createdAt, win.bucket, win.zone);
      if (refunded.has(key)) {
        refunded.set(key, (refunded.get(key) ?? 0) + refund.amount);
      }
    }

    return [...gross.entries()].map(([period, grossAmount]) => {
      const refundedAmount = refunded.get(period) ?? 0;
      return {
        period,
        orders: orders.get(period) ?? 0,
        gross: grossAmount,
        refunded: refundedAmount,
        net: grossAmount - refundedAmount,
      };
    });
  }

  /**
   * Captured takings grouped by how they were settled. Unlike the channel report
   * (which derives POS vs online from the provider key), `method` is a real column
   * the till writes, so this groups in the database. A method nobody used in the
   * window is absent rather than shown as a zero row.
   */
  private async salesByPaymentMethod(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const grouped = await this.prisma.client.payment.groupBy({
      by: ['method'],
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      _sum: { amount: true, refundedAmount: true },
      _count: { _all: true },
    });

    return grouped
      .map((group) => {
        const gross = group._sum.amount ?? 0;
        const refunded = group._sum.refundedAmount ?? 0;
        return {
          method: paymentMethodLabel(s, group.method),
          orders: group._count._all,
          gross,
          refunded,
          net: gross - refunded,
        };
      })
      .sort((a, b) => b.net - a.net);
  }

  /**
   * Sales count and revenue per plan or package, ranked by revenue.
   *
   * Only orders that name a {@link PackagePlan} are counted. A retail sale has no
   * plan, and folding it into a "plan performance" ranking under some catch-all
   * label would answer a different question than the one asked; the POS
   * transaction log is where line-item retail lives.
   */
  private async planPerformance(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { status: PaymentStatus.CAPTURED } },
      },
      select: {
        total: true,
        packageId: true,
        package: { select: { id: true, name: true, billingInterval: true, sessionCount: true } },
        location: { select: { name: true } },
        items: {
          select: {
            label: true,
            amount: true,
            qty: true,
            productVariantId: true,
            serviceId: true,
            service: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    // One lookup for every product sold in the window, by the product half of its ref.
    const productIds = new Set<string>();
    for (const order of orders) {
      for (const item of order.items) {
        const ref = item.productVariantId ? decodeVariantRef(item.productVariantId) : null;
        if (ref) productIds.add(ref.productId);
      }
    }
    const products = new Map<string, { name: string; category: string | null }>();
    if (productIds.size > 0) {
      const rows = await this.prisma.client.product.findMany({
        where: { id: { in: [...productIds] } },
        select: { id: true, name: true, category: { select: { name: true } } },
      });
      for (const row of rows) {
        products.set(row.id, { name: row.name, category: row.category?.name ?? null });
      }
    }

    interface Entry {
      item: string;
      category: string;
      sold: number;
      revenue: number;
      location: string;
    }
    const entries = new Map<string, Entry>();
    const add = (
      key: string,
      seed: Omit<Entry, 'sold' | 'revenue'>,
      sold: number,
      revenue: number,
    ) => {
      const entry = entries.get(key) ?? { ...seed, sold: 0, revenue: 0 };
      entry.sold += sold;
      entry.revenue += revenue;
      entries.set(key, entry);
    };

    for (const order of orders) {
      const location = order.location?.name ?? '';
      // The plan's own money is its line (the one with no product and no
      // service behind it); an order with no lines at all - an online plan
      // purchase - IS the plan. Promo lines are negative and never a plan.
      let planRevenue = 0;
      for (const item of order.items) {
        if (item.serviceId) {
          const category =
            item.service?.type === ServiceType.PERSONAL_TRAINING
              ? s.values.categoryPersonalTraining
              : s.values.categoryService;
          add(
            `service:${item.serviceId}|${location}`,
            { item: item.service?.name ?? item.label, category, location },
            item.qty,
            item.amount,
          );
          continue;
        }
        const ref = item.productVariantId ? decodeVariantRef(item.productVariantId) : null;
        if (ref) {
          const product = products.get(ref.productId);
          add(
            `product:${ref.productId}|${location}`,
            {
              item: product?.name ?? item.label,
              category: product?.category ?? s.values.categoryUncategorised,
              location,
            },
            item.qty,
            item.amount,
          );
          continue;
        }
        if (item.amount > 0) planRevenue += item.amount;
      }
      if (order.package) {
        const plan = order.package;
        const category =
          plan.billingInterval === PackageBillingInterval.ONE_TIME
            ? plan.sessionCount
              ? s.values.categorySessionPack
              : s.values.categoryOneTimePlan
            : s.values.categoryMembership;
        add(
          `plan:${plan.id}|${location}`,
          { item: plan.name, category, location },
          1,
          order.items.length === 0 ? order.total : planRevenue,
        );
      }
    }

    const total = [...entries.values()].reduce((sum, entry) => sum + entry.revenue, 0);
    return [...entries.values()]
      .sort((a, b) => b.revenue - a.revenue || a.item.localeCompare(b.item))
      .map((entry) => ({
        item: entry.item,
        category: entry.category,
        sold: entry.sold,
        revenue: entry.revenue,
        share: total > 0 ? rate(entry.revenue, total) : null,
        location: entry.location,
      }));
  }

  /**
   * Till takings per staff member over the window.
   *
   * Gross is what the seller captured; net subtracts what came back against those
   * same sales, so a seller is not credited with a refunded one. Sales with no
   * seller get their OWN row rather than being dropped: every self-serve online
   * purchase lands there, as does every till sale rung before the attribution
   * existed, and hiding them would make the rows fail to add up to the gym's total.
   */
  private async salesByStaff(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { status: PaymentStatus.CAPTURED } },
      },
      select: {
        soldById: true,
        payment: { select: { amount: true, refundedAmount: true } },
        soldBy: {
          select: {
            role: true,
            firstName: true,
            lastName: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    const byStaff = new Map<
      string,
      { staff: string; role: string; orders: number; gross: number; net: number }
    >();
    for (const order of orders) {
      const key = order.soldById ?? UNATTRIBUTED_KEY;
      const entry = byStaff.get(key) ?? {
        staff: order.soldBy
          ? staffName(order.soldBy, s.values.unattributed)
          : s.values.unattributed,
        role: order.soldBy?.role ?? '',
        orders: 0,
        gross: 0,
        net: 0,
      };
      const gross = order.payment?.amount ?? 0;
      entry.orders += 1;
      entry.gross += gross;
      entry.net += gross - (order.payment?.refundedAmount ?? 0);
      byStaff.set(key, entry);
    }

    return [...byStaff.values()].sort((a, b) => b.net - a.net || a.staff.localeCompare(b.staff));
  }

  /**
   * Every promo code redeemed in the window, with what it gave away. Reads the
   * {@link PromoRedemption} ledger rather than `PromoCode.usedCount`, because that
   * counter is a lifetime running total and cannot be windowed — and because the
   * ledger is the only place the discounted AMOUNT is recorded.
   */
  private async discountsAndPromotions(win: ReportWindow): Promise<ReportRow[]> {
    const redemptions = await this.prisma.client.promoRedemption.findMany({
      where: { createdAt: { gte: win.start, lt: win.end } },
      select: {
        discountAmount: true,
        promoCode: { select: { id: true, code: true, discountType: true } },
      },
    });

    const byCode = new Map<
      string,
      { code: string; discountType: string; redemptions: number; discountGiven: number }
    >();
    for (const redemption of redemptions) {
      const entry = byCode.get(redemption.promoCode.id) ?? {
        code: redemption.promoCode.code,
        discountType: redemption.promoCode.discountType,
        redemptions: 0,
        discountGiven: 0,
      };
      entry.redemptions += 1;
      entry.discountGiven += redemption.discountAmount;
      byCode.set(redemption.promoCode.id, entry);
    }

    return [...byCode.values()].sort(
      (a, b) => b.discountGiven - a.discountGiven || a.code.localeCompare(b.code),
    );
  }

  /**
   * Every refund in the window, line by line, newest first — the operational view
   * the summary total cannot give: which sale, how much, why, and who issued it.
   *
   * `processedBy` reads the refund's OWN operator rather than the order's
   * `REFUNDED` status event, which is written only once a capture is fully
   * reversed and so names nobody for a partial refund.
   */
  private async refundsDetail(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const refunds = await this.prisma.client.refund.findMany({
      where: { createdAt: { gte: win.start, lt: win.end } },
      select: {
        createdAt: true,
        orderId: true,
        amount: true,
        reason: true,
        processedBy: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
        order: {
          select: {
            customerName: true,
            member: {
              select: { firstName: true, lastName: true, user: { select: { name: true } } },
            },
            location: { select: { name: true } },
            items: { select: { label: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });

    return refunds.map((refund) => ({
      date: isoDate(refund.createdAt, win.zone),
      time: clockTime(refund.createdAt, win.zone),
      customer: refund.order.member
        ? memberName(refund.order.member, s.values.unknownMember)
        : (refund.order.customerName ?? s.values.guest),
      order: shortId(refund.orderId),
      items: refund.order.items.map((item) => item.label).join(', '),
      amount: refund.amount,
      reason: refund.reason,
      processedBy: refund.processedBy
        ? staffName(refund.processedBy, s.values.unattributed)
        : s.values.unattributed,
      location: refund.order.location?.name ?? '',
    }));
  }

  /**
   * Receipt-level till detail — one row per POS sale, newest first, with its lines
   * folded into a single readable cell.
   *
   * Scoped to `pos`-provider payments, the same test the order roster's POS filter
   * uses, so "what the till sold" means one thing across the console.
   */
  private async posTransactionLog(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { provider: POS_PROVIDER } },
      },
      select: {
        id: true,
        createdAt: true,
        total: true,
        items: { select: { label: true, qty: true } },
        payment: { select: { method: true } },
        soldBy: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });

    return orders.map((order) => ({
      date: isoDate(order.createdAt, win.zone),
      time: clockTime(order.createdAt, win.zone),
      order: shortId(order.id),
      items: order.items.map((item) => item.label).join(', '),
      method: order.payment ? paymentMethodLabel(s, order.payment.method) : '',
      total: order.total,
      staff: order.soldBy ? staffName(order.soldBy, s.values.unattributed) : s.values.unattributed,
    }));
  }

  /**
   * Each day's takings split by how the money was collected, beside the refunds
   * issued that day and the receipts behind the total - the end-of-day sheet.
   *
   * Always by calendar DAY in the gym's zone, whatever bucket the window would
   * otherwise use: a reconciliation is done against a day's till, and a weekly
   * row would have nothing to be checked against. Days with no sales are real
   * zero rows, so a closed Sunday reads as closed rather than missing.
   *
   * The columns follow the till's own vocabulary: cash, card at the till, and
   * a member's account are the `pos`-provider methods; everything captured by
   * a gateway is "online". Bank transfer is not a method the till records, so
   * there is no column to fill.
   */
  private async dailyReconciliation(win: ReportWindow): Promise<ReportRow[]> {
    const days: ReportWindow = { ...win, bucket: 'day' };
    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true, method: true, provider: true, orderId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    interface Day {
      total: number;
      cash: number;
      card: number;
      online: number;
      memberAccount: number;
      refunds: number;
      transactions: number;
      references: string[];
    }
    const byDay = new Map<string, Day>();
    for (const key of emptyBuckets(days, win.zone).keys()) {
      byDay.set(key, {
        total: 0,
        cash: 0,
        card: 0,
        online: 0,
        memberAccount: 0,
        refunds: 0,
        transactions: 0,
        references: [],
      });
    }
    for (const payment of payments) {
      const day = byDay.get(bucketKey(payment.createdAt, 'day', win.zone));
      if (!day) continue;
      day.total += payment.amount;
      day.transactions += 1;
      day.references.push(shortId(payment.orderId));
      if (deriveOrderChannel(payment.provider) !== 'POS') {
        day.online += payment.amount;
      } else if (payment.method === PaymentMethod.CASH) {
        day.cash += payment.amount;
      } else if (payment.method === PaymentMethod.MEMBER_ACCOUNT) {
        day.memberAccount += payment.amount;
      } else {
        day.card += payment.amount;
      }
    }
    for (const refund of refunds) {
      const day = byDay.get(bucketKey(refund.createdAt, 'day', win.zone));
      if (day) day.refunds += refund.amount;
    }

    return [...byDay.entries()].map(([date, day]) => ({
      date,
      total: day.total,
      cash: day.cash,
      card: day.card,
      online: day.online,
      memberAccount: day.memberAccount,
      refunds: day.refunds,
      transactions: day.transactions,
      references: day.references.join(', '),
    }));
  }

  /**
   * Every sale in the window, one row per transaction, across BOTH channels -
   * the till and the online shop - where {@link posTransactionLog} is the till
   * alone. A transaction is an `Order`: its lines are folded into one cell the
   * way the POS log folds them, and the category cell names what those lines
   * were - a shelved product's own category, a service, a membership plan -
   * as a distinct list, because one basket can hold a towel and a plan.
   *
   * Product categories are not reachable through the order line: an
   * `OrderItem.productVariantId` is the cart's `"<productId>:<segment>"` wire
   * ref, not a foreign key, so the product half is decoded and looked up in one
   * query for the whole page of rows.
   *
   * Status is the order's own, except that a paid order with money handed back
   * but not all of it reads "partially refunded" - `OrderStatus` has no such
   * state, and "paid" would hide the refund.
   */
  private async salesTransactions(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: { createdAt: { gte: win.start, lt: win.end } },
      select: {
        id: true,
        createdAt: true,
        total: true,
        status: true,
        customerName: true,
        packageId: true,
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
        location: { select: { name: true } },
        items: { select: { label: true, productVariantId: true, serviceId: true } },
        payment: { select: { method: true, provider: true, refundedAmount: true } },
        soldBy: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });

    // One lookup for every product sold on the page, by the product half of its ref.
    const productIds = new Set<string>();
    for (const order of orders) {
      for (const item of order.items) {
        const ref = item.productVariantId ? decodeVariantRef(item.productVariantId) : null;
        if (ref) productIds.add(ref.productId);
      }
    }
    const categoryByProduct = new Map<string, string | null>();
    if (productIds.size > 0) {
      const products = await this.prisma.client.product.findMany({
        where: { id: { in: [...productIds] } },
        select: { id: true, category: { select: { name: true } } },
      });
      for (const product of products) {
        categoryByProduct.set(product.id, product.category?.name ?? null);
      }
    }

    return orders.map((order) => {
      const categories = new Set<string>();
      if (order.packageId) categories.add(s.values.categoryPlan);
      for (const item of order.items) {
        if (item.serviceId) {
          categories.add(s.values.categoryService);
          continue;
        }
        const ref = item.productVariantId ? decodeVariantRef(item.productVariantId) : null;
        if (ref) {
          categories.add(categoryByProduct.get(ref.productId) ?? s.values.categoryUncategorised);
        }
      }
      const refunded = order.payment?.refundedAmount ?? 0;
      const statusKey =
        order.status === OrderStatus.PAID && refunded > 0 && refunded < order.total
          ? 'PARTIALLY_REFUNDED'
          : order.status;
      return {
        date: isoDate(order.createdAt, win.zone),
        time: clockTime(order.createdAt, win.zone),
        reference: shortId(order.id),
        customer: order.member
          ? memberName(order.member, s.values.unknownMember)
          : (order.customerName ?? s.values.guest),
        items: order.items.map((item) => item.label).join(', '),
        category: [...categories].join(', '),
        amount: order.total,
        method: order.payment ? paymentMethodLabel(s, order.payment.method) : '',
        channel:
          deriveOrderChannel(order.payment?.provider) === 'POS'
            ? s.values.channelPos
            : s.values.channelOnline,
        location: order.location?.name ?? '',
        staff: order.soldBy
          ? staffName(order.soldBy, s.values.unattributed)
          : s.values.unattributed,
        status: s.values.statuses[statusKey] ?? statusKey,
      };
    });
  }

  /* ---------------------------------------------------------------------- */
  /*  Revenue / Members / Classes                                            */
  /* ---------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------- */
  /*  Revenue                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Net revenue per period beside the recurring base behind it.
   *
   * Three figures of two different KINDS share these rows, and conflating them is
   * the usual way a revenue report starts lying:
   *
   *   • `revenue` is a FLOW — money captured in the period, minus refunds issued
   *     in it. It is summed over the period.
   *   • `mrr` and `activeMembers` are STOCKS — what the recurring base was at the
   *     moment the period closed. They are not summed; a year's MRR is not twelve
   *     months added up.
   *
   * MRR normalises each live subscription to a month: a yearly plan contributes a
   * twelfth of its price, and a `TRIAL` interval contributes nothing, because a
   * trial is not recurring revenue however much it looks like a subscription.
   * `arpm` is that base divided by the members carrying it — the recurring average,
   * not the period's takings per head, which would swing with every retail sale.
   */
  private async revenueSummary(win: ReportWindow): Promise<ReportRow[]> {
    const [payments, refunds, subscriptions] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.subscription.findMany({
        select: {
          memberId: true,
          priceAmount: true,
          interval: true,
          status: true,
          createdAt: true,
          canceledAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const revenue = emptyBuckets(win, win.zone);
    for (const payment of payments) {
      const key = bucketKey(payment.createdAt, win.bucket, win.zone);
      if (revenue.has(key)) {
        revenue.set(key, (revenue.get(key) ?? 0) + payment.amount);
      }
    }
    for (const refund of refunds) {
      const key = bucketKey(refund.createdAt, win.bucket, win.zone);
      if (revenue.has(key)) {
        revenue.set(key, (revenue.get(key) ?? 0) - refund.amount);
      }
    }

    return [...revenue.entries()].map(([period, netRevenue]) => {
      const at = bucketEnd(period, win.bucket, win.zone);
      let mrr = 0;
      const members = new Set<string>();
      for (const sub of subscriptions) {
        if (!wasLiveAt(sub, at)) {
          continue;
        }
        const monthly = monthlyValue(sub.interval, sub.priceAmount);
        if (monthly === 0) {
          continue;
        }
        mrr += monthly;
        members.add(sub.memberId);
      }
      return {
        period,
        revenue: netRevenue,
        mrr,
        activeMembers: members.size,
        arpm: members.size === 0 ? null : Math.round(mrr / members.size),
      };
    });
  }

  /**
   * Takings split by branch. Sales that never recorded one are grouped rather than
   * dropped: `Order.locationId` is nullable and the online wizard only fills it
   * when the branch really belongs to the gym, so a silent omission would make the
   * rows fail to add up to the gym's own total.
   */
  private async revenueByLocation(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const payments = await this.prisma.client.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      select: {
        amount: true,
        refundedAmount: true,
        order: { select: { location: { select: { name: true } } } },
      },
    });

    const byLocation = new Map<string, { orders: number; gross: number; refunded: number }>();
    for (const payment of payments) {
      const name = payment.order?.location?.name ?? s.values.noLocation;
      const entry = byLocation.get(name) ?? { orders: 0, gross: 0, refunded: 0 };
      entry.orders += 1;
      entry.gross += payment.amount;
      entry.refunded += payment.refundedAmount;
      byLocation.set(name, entry);
    }

    return [...byLocation.entries()]
      .map(([location, entry]) => ({
        location,
        orders: entry.orders,
        gross: entry.gross,
        refunded: entry.refunded,
        net: entry.gross - entry.refunded,
      }))
      .sort((a, b) => b.net - a.net);
  }

  /**
   * Invoices still owed, longest overdue first.
   *
   * `InvoiceStatus` has no `OVERDUE` member — an invoice is overdue by the calendar,
   * not by a flag — so this takes everything not yet settled (`PENDING`/`FAILED`)
   * and derives the age from `dueDate`. An invoice with no due date is still owed
   * and still listed; it simply has no age to report, which is `null` rather than a
   * zero that would sort it among the freshly-issued.
   *
   * Ignores the reporting window: a debt from four months ago is exactly the one
   * worth chasing, and windowing it away would hide the worst rows.
   */
  private async outstandingInvoices(zone: string, s: ReportStrings): Promise<ReportRow[]> {
    const invoices = await this.prisma.client.invoice.findMany({
      where: { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] } },
      select: {
        number: true,
        amount: true,
        dueDate: true,
        status: true,
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
      },
      orderBy: { dueDate: 'asc' },
      take: DETAIL_ROW_LIMIT,
    });

    const now = Date.now();
    return invoices.map((invoice) => ({
      invoice: invoice.number,
      member: invoice.member
        ? memberName(invoice.member, s.values.unknownMember)
        : s.values.unknownMember,
      amount: invoice.amount,
      dueDate: invoice.dueDate ? isoDate(invoice.dueDate, zone) : null,
      daysOverdue: invoice.dueDate
        ? Math.max(0, Math.floor((now - invoice.dueDate.getTime()) / DAY_MS))
        : null,
      status: invoice.status,
    }));
  }

  /**
   * Subscription renewals falling due in the window AHEAD, and what they are
   * scheduled to charge.
   *
   * Forward-looking, like the expiry and birthday reports: the range is read as the
   * next 7/30 days (or twelve weeks/months) rather than the last.
   *
   * This is what is SCHEDULED, not what will arrive. A renewal can fail, a member
   * can cancel before it, and a frozen subscription's date moves when it resumes —
   * so the column is "expected", and only live subscriptions are counted.
   */
  private async projectedRevenue(win: ReportWindow): Promise<ReportRow[]> {
    const now = new Date();
    const forward = forwardWindow(win, now);
    const subscriptions = await this.prisma.client.subscription.findMany({
      where: {
        status: { in: [...LIVE_SUB_STATUSES] },
        currentPeriodEnd: { gte: now, lt: forward.end },
      },
      select: { currentPeriodEnd: true, priceAmount: true },
    });

    const renewals = emptyBuckets(forward);
    const expected = emptyBuckets(forward);
    for (const sub of subscriptions) {
      const key = bucketKey(sub.currentPeriodEnd, forward.bucket);
      if (renewals.has(key)) {
        renewals.set(key, (renewals.get(key) ?? 0) + 1);
        expected.set(key, (expected.get(key) ?? 0) + sub.priceAmount);
      }
    }

    return [...renewals.entries()].map(([period, count]) => ({
      period,
      renewals: count,
      expected: expected.get(period) ?? 0,
    }));
  }

  /**
   * Refunds per period against the takings they reverse — the accounting view.
   *
   * Deliberately NOT the same report as the Sales segment's line-item
   * `refunds-detail`: this one answers "what did we give back this month, and what
   * share of what we took", which is a books question, where the operational one
   * answers "which sale, why, and who did it".
   *
   * Chargebacks are absent because no dispute data reaches the system — there is no
   * model for one and no provider sending them. Their absence is stated in the
   * report's own description rather than left for a reader to infer from a column
   * that is always zero.
   */
  private async refundsAccounting(win: ReportWindow): Promise<ReportRow[]> {
    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end } },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const gross = emptyBuckets(win, win.zone);
    for (const payment of payments) {
      const key = bucketKey(payment.createdAt, win.bucket, win.zone);
      if (gross.has(key)) {
        gross.set(key, (gross.get(key) ?? 0) + payment.amount);
      }
    }
    const refunded = emptyBuckets(win, win.zone);
    const counts = emptyBuckets(win, win.zone);
    for (const refund of refunds) {
      const key = bucketKey(refund.createdAt, win.bucket, win.zone);
      if (refunded.has(key)) {
        refunded.set(key, (refunded.get(key) ?? 0) + refund.amount);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    return [...gross.entries()].map(([period, grossAmount]) => {
      const refundedAmount = refunded.get(period) ?? 0;
      return {
        period,
        refunds: counts.get(period) ?? 0,
        refunded: refundedAmount,
        gross: grossAmount,
        // No takings in the period means there is no share to express — a refund
        // against nothing is not "100% of gross", it is undefined.
        shareOfGross: grossAmount === 0 ? null : rate(refundedAmount, grossAmount),
      };
    });
  }

  /**
   * Captured takings in the window split by sales channel. Payments carry no
   * channel column — it is derived from the provider key ({@link deriveOrderChannel}:
   * `"pos"` ⇒ POS, everything else ⇒ ONLINE), matching the order roster's own
   * filter. Each channel's row carries its order count, gross, refunded, and net
   * (gross − refunded, all MINOR units). A channel with no captured rows is omitted
   * rather than shown as a fabricated zero.
   */
  private async revenueByChannel(win: ReportWindow): Promise<ReportRow[]> {
    const grouped = await this.prisma.client.payment.groupBy({
      by: ['provider'],
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      _sum: { amount: true, refundedAmount: true },
      _count: { _all: true },
    });

    const totals = new Map<OrderChannel, { orders: number; gross: number; refunded: number }>();
    for (const group of grouped) {
      const channel = deriveOrderChannel(group.provider);
      const acc = totals.get(channel) ?? { orders: 0, gross: 0, refunded: 0 };
      acc.orders += group._count._all;
      acc.gross += group._sum.amount ?? 0;
      acc.refunded += group._sum.refundedAmount ?? 0;
      totals.set(channel, acc);
    }

    return [...totals.entries()]
      .map(([channel, acc]) => ({
        channel,
        orders: acc.orders,
        gross: acc.gross,
        refunded: acc.refunded,
        net: acc.gross - acc.refunded,
      }))
      .sort((a, b) => b.net - a.net);
  }

  /* ---------------------------------------------------------------------- */
  /*  Classes                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Seats booked, attended and missed per class, over instances that started in the
   * window.
   *
   * "Booked" counts every seat that was CONFIRMED — including the ones nobody has
   * marked off yet — while the two rates divide only the seats with an outcome. A
   * class whose register was never taken therefore shows its bookings honestly and
   * a `null` rate, instead of a 0% attendance that would read as everyone skipping.
   *
   * Fetches with their template title + trainer name once — Prisma `groupBy` can't
   * reach a relation's scalar, the same reason {@link AnalyticsService.topClasses}
   * uses `findMany` — then tallies in memory.
   */
  private async attendanceByClass(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [...CONFIRMED_BOOKING_STATUSES] },
        classInstance: { startsAt: { gte: win.start, lt: win.end } },
      },
      select: {
        status: true,
        classInstance: {
          select: {
            trainer: { select: { name: true } },
            template: {
              select: { id: true, title: true, trainer: { select: { name: true } } },
            },
            classType: { select: { id: true, name: true } },
          },
        },
      },
    });

    const byClass = new Map<
      string,
      { title: string; trainer: string; booked: number; attended: number; noShow: number }
    >();
    for (const booking of bookings) {
      const inst = booking.classInstance;
      // Group by the template (a generated occurrence) or the type (one scheduled
      // straight from a type); resolve the title / trainer from whichever backs it.
      const key = inst.template?.id ?? inst.classType?.id ?? 'unknown';
      const entry = byClass.get(key) ?? {
        title: inst.template?.title ?? inst.classType?.name ?? s.values.classFallback,
        trainer: inst.template?.trainer?.name ?? inst.trainer?.name ?? s.values.unassigned,
        booked: 0,
        attended: 0,
        noShow: 0,
      };
      entry.booked += 1;
      if (booking.status === BookingStatus.ATTENDED) {
        entry.attended += 1;
      } else if (booking.status === BookingStatus.NO_SHOW) {
        entry.noShow += 1;
      }
      byClass.set(key, entry);
    }

    return [...byClass.values()]
      .map((entry) => {
        // Only seats with an outcome divide the rates — a seat still marked BOOKED
        // has not happened yet and cannot count for or against attendance.
        const settled = entry.attended + entry.noShow;
        return {
          class: entry.title,
          trainer: entry.trainer,
          booked: entry.booked,
          attended: entry.attended,
          noShow: entry.noShow,
          attendanceRate: settled === 0 ? null : rate(entry.attended, settled),
          noShowRate: settled === 0 ? null : rate(entry.noShow, settled),
        };
      })
      .sort((a, b) => b.booked - a.booked || a.class.localeCompare(b.class));
  }

  /**
   * Seats booked against seats offered per class.
   *
   * Capacity is per SESSION and resolved in the schema's own order of precedence —
   * the instance's `capacityOverride`, else the template's, else the class type's —
   * then summed across the sessions that ran, so a class that added a session
   * offers more seats rather than appearing to have doubled its own room.
   *
   * Cancelled sessions are excluded from both sides: a class that never ran offered
   * no seats, and counting its capacity would report the gym as emptier than it was.
   */
  private async classUtilization(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const instances = await this.prisma.client.classInstance.findMany({
      where: {
        startsAt: { gte: win.start, lt: win.end },
        status: { not: InstanceStatus.CANCELED },
      },
      select: {
        capacityOverride: true,
        template: { select: { id: true, title: true, capacity: true } },
        classType: { select: { id: true, name: true, capacity: true } },
        bookings: {
          where: { status: { in: [...CONFIRMED_BOOKING_STATUSES] } },
          select: { id: true },
        },
      },
    });

    const byClass = new Map<
      string,
      { title: string; sessions: number; capacity: number; booked: number }
    >();
    for (const instance of instances) {
      const key = instance.template?.id ?? instance.classType?.id ?? 'unknown';
      const entry = byClass.get(key) ?? {
        title: instance.template?.title ?? instance.classType?.name ?? s.values.classFallback,
        sessions: 0,
        capacity: 0,
        booked: 0,
      };
      entry.sessions += 1;
      entry.capacity +=
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;
      entry.booked += instance.bookings.length;
      byClass.set(key, entry);
    }

    return [...byClass.values()]
      .map((entry) => ({
        class: entry.title,
        sessions: entry.sessions,
        capacity: entry.capacity,
        booked: entry.booked,
        utilization: entry.capacity === 0 ? null : rate(entry.booked, entry.capacity),
      }))
      .sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1));
  }

  /**
   * Every cancelled or missed seat in the window, line by line — the list a no-show
   * fee or a repeat-offender conversation is built from. Newest first.
   */
  private async classCancellations(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
        classInstance: { startsAt: { gte: win.start, lt: win.end } },
      },
      select: {
        status: true,
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
        classInstance: {
          select: {
            startsAt: true,
            trainer: { select: { name: true } },
            template: { select: { title: true, trainer: { select: { name: true } } } },
            classType: { select: { name: true } },
          },
        },
      },
      orderBy: { classInstance: { startsAt: 'desc' } },
      take: DETAIL_ROW_LIMIT,
    });

    return bookings.map((booking) => {
      const inst = booking.classInstance;
      return {
        date: isoDate(inst.startsAt, win.zone),
        time: clockTime(inst.startsAt, win.zone),
        class: inst.template?.title ?? inst.classType?.name ?? s.values.classFallback,
        member: booking.member
          ? memberName(booking.member, s.values.unknownMember)
          : s.values.unknownMember,
        outcome: booking.status === BookingStatus.NO_SHOW ? s.values.noShow : s.values.cancelled,
        trainer: inst.template?.trainer?.name ?? inst.trainer?.name ?? s.values.unassigned,
      };
    });
  }

  /**
   * How often a class filled up and how many were turned away.
   *
   * A session counts as full when its confirmed bookings reached its capacity, OR
   * when anyone was waitlisted at all — the second test matters because a seat
   * released after a waitlist formed leaves a session under capacity that was
   * nonetheless full at the moment somebody wanted in.
   *
   * `WAITLIST` is a real booking status the booking flow writes, so these are people
   * who actually asked and were refused, not an estimate of demand.
   */
  private async waitlistDemand(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const instances = await this.prisma.client.classInstance.findMany({
      where: {
        startsAt: { gte: win.start, lt: win.end },
        status: { not: InstanceStatus.CANCELED },
      },
      select: {
        capacityOverride: true,
        template: { select: { id: true, title: true, capacity: true } },
        classType: { select: { id: true, name: true, capacity: true } },
        bookings: { select: { status: true } },
      },
    });

    const byClass = new Map<
      string,
      { title: string; sessions: number; sessionsFull: number; waitlisted: number }
    >();
    for (const instance of instances) {
      const key = instance.template?.id ?? instance.classType?.id ?? 'unknown';
      const entry = byClass.get(key) ?? {
        title: instance.template?.title ?? instance.classType?.name ?? s.values.classFallback,
        sessions: 0,
        sessionsFull: 0,
        waitlisted: 0,
      };
      const capacity =
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;
      const confirmed = instance.bookings.filter((booking) =>
        CONFIRMED_BOOKING_STATUSES.includes(booking.status),
      ).length;
      const waitlisted = instance.bookings.filter(
        (booking) => booking.status === BookingStatus.WAITLIST,
      ).length;

      entry.sessions += 1;
      entry.waitlisted += waitlisted;
      if (waitlisted > 0 || (capacity > 0 && confirmed >= capacity)) {
        entry.sessionsFull += 1;
      }
      byClass.set(key, entry);
    }

    return [...byClass.values()]
      .map((entry) => ({
        class: entry.title,
        sessions: entry.sessions,
        sessionsFull: entry.sessionsFull,
        waitlisted: entry.waitlisted,
        fullRate: entry.sessions === 0 ? null : rate(entry.sessionsFull, entry.sessions),
      }))
      .sort((a, b) => b.waitlisted - a.waitlisted || (b.fullRate ?? 0) - (a.fullRate ?? 0));
  }

  /**
   * Personal-training sessions per trainer over the window.
   *
   * NO revenue column, deliberately. {@link PtSession} carries neither a price nor
   * the member it was for; PT money lives in the {@link CreditPack} or package that
   * paid for it and is never tied back to the session delivered. Inventing a figure
   * from the trainer's session count would be exactly the fabrication this
   * catalogue refuses — the report says so in its own description rather than
   * shipping a column of guesses.
   */
  private async ptSessions(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const sessions = await this.prisma.client.ptSession.findMany({
      where: { startsAt: { gte: win.start, lt: win.end } },
      select: { status: true, trainer: { select: { id: true, name: true } } },
    });

    const byTrainer = new Map<
      string,
      { name: string; sessions: number; completed: number; cancelled: number }
    >();
    for (const session of sessions) {
      const key = session.trainer?.id ?? UNASSIGNED_KEY;
      const entry = byTrainer.get(key) ?? {
        name: session.trainer?.name ?? s.values.unassigned,
        sessions: 0,
        completed: 0,
        cancelled: 0,
      };
      entry.sessions += 1;
      if (session.status === InstanceStatus.COMPLETED) {
        entry.completed += 1;
      } else if (session.status === InstanceStatus.CANCELED) {
        entry.cancelled += 1;
      }
      byTrainer.set(key, entry);
    }

    return [...byTrainer.values()]
      .map((entry) => {
        // Sessions still SCHEDULED have not happened yet, so they divide nothing.
        const settled = entry.completed + entry.cancelled;
        return {
          trainer: entry.name,
          sessions: entry.sessions,
          completed: entry.completed,
          cancelled: entry.cancelled,
          completionRate: settled === 0 ? null : rate(entry.completed, settled),
        };
      })
      .sort((a, b) => b.sessions - a.sessions || a.trainer.localeCompare(b.trainer));
  }

  /* ---------------------------------------------------------------------- */
  /*  Members                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Signups, cancellations and the net change per bucket, with the running total.
   *
   * Signups come from `GymMember.joinedAt`; cancellations from a subscription
   * reaching a terminal state ({@link churnMoment}) — the membership row itself is
   * never deleted when someone leaves, so counting rows would report nobody ever
   * leaving. The running total is seeded from everyone who joined BEFORE the window
   * so the last row is the gym's real headcount, not the window's own subtotal.
   *
   * Dense buckets: a period with no movement is a real zero, because the period
   * happened.
   */
  private async membershipMovement(win: ReportWindow): Promise<ReportRow[]> {
    const [members, subscriptions] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where: { role: Role.MEMBER, joinedAt: { lt: win.end } },
        select: { joinedAt: true },
      }),
      this.prisma.client.subscription.findMany({
        select: { status: true, canceledAt: true, updatedAt: true },
      }),
    ]);

    const joined = emptyBuckets(win, win.zone);
    let baseline = 0;
    for (const member of members) {
      if (member.joinedAt < win.start) {
        baseline += 1;
        continue;
      }
      const key = bucketKey(member.joinedAt, win.bucket, win.zone);
      if (joined.has(key)) {
        joined.set(key, (joined.get(key) ?? 0) + 1);
      }
    }

    const cancelled = emptyBuckets(win, win.zone);
    for (const sub of subscriptions) {
      const at = churnMoment(sub);
      if (!at || at < win.start || at >= win.end) {
        continue;
      }
      const key = bucketKey(at, win.bucket, win.zone);
      if (cancelled.has(key)) {
        cancelled.set(key, (cancelled.get(key) ?? 0) + 1);
      }
    }

    let running = baseline;
    return [...joined.entries()].map(([period, newMembers]) => {
      const cancellations = cancelled.get(period) ?? 0;
      running += newMembers;
      return {
        period,
        newMembers,
        cancellations,
        netChange: newMembers - cancellations,
        totalMembers: running,
      };
    });
  }

  /**
   * Churn over ROLLING windows ending at each period, with retention as the
   * complement.
   *
   * A rolling rate is not the same as a per-bucket one: churn for the 30 days
   * ending on a date answers "how are we doing lately", where a single day's
   * bucket is mostly noise. Each rate is subscriptions that reached a terminal
   * state inside the trailing window, over those that were live when that window
   * opened — a rate with no denominator (nobody was subscribed) is `null`, not a
   * zero, because "0% churn" and "nobody to churn" are different facts.
   *
   * Retention is reported for the 30-day window only. Retention and churn are
   * complements, so printing both for all three windows would be three columns of
   * arithmetic rather than three facts.
   */
  private async retentionAndChurn(win: ReportWindow): Promise<ReportRow[]> {
    const subscriptions = await this.prisma.client.subscription.findMany({
      select: { status: true, createdAt: true, canceledAt: true, updatedAt: true },
    });

    const churnedAt = subscriptions.map((sub) => ({ sub, at: churnMoment(sub) }));

    /** Churn over the `days` ending at `end`, or null when nobody was live at its start. */
    const rollingChurn = (end: Date, days: number): number | null => {
      const start = new Date(end.getTime() - days * DAY_MS);
      let live = 0;
      let lost = 0;
      for (const { sub, at } of churnedAt) {
        if (sub.createdAt < start && (at === null || at >= start)) {
          live += 1;
        }
        if (at !== null && at >= start && at < end) {
          lost += 1;
        }
      }
      return live === 0 ? null : rate(lost, live);
    };

    const buckets = emptyBuckets(win, win.zone);
    for (const { at } of churnedAt) {
      if (!at || at < win.start || at >= win.end) {
        continue;
      }
      const key = bucketKey(at, win.bucket, win.zone);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return [...buckets.entries()].map(([period, churned]) => {
      // The window closes at the END of the bucket's own span, so the rate covers
      // the period rather than stopping at its first instant.
      const end = bucketEnd(period, win.bucket, win.zone);
      const churnRate30 = rollingChurn(end, 30);
      return {
        period,
        churned,
        retentionRate30: churnRate30 === null ? null : Math.round((100 - churnRate30) * 10) / 10,
        churnRate30,
        churnRate60: rollingChurn(end, 60),
        churnRate90: rollingChurn(end, 90),
      };
    });
  }

  /**
   * Members who are still paying but have stopped coming — the call list.
   *
   * "At risk" is a threshold, not a fact in the data, so it is named once
   * ({@link AT_RISK_DAYS}) rather than buried in a query. A member counts when they
   * hold a live subscription AND their last check-in is older than that, or they
   * have never checked in at all. Longest absence first, because that is the order
   * somebody working down the list wants.
   */
  private async membersAtRisk(zone: string, s: ReportStrings): Promise<ReportRow[]> {
    const cutoff = new Date(Date.now() - AT_RISK_DAYS * DAY_MS);
    const members = await this.prisma.client.gymMember.findMany({
      where: {
        role: Role.MEMBER,
        deletedAt: null,
        subscriptions: { some: { status: { in: [...LIVE_SUB_STATUSES] } } },
      },
      select: {
        firstName: true,
        lastName: true,
        user: { select: { name: true, email: true, phone: true } },
        subscriptions: {
          where: { status: { in: [...LIVE_SUB_STATUSES] } },
          select: { plan: { select: { name: true } } },
          take: 1,
        },
        checkIns: { orderBy: { checkedInAt: 'desc' }, take: 1, select: { checkedInAt: true } },
      },
      take: DETAIL_ROW_LIMIT,
    });

    const now = Date.now();
    return (
      members
        .map((member) => {
          const last = member.checkIns[0]?.checkedInAt ?? null;
          return {
            member: memberName(member, s.values.unknownMember),
            plan: member.subscriptions[0]?.plan?.name ?? s.values.noPlan,
            lastVisit: last ? isoDate(last, zone) : null,
            daysAway: last === null ? null : Math.floor((now - last.getTime()) / DAY_MS),
            phone: member.user.phone ?? '',
            email: member.user.email,
            last,
          };
        })
        // Never-visited members have no "days away" to sort by, and they are the most
        // at risk of all — they go first, then the longest absences.
        .filter((row) => row.last === null || row.last < cutoff)
        .sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0))
        .map(({ last: _last, ...row }) => row)
    );
  }

  /**
   * Memberships running out inside the window.
   *
   * The range reads FORWARD here, unlike every other report in the catalogue: an
   * expiry list is about what is coming, and "the last 30 days" of expiries is a
   * list of people who have already gone. `7d`/`30d` mean the next 7 or 30 days;
   * `12w`/`12m` the next twelve weeks or months.
   */
  private async expiringMemberships(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const now = new Date();
    const until = new Date(now.getTime() + (win.end.getTime() - win.start.getTime()));
    const subscriptions = await this.prisma.client.subscription.findMany({
      where: {
        status: { in: [...LIVE_SUB_STATUSES] },
        currentPeriodEnd: { gte: now, lt: until },
      },
      select: {
        currentPeriodEnd: true,
        plan: { select: { name: true } },
        member: {
          select: {
            firstName: true,
            lastName: true,
            user: { select: { name: true, email: true, phone: true } },
          },
        },
      },
      orderBy: { currentPeriodEnd: 'asc' },
      take: DETAIL_ROW_LIMIT,
    });

    return subscriptions.map((sub) => ({
      member: sub.member ? memberName(sub.member, s.values.unknownMember) : s.values.unknownMember,
      plan: sub.plan?.name ?? s.values.noPlan,
      expiresOn: isoDate(sub.currentPeriodEnd, win.zone),
      daysLeft: Math.max(0, Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS)),
      phone: sub.member?.user.phone ?? '',
      email: sub.member?.user.email ?? '',
    }));
  }

  /**
   * Every member with status, plan, join date and last visit — the "give me
   * everything" list. Ignores the reporting window: a roster is a snapshot of who
   * is on the books now, and a member who joined years ago is still on them.
   * Trashed (soft-deleted) memberships are excluded, exactly as the console's own
   * roster excludes them.
   */
  private async memberRoster(zone: string, s: ReportStrings): Promise<ReportRow[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, deletedAt: null },
      select: {
        status: true,
        joinedAt: true,
        firstName: true,
        lastName: true,
        user: { select: { name: true, email: true } },
        subscriptions: {
          where: { status: { in: [...LIVE_SUB_STATUSES] } },
          select: { plan: { select: { name: true } } },
          take: 1,
        },
        checkIns: { orderBy: { checkedInAt: 'desc' }, take: 1, select: { checkedInAt: true } },
      },
      orderBy: { joinedAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });

    return members.map((member) => ({
      member: memberName(member, s.values.unknownMember),
      status: member.status,
      plan: member.subscriptions[0]?.plan?.name ?? s.values.noPlan,
      joined: isoDate(member.joinedAt, zone),
      lastVisit: member.checkIns[0] ? isoDate(member.checkIns[0].checkedInAt, zone) : null,
      email: member.user.email,
    }));
  }

  /**
   * Every visit in the window, newest first.
   *
   * {@link CheckIn} is deliberately NOT in the tenant extension's model set (see
   * `check-in.service.ts`), so this pins `gymId` explicitly from the request's
   * tenant rather than relying on the automatic scoping every other query here
   * gets. Forgetting that would read every gym's visits.
   */
  private async memberCheckInLog(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    // `CheckIn` carries a bare `locationId` with no relation to follow, so the
    // branch names are resolved in one small lookup and joined in memory rather
    // than left as opaque ids in the export.
    const [checkIns, locations] = await Promise.all([
      this.prisma.client.checkIn.findMany({
        where: {
          gymId: this.tenant.gymId,
          checkedInAt: { gte: win.start, lt: win.end },
        },
        select: {
          checkedInAt: true,
          method: true,
          locationId: true,
          member: {
            select: { firstName: true, lastName: true, user: { select: { name: true } } },
          },
        },
        orderBy: { checkedInAt: 'desc' },
        take: DETAIL_ROW_LIMIT,
      }),
      this.prisma.client.location.findMany({ select: { id: true, name: true } }),
    ]);

    const locationName = new Map(locations.map((location) => [location.id, location.name]));
    return checkIns.map((checkIn) => ({
      date: isoDate(checkIn.checkedInAt, win.zone),
      time: clockTime(checkIn.checkedInAt, win.zone),
      member: checkIn.member
        ? memberName(checkIn.member, s.values.unknownMember)
        : s.values.unknownMember,
      method: checkIn.method,
      location: checkIn.locationId ? (locationName.get(checkIn.locationId) ?? '') : '',
    }));
  }

  /**
   * Birthdays and joining anniversaries falling inside the window, soonest first.
   *
   * Forward-looking, like {@link expiringMemberships} — a retention call is made
   * before the day, not after it. Both occasions are recurring, so the comparison
   * is on month-and-day rather than on the stored year, and a window that crosses
   * New Year is handled by projecting each occasion into the coming year and
   * keeping whichever projection lands inside it.
   */
  private async upcomingOccasions(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const now = new Date();
    const until = new Date(now.getTime() + (win.end.getTime() - win.start.getTime()));
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, deletedAt: null },
      select: {
        joinedAt: true,
        dateOfBirth: true,
        firstName: true,
        lastName: true,
        user: { select: { name: true, phone: true } },
      },
    });

    const rows: Array<{ at: Date; row: ReportRow }> = [];
    for (const member of members) {
      const name = memberName(member, s.values.unknownMember);
      const phone = member.user.phone ?? '';
      const occasions: Array<{ label: string; from: Date }> = [
        { label: s.values.anniversary, from: member.joinedAt },
      ];
      if (member.dateOfBirth) {
        occasions.push({ label: s.values.birthday, from: member.dateOfBirth });
      }
      for (const occasion of occasions) {
        const next = nextAnniversary(occasion.from, now);
        if (next >= now && next < until) {
          rows.push({
            at: next,
            row: {
              member: name,
              occasion: occasion.label,
              date: isoDate(next, win.zone),
              years: next.getUTCFullYear() - occasion.from.getUTCFullYear(),
              phone,
            },
          });
        }
      }
    }

    return rows
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, DETAIL_ROW_LIMIT)
      .map((entry) => entry.row);
  }

  /* ---------------------------------------------------------------------- */
  /*  Trainers & staff                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * What each trainer delivered over the window, and how full it ran.
   *
   * Two kinds of session are counted SEPARATELY rather than added together: a group
   * class and a one-to-one PT hour are not interchangeable units of work, and a
   * single "sessions" figure would let a trainer teaching six full classes look
   * identical to one taking six private hours.
   *
   * Utilization divides seats booked by seats offered across the trainer's own
   * classes, so it measures how well their sessions filled — not how busy the gym
   * was. It is `null`, not zero, for a trainer who ran no group classes at all
   * (a PT-only trainer has no class to have filled or failed to fill).
   *
   * Cancelled sessions are excluded from both sides: a class that never ran offered
   * no seats and delivered nothing.
   *
   * There is no pay, commission or hours column, and that is a data limit rather
   * than an omission — {@link Trainer} carries no rate and no clock-in exists. See
   * the Staff segment's other three reports, which cannot be built at all until
   * that changes.
   */
  private async trainerPerformance(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const [instances, ptSessions] = await Promise.all([
      this.prisma.client.classInstance.findMany({
        where: {
          startsAt: { gte: win.start, lt: win.end },
          status: { not: InstanceStatus.CANCELED },
        },
        select: {
          capacityOverride: true,
          trainerId: true,
          trainer: { select: { name: true } },
          template: {
            select: { capacity: true, trainerId: true, trainer: { select: { name: true } } },
          },
          classType: { select: { capacity: true } },
          bookings: {
            where: { status: { in: [...CONFIRMED_BOOKING_STATUSES] } },
            select: { id: true },
          },
        },
      }),
      this.prisma.client.ptSession.findMany({
        where: {
          startsAt: { gte: win.start, lt: win.end },
          status: { not: InstanceStatus.CANCELED },
        },
        select: { trainerId: true, trainer: { select: { name: true } } },
      }),
    ]);

    const byTrainer = new Map<
      string,
      {
        name: string;
        classes: number;
        ptSessions: number;
        seatsOffered: number;
        seatsBooked: number;
      }
    >();
    const entryFor = (key: string, name: string) => {
      const existing = byTrainer.get(key);
      if (existing) {
        return existing;
      }
      const created = { name, classes: 0, ptSessions: 0, seatsOffered: 0, seatsBooked: 0 };
      byTrainer.set(key, created);
      return created;
    };

    for (const instance of instances) {
      // The trainer is the template's (a generated occurrence) or the instance's
      // own (one scheduled straight from a type) — the same precedence the class
      // reports use, so one trainer's work is not split across two rows.
      const key = instance.template?.trainerId ?? instance.trainerId ?? UNASSIGNED_KEY;
      const entry = entryFor(
        key,
        instance.template?.trainer?.name ?? instance.trainer?.name ?? s.values.unassigned,
      );
      entry.classes += 1;
      entry.seatsOffered +=
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;
      entry.seatsBooked += instance.bookings.length;
    }

    for (const session of ptSessions) {
      const key = session.trainerId ?? UNASSIGNED_KEY;
      const entry = entryFor(key, session.trainer?.name ?? s.values.unassigned);
      entry.ptSessions += 1;
    }

    return [...byTrainer.values()]
      .map((entry) => ({
        trainer: entry.name,
        classes: entry.classes,
        ptSessions: entry.ptSessions,
        seatsOffered: entry.seatsOffered,
        seatsBooked: entry.seatsBooked,
        utilization: entry.seatsOffered === 0 ? null : rate(entry.seatsBooked, entry.seatsOffered),
      }))
      .sort(
        (a, b) =>
          b.classes + b.ptSessions - (a.classes + a.ptSessions) ||
          a.trainer.localeCompare(b.trainer),
      );
  }

  /**
   * No-show rate per trainer over the window's completed bookings — the same
   * ATTENDED / NO_SHOW bookings as {@link attendanceByClass}, grouped by the class
   * template's trainer instead of the class. `noShowRate` is no-shows / completed
   * as a 0–100 percentage; a class with no assigned trainer rolls up under
   * "Unassigned". Ranked worst-first so the problem trainers surface at the top.
   */
  private async noShowRate(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [BookingStatus.ATTENDED, BookingStatus.NO_SHOW] },
        classInstance: { startsAt: { gte: win.start, lt: win.end } },
      },
      select: {
        status: true,
        classInstance: {
          select: {
            trainerId: true,
            trainer: { select: { name: true } },
            template: {
              select: { trainerId: true, trainer: { select: { name: true } } },
            },
          },
        },
      },
    });

    const byTrainer = new Map<string, { name: string; completed: number; noShow: number }>();
    for (const booking of bookings) {
      const inst = booking.classInstance;
      // The trainer is the template's (a generated occurrence) or the instance's
      // own (one scheduled from a type).
      const trainerKey = inst.template?.trainerId ?? inst.trainerId ?? UNASSIGNED_KEY;
      const entry = byTrainer.get(trainerKey) ?? {
        name: inst.template?.trainer?.name ?? inst.trainer?.name ?? s.values.unassigned,
        completed: 0,
        noShow: 0,
      };
      entry.completed += 1;
      if (booking.status === BookingStatus.NO_SHOW) {
        entry.noShow += 1;
      }
      byTrainer.set(trainerKey, entry);
    }

    return [...byTrainer.values()]
      .map((entry) => ({
        trainer: entry.name,
        completed: entry.completed,
        noShow: entry.noShow,
        noShowRate: entry.completed === 0 ? null : rate(entry.noShow, entry.completed),
      }))
      .sort((a, b) => (b.noShowRate ?? 0) - (a.noShowRate ?? 0) || b.completed - a.completed);
  }
}

/* -------------------------------------------------------------------------- */
/*  Constants + pure helpers                                                   */
/* -------------------------------------------------------------------------- */

/** Booking outcomes that held a CONFIRMED seat (attended, missed, or still to come). */
const CONFIRMED_BOOKING_STATUSES: readonly BookingStatus[] = [
  BookingStatus.BOOKED,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
];

const UNASSIGNED_KEY = '__unassigned__';

const UNATTRIBUTED_KEY = '__unattributed__';

/** The payment provider key the till writes — the same test the order roster filters on. */
const POS_PROVIDER = 'pos';

/**
 * Ceiling on the rows a LINE-ITEM report returns (refunds detail, POS log).
 *
 * The aggregate reports in this catalogue are bounded by their own shape — there
 * are only so many payment methods or promo codes. A detail report is bounded by
 * how busy the gym was, and both the XLSX writer and the CSV stream materialise
 * every row before sending, so an unbounded window would be an unbounded
 * allocation.
 *
 * This is a real limit with a real consequence: a window that produces more than
 * this many refunds or till sales is TRUNCATED to the newest rows. Streaming the
 * detail reports page-by-page (the shape PROJECT_PLAN T10.1 describes) is what
 * removes the cap; until then it is the honest bound, not an invisible one.
 */
const DETAIL_ROW_LIMIT = 5000;

/** Human label for a settlement method the till records, in the report's language. */
function paymentMethodLabel(s: ReportStrings, method: string): string {
  const labels: Record<string, string> = {
    CASH: s.values.cash,
    CARD: s.values.card,
    MEMBER_ACCOUNT: s.values.memberAccount,
  };
  return labels[method] ?? method;
}

/**
 * A staff member's display name. Staff rows carry a split first/last name of their
 * own (the roster's columns); an invited or plain membership has neither, and the
 * cross-gym `User` name is the fallback.
 */
function staffName(
  staff: {
    firstName?: string | null;
    lastName?: string | null;
    user?: { name: string | null } | null;
  },
  fallback: string,
): string {
  const split = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
  return split || staff.user?.name?.trim() || fallback;
}

/**
 * The tail of a cuid, for a human-readable order reference. A full cuid is 25
 * characters of noise in a spreadsheet cell; the last eight are what staff read
 * out and what the order search matches on.
 */
function shortId(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** `HH:MM` in the reporting zone, for the till log's time column. */
function clockTime(at: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(at);
}

/**
 * How long a paying member may be absent before the at-risk report calls them out.
 *
 * A threshold, not a fact the data carries — three weeks is long enough that a
 * holiday or a busy fortnight does not flag someone, and short enough to still be
 * a save rather than a post-mortem. Named here so it is one decision to revisit
 * rather than a number buried in a query.
 */
const AT_RISK_DAYS = 21;

/** Subscription states that count a member as currently subscribed (not churned). */
const LIVE_SUB_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
];

/** Months in a year, for normalising a yearly subscription price to MRR. */
const MONTHS_PER_YEAR = 12;

/**
 * One subscription's contribution to MRR, normalised to a month.
 *
 * A `TRIAL` interval contributes NOTHING. A trial is not recurring revenue however
 * much the row looks like a subscription, and counting it would inflate MRR by
 * exactly the members least likely to pay.
 */
function monthlyValue(interval: SubscriptionInterval, priceAmount: number): number {
  if (interval === SubscriptionInterval.MONTH) {
    return priceAmount;
  }
  if (interval === SubscriptionInterval.YEAR) {
    return Math.round(priceAmount / MONTHS_PER_YEAR);
  }
  return 0;
}

/** Whether a subscription was live at `at` — created by then and not yet churned. */
function wasLiveAt(
  sub: { status: SubscriptionStatus; createdAt: Date; canceledAt?: Date | null; updatedAt: Date },
  at: Date,
): boolean {
  if (sub.createdAt > at) {
    return false;
  }
  const churned = churnMoment(sub);
  return churned === null || churned > at;
}

/**
 * The same span as `win`, projected FORWARD from `now`.
 *
 * The range vocabulary is backward-looking everywhere else, but a projection is
 * about what is coming. Keeping the span and the bucket granularity means "the next
 * 30 days, by day" reads at the same resolution as "the last 30 days, by day".
 */
function forwardWindow(win: ReportWindow, now: Date): ReportWindow {
  return {
    start: now,
    end: new Date(now.getTime() + (win.end.getTime() - win.start.getTime())),
    bucket: win.bucket,
    zone: win.zone,
  };
}

/**
 * A member's display name. The gym's own split first/last name wins — it is what
 * the roster shows and what staff edited — with the cross-gym `User` name as the
 * fallback for a membership that never captured one.
 */
function memberName(
  member: {
    firstName?: string | null;
    lastName?: string | null;
    user?: { name: string | null } | null;
  },
  fallback: string,
): string {
  const split = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return split || member.user?.name?.trim() || fallback;
}

/**
 * When a subscription stopped counting as live — its `canceledAt` when recorded,
 * otherwise the moment it was last written into a terminal state. Null while the
 * subscription is still live.
 *
 * Mirrors the drill-down's own `churnMoment`; both exist because a subscription
 * that expired rather than being cancelled has no `canceledAt` to read, and
 * treating that as "never churned" would flatter every retention figure.
 */
function churnMoment(sub: {
  status: SubscriptionStatus;
  canceledAt?: Date | null;
  updatedAt: Date;
}): Date | null {
  if (sub.status === SubscriptionStatus.CANCELED || sub.status === SubscriptionStatus.EXPIRED) {
    return sub.canceledAt ?? sub.updatedAt;
  }
  return null;
}

/** The exclusive end of the bucket a `YYYY-MM-DD` key opens, in `zone`. */
function bucketEnd(key: string, bucket: 'day' | 'week' | 'month', zone: string): Date {
  if (bucket === 'month') {
    const [year, month] = key.split('-').map(Number);
    const next =
      month === 12
        ? `${(year ?? 0) + 1}-01-01`
        : `${year}-${String((month ?? 0) + 1).padStart(2, '0')}-01`;
    return zonedDayStart(next, zone);
  }
  return zonedDayStart(addZonedDays(key, bucket === 'week' ? 7 : 1, zone), zone);
}

/**
 * The next recurrence of a month-and-day on or after `from` — a birthday or a
 * joining anniversary projected into the current year, rolled to the next one when
 * it has already passed.
 *
 * 29 February lands on 1 March in a common year, which is what `Date.UTC`
 * normalisation does on its own and the convention most systems settle on.
 */
function nextAnniversary(original: Date, from: Date): Date {
  const year = from.getUTCFullYear();
  const thisYear = new Date(
    Date.UTC(year, original.getUTCMonth(), original.getUTCDate(), 0, 0, 0, 0),
  );
  if (
    thisYear >= new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()))
  ) {
    return thisYear;
  }
  return new Date(Date.UTC(year + 1, original.getUTCMonth(), original.getUTCDate(), 0, 0, 0, 0));
}

/** Escape one CSV field (RFC 4180) — quote + double embedded quotes when needed. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
