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
  StockMovementReason,
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
  productVariantsSchema,
  type ProductVariant,
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
import { OPENING_COUNT_NOTE } from '../products/admin-products.service';
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
  async catalog(
    lang: ReportLocale | null = null,
    { includeHidden = false }: { includeHidden?: boolean } = {},
  ): Promise<ReportCatalogResponse> {
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
      // `includeHidden` is the settings screen: it lists every report so a gym
      // can switch one back on, and it needs the same language as the hub.
      reports: REPORT_CATALOG.filter(
        (report) => includeHidden || reports[report.key as ReportToggle] !== false,
      ).map((report) => localizeDefinition(report, language)),
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
      case 'revenue-by-payment-method': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueByPaymentMethod(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'outstanding-invoices': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.outstandingInvoices(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'projected-revenue': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.projectedRevenue(win, s),
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
      case 'product-sales': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.productSales(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'product-sales-detail': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.productSalesDetail(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'stock-inventory': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.stockInventory(s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'stock-movements': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.stockMovements(win, s),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
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
          rows: await this.membersAtRisk(win, s),
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
          rows: await this.memberRoster(win, s),
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
   * The columns follow the till's own vocabulary: cash, card at the till, a
   * bank transfer the desk recorded, and a member's account are the
   * `pos`-provider methods; everything captured by a gateway is "online".
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
      bankTransfer: number;
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
        bankTransfer: 0,
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
      } else if (payment.method === PaymentMethod.BANK_TRANSFER) {
        day.bankTransfer += payment.amount;
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
      bankTransfer: day.bankTransfer,
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
  /*  Products                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The products behind a set of ids, with their variants parsed - one lookup
   * for a whole report's worth of lines. A variant's SKU and stock live in the
   * product's `variants` JSON; its cost is the product's (there is no per-variant
   * cost), and its category is the product's.
   */
  private async loadProducts(ids: Iterable<string>): Promise<Map<string, ProductRecord>> {
    const wanted = [...new Set(ids)];
    if (wanted.length === 0) return new Map();
    const rows = await this.prisma.client.product.findMany({
      where: { id: { in: wanted } },
      select: {
        id: true,
        name: true,
        costAmount: true,
        priceAmount: true,
        stock: true,
        lowStockThreshold: true,
        category: { select: { name: true } },
        variants: true,
      },
    });
    return new Map(rows.map((row) => [row.id, toProductRecord(row)]));
  }

  /** Every product line sold in the window, resolved to its product and variant. */
  private async soldProductLines(win: ReportWindow, s: ReportStrings): Promise<SoldLine[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { status: PaymentStatus.CAPTURED } },
      },
      select: {
        id: true,
        createdAt: true,
        customerName: true,
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
        location: { select: { name: true } },
        soldBy: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
        payment: { select: { method: true, provider: true } },
        items: { select: { label: true, amount: true, qty: true, productVariantId: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: DETAIL_ROW_LIMIT,
    });
    const refs = orders.flatMap((order) =>
      order.items.map((item) =>
        item.productVariantId ? decodeVariantRef(item.productVariantId) : null,
      ),
    );
    const products = await this.loadProducts(refs.flatMap((ref) => (ref ? [ref.productId] : [])));

    const lines: SoldLine[] = [];
    for (const order of orders) {
      for (const item of order.items) {
        const ref = item.productVariantId ? decodeVariantRef(item.productVariantId) : null;
        if (!ref) continue;
        const product = products.get(ref.productId);
        const variant =
          ref.variantIndex === null ? null : (product?.variants[ref.variantIndex] ?? null);
        const cost = product?.costAmount ?? null;
        lines.push({
          order,
          item,
          productId: ref.productId,
          variantIndex: ref.variantIndex,
          product: product?.name ?? item.label,
          variant: variant?.name ?? '',
          sku: variant?.sku ?? '',
          category: product?.category ?? s.values.categoryUncategorised,
          cost: cost === null ? null : cost * item.qty,
          channel: deriveOrderChannel(order.payment?.provider),
        });
      }
    }
    return lines;
  }

  /**
   * Product performance per product, variant and branch: quantity, sales value,
   * cost of goods, gross margin, average price, the POS / online split, and how
   * many sales carried it. Cost of goods is the product's recorded cost times the
   * quantity; a product with no cost on file reads null for cost and margin
   * rather than a margin of 100%.
   */
  private async productSales(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const lines = await this.soldProductLines(win, s);
    interface Entry {
      product: string;
      variant: string;
      sku: string;
      category: string;
      quantity: number;
      revenue: number;
      cogs: number | null;
      posSales: number;
      onlineSales: number;
      orders: Set<string>;
      location: string;
    }
    const entries = new Map<string, Entry>();
    for (const line of lines) {
      const location = line.order.location?.name ?? '';
      const key = `${line.productId}:${line.variantIndex ?? 'base'}|${location}`;
      const entry = entries.get(key) ?? {
        product: line.product,
        variant: line.variant,
        sku: line.sku,
        category: line.category,
        quantity: 0,
        revenue: 0,
        cogs: line.cost === null ? null : 0,
        posSales: 0,
        onlineSales: 0,
        orders: new Set<string>(),
        location,
      };
      entry.quantity += line.item.qty;
      entry.revenue += line.item.amount;
      if (entry.cogs !== null && line.cost !== null) entry.cogs += line.cost;
      if (line.channel === 'POS') entry.posSales += line.item.amount;
      else entry.onlineSales += line.item.amount;
      entry.orders.add(line.order.id);
      entries.set(key, entry);
    }
    return [...entries.values()]
      .sort((a, b) => b.revenue - a.revenue || a.product.localeCompare(b.product))
      .map((entry) => {
        const margin = entry.cogs === null ? null : entry.revenue - entry.cogs;
        return {
          product: entry.product,
          variant: entry.variant,
          sku: entry.sku,
          category: entry.category,
          quantity: entry.quantity,
          revenue: entry.revenue,
          cogs: entry.cogs,
          margin,
          marginPct: margin === null || entry.revenue === 0 ? null : rate(margin, entry.revenue),
          avgPrice: entry.quantity > 0 ? Math.round(entry.revenue / entry.quantity) : null,
          posSales: entry.posSales,
          onlineSales: entry.onlineSales,
          transactions: entry.orders.size,
          location: entry.location,
        };
      });
  }

  /** Every product line sold in the window, one row each, oldest first. */
  private async productSalesDetail(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const lines = await this.soldProductLines(win, s);
    return lines.map((line) => ({
      date: isoDate(line.order.createdAt, win.zone),
      time: clockTime(line.order.createdAt, win.zone),
      product: line.product,
      variant: line.variant,
      quantity: line.item.qty,
      customer: line.order.member
        ? memberName(line.order.member, s.values.unknownMember)
        : (line.order.customerName ?? s.values.guest),
      channel: line.channel === 'POS' ? s.values.channelPos : s.values.channelOnline,
      price: line.item.amount,
      cost: line.cost,
      margin: line.cost === null ? null : line.item.amount - line.cost,
      method: line.order.payment ? paymentMethodLabel(s, line.order.payment.method) : '',
      location: line.order.location?.name ?? '',
      staff: line.order.soldBy
        ? staffName(line.order.soldBy, s.values.unattributed)
        : s.values.unattributed,
      reference: shortId(line.order.id),
    }));
  }

  /**
   * Every stock position - a product's base count, or each of its variants -
   * with its value and a status against the product's own low-stock threshold.
   * Stock is held per product, not per branch, so there is no location column.
   * A snapshot: the reporting window does not apply.
   */
  private async stockInventory(s: ReportStrings): Promise<ReportRow[]> {
    const rows = await this.prisma.client.product.findMany({
      select: {
        id: true,
        name: true,
        costAmount: true,
        priceAmount: true,
        stock: true,
        lowStockThreshold: true,
        category: { select: { name: true } },
        variants: true,
      },
      orderBy: { name: 'asc' },
      take: DETAIL_ROW_LIMIT,
    });
    const out: ReportRow[] = [];
    for (const row of rows) {
      const product = toProductRecord(row);
      const positions: Array<{ variant: string; sku: string; stock: number | null }> =
        product.variants.length > 0
          ? product.variants.map((variant) => ({
              variant: variant.name,
              sku: variant.sku,
              stock: variant.stock,
            }))
          : [{ variant: '', sku: '', stock: product.stock }];
      for (const position of positions) {
        const status =
          position.stock === null
            ? 'notTracked'
            : position.stock === 0
              ? 'outOfStock'
              : product.lowStockThreshold !== null && position.stock <= product.lowStockThreshold
                ? 'lowStock'
                : 'inStock';
        out.push({
          product: product.name,
          variant: position.variant,
          sku: position.sku,
          stock: position.stock,
          unitCost: product.costAmount,
          stockValue:
            position.stock === null || product.costAmount === null
              ? null
              : position.stock * product.costAmount,
          threshold: product.lowStockThreshold,
          status: s.values.stockStatuses[status] ?? status,
        });
      }
    }
    return out;
  }

  /**
   * Every stock movement in the window, oldest first - the ledger read forward.
   *
   * The type is the reason in the desk's words, with two refinements the ledger
   * does not store directly: a `RECEIVE` carrying the product form's opening
   * note is the initial stock, and a `SALE` reads as a POS or online sale by the
   * channel of the order behind it. Write-offs are one reason in the ledger
   * (damaged, lost, expired and internal use are told apart only by the note),
   * so they read as one type here.
   *
   * Actors are looked up by their bare user id, as the console's own ledger view
   * does: a movement outlives the staff member who made it.
   */
  private async stockMovements(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const movements = await this.prisma.client.stockMovement.findMany({
      where: { createdAt: { gte: win.start, lt: win.end } },
      select: {
        createdAt: true,
        variantIndex: true,
        variantLabel: true,
        delta: true,
        resultingStock: true,
        reason: true,
        note: true,
        actorId: true,
        orderId: true,
        product: { select: { id: true, name: true, costAmount: true, variants: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: DETAIL_ROW_LIMIT,
    });
    const orderIds = [...new Set(movements.flatMap((m) => (m.orderId ? [m.orderId] : [])))];
    const actorIds = [...new Set(movements.flatMap((m) => (m.actorId ? [m.actorId] : [])))];
    const [orders, users] = await Promise.all([
      orderIds.length === 0
        ? Promise.resolve([])
        : this.prisma.client.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, payment: { select: { provider: true } } },
          }),
      actorIds.length === 0
        ? Promise.resolve([])
        : this.prisma.client.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, name: true, email: true },
          }),
    ]);
    const channelByOrder = new Map(
      orders.map((order) => [order.id, deriveOrderChannel(order.payment?.provider)]),
    );
    const nameByActor = new Map(users.map((user) => [user.id, user.name || user.email]));

    return movements.map((movement) => {
      const variants = parseVariants(movement.product.variants);
      const variant =
        movement.variantIndex === null ? null : (variants[movement.variantIndex] ?? null);
      let type: string;
      switch (movement.reason) {
        case StockMovementReason.RECEIVE:
          type = movement.note === OPENING_COUNT_NOTE ? 'initial' : 'received';
          break;
        case StockMovementReason.SALE:
          type =
            movement.orderId && channelByOrder.get(movement.orderId) === 'ONLINE'
              ? 'onlineSale'
              : 'posSale';
          break;
        case StockMovementReason.REFUND_RESTOCK:
          type = 'customerReturn';
          break;
        case StockMovementReason.RECOUNT:
          type = 'recount';
          break;
        case StockMovementReason.WRITE_OFF:
          type = 'writeOff';
          break;
        default:
          type = 'adjustment';
      }
      const cost = movement.product.costAmount;
      return {
        date: isoDate(movement.createdAt, win.zone),
        time: clockTime(movement.createdAt, win.zone),
        product: movement.product.name,
        variant: variant?.name ?? movement.variantLabel,
        sku: variant?.sku ?? '',
        type: s.values.movementTypes[type] ?? type,
        delta: movement.delta,
        before: movement.resultingStock - movement.delta,
        after: movement.resultingStock,
        valueImpact: cost === null ? null : movement.delta * cost,
        reference: movement.orderId ? shortId(movement.orderId) : '',
        staff: movement.actorId
          ? (nameByActor.get(movement.actorId) ?? s.values.unknownMember)
          : '',
        note: movement.note,
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
  private async outstandingInvoices(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    // Issued in the window, OR still owed whenever it was issued: an obligation
    // does not stop being one because the month rolled over.
    const invoices = await this.prisma.client.invoice.findMany({
      where: {
        OR: [
          { issuedAt: { gte: win.start, lt: win.end } },
          { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] } },
        ],
      },
      select: {
        number: true,
        issuedAt: true,
        dueDate: true,
        amount: true,
        status: true,
        type: true,
        description: true,
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
        subscription: { select: { plan: { select: { name: true } } } },
        order: {
          select: {
            items: { select: { label: true } },
            location: { select: { name: true } },
            payment: { select: { method: true, provider: true, createdAt: true } },
          },
        },
      },
      orderBy: { issuedAt: 'asc' },
      take: DETAIL_ROW_LIMIT,
    });

    const now = new Date();
    return invoices.map((invoice) => {
      const settled =
        invoice.status === InvoiceStatus.PAID || invoice.status === InvoiceStatus.REFUNDED;
      const paid = settled ? invoice.amount : 0;
      // The desk's words for the raw states: a failed charge is overdue whatever
      // its date; a pending one is overdue past its due date, upcoming before it,
      // and simply unpaid when it never had one.
      let status: string;
      if (invoice.status === InvoiceStatus.PAID) status = s.values.invoiceStatuses.paid ?? 'Paid';
      else if (invoice.status === InvoiceStatus.REFUNDED) {
        status = s.values.invoiceStatuses.refunded ?? 'Refunded';
      } else if (
        invoice.status === InvoiceStatus.FAILED ||
        (invoice.dueDate && invoice.dueDate < now)
      ) {
        status = s.values.invoiceStatuses.overdue ?? 'Overdue';
      } else if (invoice.dueDate) status = s.values.invoiceStatuses.upcoming ?? 'Upcoming';
      else status = s.values.invoiceStatuses.unpaid ?? 'Unpaid';

      const orderItems = invoice.order?.items.map((item) => item.label).join(', ') ?? '';
      const item =
        invoice.subscription?.plan?.name ??
        (orderItems ||
          invoice.description ||
          (s.values.invoiceTypes[invoice.type] ?? invoice.type));
      // A till or shop sale carries its payment; a subscription charge is
      // collected online and has no payment row of its own.
      const method = invoice.order?.payment
        ? paymentMethodLabel(s, invoice.order.payment.method)
        : invoice.subscription
          ? s.values.channelOnline
          : '';
      const paidAt = settled ? (invoice.order?.payment?.createdAt ?? invoice.issuedAt) : null;
      return {
        invoice: invoice.number,
        member: invoice.member
          ? memberName(invoice.member, s.values.unknownMember)
          : s.values.unknownMember,
        item,
        issuedAt: isoDate(invoice.issuedAt, win.zone),
        dueDate: invoice.dueDate ? isoDate(invoice.dueDate, win.zone) : null,
        amount: invoice.amount,
        paid,
        outstanding: invoice.status === InvoiceStatus.REFUNDED ? 0 : invoice.amount - paid,
        status,
        method,
        paidAt: paidAt ? isoDate(paidAt, win.zone) : null,
        location: invoice.order?.location?.name ?? '',
      };
    });
  }

  /**
   * Every live subscription with what it recurs at, its value per month, the
   * next charge, and what it is scheduled to charge inside the window AHEAD.
   *
   * Two totals the reader wants are the sums of two columns, on purpose: the
   * `monthly` column sums to current recurring revenue (a yearly plan counts a
   * twelfth, a trial nothing), and `expected` sums to the revenue expected in the
   * forward window - so a spreadsheet gets both without a summary row that would
   * break sorting. Forward-looking like the expiry report: the range is read as
   * the next 7 / 31 days, not the last.
   *
   * SCHEDULED, not guaranteed: a renewal can fail, a member can cancel before it,
   * a frozen subscription's date moves when it resumes. A subscription that will
   * not renew (cancelling at period end, or a trial) has no next charge and
   * nothing expected, but still recurs today, so it still counts toward MRR.
   */
  private async projectedRevenue(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const now = new Date();
    const forward = forwardWindow(win, now);
    const subscriptions = await this.prisma.client.subscription.findMany({
      where: { status: { in: [...LIVE_SUB_STATUSES] } },
      select: {
        status: true,
        priceAmount: true,
        interval: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: { select: { name: true } },
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
      },
      take: DETAIL_ROW_LIMIT,
    });

    const rows = subscriptions.map((sub) => {
      const renews = !sub.cancelAtPeriodEnd && sub.status !== SubscriptionStatus.TRIAL;
      // Every charge scheduled before the window closes, stepping the calendar
      // by the billing interval - a monthly plan renewing on the 5th charges
      // once in the next 31 days, a plan renewing tomorrow with a 12-month
      // window charges twelve times.
      let expected = 0;
      if (renews) {
        let charge = sub.currentPeriodEnd;
        while (charge < forward.end) {
          expected += sub.priceAmount;
          charge = addInterval(charge, sub.interval);
        }
      }
      const status: MembershipStatusKey =
        sub.status === SubscriptionStatus.FROZEN
          ? 'frozen'
          : sub.status === SubscriptionStatus.PAST_DUE
            ? 'renewalDue'
            : sub.cancelAtPeriodEnd
              ? 'expiring'
              : 'active';
      return {
        nextChargeAt: renews ? sub.currentPeriodEnd : null,
        row: {
          member: sub.member
            ? memberName(sub.member, s.values.unknownMember)
            : s.values.unknownMember,
          plan: sub.plan?.name ?? s.values.noPlan,
          recurring: sub.priceAmount,
          interval: s.values.intervals[sub.interval] ?? sub.interval,
          monthly: monthlyValue(sub.interval, sub.priceAmount),
          nextCharge: renews ? isoDate(sub.currentPeriodEnd, win.zone) : null,
          expected,
          status: s.values.membershipStatuses[status] ?? status,
        },
      };
    });
    // Soonest charge first; subscriptions with no charge coming go last.
    return rows
      .sort(
        (a, b) =>
          (a.nextChargeAt?.getTime() ?? Number.POSITIVE_INFINITY) -
          (b.nextChargeAt?.getTime() ?? Number.POSITIVE_INFINITY),
      )
      .map((entry) => entry.row);
  }

  /**
   * How revenue was collected, per branch, net of refunds: cash, card at the
   * till, online, bank transfer, member account. The same classification the
   * daily reconciliation uses, so the two agree on what "online" means.
   */
  private async revenueByPaymentMethod(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const payments = await this.prisma.client.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      select: {
        amount: true,
        refundedAmount: true,
        method: true,
        provider: true,
        order: { select: { location: { select: { name: true } } } },
      },
    });

    interface Entry {
      method: string;
      location: string;
      payments: number;
      revenue: number;
    }
    const entries = new Map<string, Entry>();
    for (const payment of payments) {
      const method =
        deriveOrderChannel(payment.provider) !== 'POS'
          ? s.values.channelOnline
          : payment.method === PaymentMethod.CASH
            ? s.values.cash
            : payment.method === PaymentMethod.BANK_TRANSFER
              ? s.values.bankTransfer
              : payment.method === PaymentMethod.MEMBER_ACCOUNT
                ? s.values.memberAccount
                : s.values.cardPos;
      const location = payment.order?.location?.name ?? '';
      const key = `${method}|${location}`;
      const entry = entries.get(key) ?? { method, location, payments: 0, revenue: 0 };
      entry.payments += 1;
      entry.revenue += payment.amount - payment.refundedAmount;
      entries.set(key, entry);
    }
    const total = [...entries.values()].reduce((sum, entry) => sum + entry.revenue, 0);
    return [...entries.values()]
      .sort((a, b) => b.revenue - a.revenue || a.method.localeCompare(b.method))
      .map((entry) => ({
        method: entry.method,
        payments: entry.payments,
        revenue: entry.revenue,
        share: total > 0 ? rate(entry.revenue, total) : null,
        location: entry.location,
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
   * Members who need retention or renewal attention, each filed under the ONE
   * group that needs acting on first: a renewal falling due, a membership about
   * to expire, one that recently expired or was cancelled, a member who came
   * back, and - last, because the others are dated - members who have stopped
   * turning up. A member in none of them is not on the list; "fine" is not a
   * row anybody works through.
   *
   * The thresholds are named once, beside the roster's status rules they share
   * ({@link assessMembership}), rather than buried in six queries.
   */
  private async membersAtRisk(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, deletedAt: null },
      select: memberSelect(win),
      take: DETAIL_ROW_LIMIT,
    });
    const now = new Date();
    const rows: Array<{ order: number; name: string; row: ReportRow }> = [];
    for (const member of members) {
      const view = assessMembership(member, now);
      const group = retentionGroup(member, view, now);
      if (group === null) continue;
      const last = member.checkIns[0]?.checkedInAt ?? null;
      const name = memberName(member, s.values.unknownMember);
      rows.push({
        order: RETENTION_GROUP_ORDER.indexOf(group),
        name,
        row: {
          group: (s.values.retentionGroups[group] ?? group).replace('{days}', String(AT_RISK_DAYS)),
          member: name,
          phone: member.user.phone ?? '',
          email: member.user.email,
          plan: view.current?.plan?.name ?? s.values.noPlan,
          status: s.values.membershipStatuses[view.status] ?? view.status,
          lastVisit: last ? isoDate(last, win.zone) : null,
          daysSince: last ? Math.floor((now.getTime() - last.getTime()) / DAY_MS) : null,
          expiresOn: view.current ? isoDate(view.current.currentPeriodEnd, win.zone) : null,
          renewal: view.nextRenewal
            ? isoDate(view.nextRenewal, win.zone)
            : (s.values.membershipStatuses[view.status] ?? view.status),
          value: view.current?.priceAmount ?? null,
        },
      });
    }
    return rows
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .map((entry) => entry.row);
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
   * The full member base with current membership information - the "give me
   * everything" list. The base itself ignores the reporting window (a member who
   * joined years ago is still on the books); the window decides one column,
   * visits, which is a filtered relation count rather than a second query per
   * member. Trashed (soft-deleted) memberships are excluded, exactly as the
   * console's own roster excludes them.
   *
   * The status column is the one the front desk uses - active, new, expiring,
   * renewal due, expired, cancelled, frozen - derived in {@link assessMembership}
   * from the current subscription rather than read off the raw enum, so the
   * report and the retention list agree on what every word means.
   */
  private async memberRoster(win: ReportWindow, s: ReportStrings): Promise<ReportRow[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, deletedAt: null },
      select: memberSelect(win),
      orderBy: { joinedAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });
    const now = new Date();
    return members.map((member) => {
      const view = assessMembership(member, now);
      const last = member.checkIns[0]?.checkedInAt ?? null;
      return {
        member: memberName(member, s.values.unknownMember),
        phone: member.user.phone ?? '',
        email: member.user.email,
        status: s.values.membershipStatuses[view.status] ?? view.status,
        plan: view.current?.plan?.name ?? s.values.noPlan,
        joined: isoDate(member.joinedAt, win.zone),
        // The day the member said their membership begins, when the gym asked;
        // otherwise the day the current subscription was created.
        startDate: member.startDate
          ? isoDate(member.startDate, win.zone)
          : view.current
            ? isoDate(view.current.createdAt, win.zone)
            : null,
        expiresOn: view.current ? isoDate(view.current.currentPeriodEnd, win.zone) : null,
        lastVisit: last ? isoDate(last, win.zone) : null,
        visits: member._count.checkIns,
        value: view.current?.priceAmount ?? null,
        nextRenewal: view.nextRenewal ? isoDate(view.nextRenewal, win.zone) : null,
      };
    });
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
      method: s.values.checkInMethods[checkIn.method] ?? checkIn.method,
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
    BANK_TRANSFER: s.values.bankTransfer,
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

/** A member counts as "new" for this long after joining. */
const NEW_MEMBER_DAYS = 30;
/** A membership that will not renew is "expiring" once its end is this close. */
const EXPIRING_DAYS = 30;
/** A membership that will renew is "renewal due" once its end is this close. */
const RENEWAL_DUE_DAYS = 14;
/** An expiry, a cancellation or a return counts as "recent" for this long. */
const RECENT_DAYS = 30;

/** The membership status the front desk uses - see {@link assessMembership}. */
type MembershipStatusKey =
  | 'active'
  | 'new'
  | 'expiring'
  | 'renewalDue'
  | 'expired'
  | 'cancelled'
  | 'frozen'
  | 'none';

type RetentionGroup =
  | 'renewalDue'
  | 'expiringSoon'
  | 'recentlyExpired'
  | 'recentlyCancelled'
  | 'reactivated'
  | 'noVisit';

/** The order the retention list files its groups in - the dated ones first. */
const RETENTION_GROUP_ORDER: readonly RetentionGroup[] = [
  'renewalDue',
  'expiringSoon',
  'recentlyExpired',
  'recentlyCancelled',
  'reactivated',
  'noVisit',
];

/** One subscription as the member reports read it. */
interface MemberSubscription {
  status: SubscriptionStatus;
  priceAmount: number;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  plan: { name: string } | null;
}

/** One member as the member reports read them - see {@link memberSelect}. */
interface MemberView {
  firstName: string | null;
  lastName: string | null;
  joinedAt: Date;
  startDate: Date | null;
  user: { name: string | null; email: string; phone: string | null };
  /** Newest first. */
  subscriptions: MemberSubscription[];
  /** The latest visit only. */
  checkIns: { checkedInAt: Date }[];
  _count: { checkIns: number };
}

/** The one `select` both member reports read, so they cannot disagree on a field. */
function memberSelect(win: ReportWindow) {
  return {
    firstName: true,
    lastName: true,
    joinedAt: true,
    startDate: true,
    user: { select: { name: true, email: true, phone: true } },
    subscriptions: {
      orderBy: { createdAt: 'desc' as const },
      select: {
        status: true,
        priceAmount: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        createdAt: true,
        updatedAt: true,
        plan: { select: { name: true } },
      },
    },
    checkIns: {
      orderBy: { checkedInAt: 'desc' as const },
      take: 1,
      select: { checkedInAt: true },
    },
    _count: { select: { checkIns: { where: { checkedInAt: { gte: win.start, lt: win.end } } } } },
  };
}

/**
 * What a member's membership IS right now, in the front desk's words.
 *
 * The current subscription is the live one if there is one, else the newest.
 * The raw enum says "active" about a membership that lapses tomorrow and one
 * with a year to run; the desk does not, so: frozen, cancelled and expired read
 * off the enum; a failed payment is a renewal due whatever the date; a live
 * membership that will NOT renew (cancelling at period end, or a trial) is
 * expiring inside {@link EXPIRING_DAYS}; one that will renew is renewal due
 * inside {@link RENEWAL_DUE_DAYS}; a member inside {@link NEW_MEMBER_DAYS} of
 * joining is new; anything else is simply active.
 */
function assessMembership(
  member: Pick<MemberView, 'joinedAt' | 'subscriptions'>,
  now: Date,
): { status: MembershipStatusKey; current: MemberSubscription | null; nextRenewal: Date | null } {
  const live = member.subscriptions.find((sub) => LIVE_SUB_STATUSES.includes(sub.status));
  const current = live ?? member.subscriptions[0] ?? null;
  if (!current) return { status: 'none', current: null, nextRenewal: null };

  const renews = !current.cancelAtPeriodEnd && current.status !== SubscriptionStatus.TRIAL;
  const daysLeft = (current.currentPeriodEnd.getTime() - now.getTime()) / DAY_MS;
  const nextRenewal =
    renews &&
    (current.status === SubscriptionStatus.ACTIVE || current.status === SubscriptionStatus.PAST_DUE)
      ? current.currentPeriodEnd
      : null;

  let status: MembershipStatusKey;
  switch (current.status) {
    case SubscriptionStatus.FROZEN:
      status = 'frozen';
      break;
    case SubscriptionStatus.CANCELED:
      status = 'cancelled';
      break;
    case SubscriptionStatus.EXPIRED:
      status = 'expired';
      break;
    case SubscriptionStatus.PAST_DUE:
      status = 'renewalDue';
      break;
    default:
      if (!renews && daysLeft <= EXPIRING_DAYS) status = 'expiring';
      else if (renews && daysLeft <= RENEWAL_DUE_DAYS) status = 'renewalDue';
      else if (now.getTime() - member.joinedAt.getTime() <= NEW_MEMBER_DAYS * DAY_MS)
        status = 'new';
      else status = 'active';
  }
  return { status, current, nextRenewal };
}

/** The retention group a member belongs to, if any - see {@link membersAtRisk}. */
function retentionGroup(
  member: Pick<MemberView, 'subscriptions' | 'checkIns'>,
  view: ReturnType<typeof assessMembership>,
  now: Date,
): RetentionGroup | null {
  const { status, current } = view;
  const recent = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
  if (status === 'renewalDue') return 'renewalDue';
  if (status === 'expiring') return 'expiringSoon';
  if (status === 'expired' && current && current.currentPeriodEnd >= recent)
    return 'recentlyExpired';
  if (status === 'cancelled' && current && (current.canceledAt ?? current.updatedAt) >= recent) {
    return 'recentlyCancelled';
  }
  const isLive = current !== null && LIVE_SUB_STATUSES.includes(current.status);
  if (!isLive || !current) return null;
  const cameBack =
    current.createdAt >= recent &&
    member.subscriptions.some(
      (sub) =>
        sub !== current &&
        (sub.status === SubscriptionStatus.CANCELED || sub.status === SubscriptionStatus.EXPIRED),
    );
  if (cameBack) return 'reactivated';
  const last = member.checkIns[0]?.checkedInAt ?? null;
  if (last === null || last < new Date(now.getTime() - AT_RISK_DAYS * DAY_MS)) return 'noVisit';
  return null;
}

/** Subscription states that count a member as currently subscribed (not churned). */
const LIVE_SUB_STATUSES: readonly SubscriptionStatus[] = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
];

/** A product as the product reports read it, variants parsed from their JSON. */
interface ProductRecord {
  id: string;
  name: string;
  costAmount: number | null;
  priceAmount: number;
  stock: number | null;
  lowStockThreshold: number | null;
  category: string | null;
  variants: ProductVariant[];
}

function parseVariants(value: unknown): ProductVariant[] {
  const parsed = productVariantsSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

function toProductRecord(row: {
  id: string;
  name: string;
  costAmount: number | null;
  priceAmount: number;
  stock: number | null;
  lowStockThreshold: number | null;
  category: { name: string } | null;
  variants: unknown;
}): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    costAmount: row.costAmount,
    priceAmount: row.priceAmount,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    category: row.category?.name ?? null,
    variants: parseVariants(row.variants),
  };
}

/** A person as the sold-line rows name them. */
interface NamedParty {
  firstName: string | null;
  lastName: string | null;
  user: { name: string | null } | null;
}

/** One product line of a captured order, resolved - see `soldProductLines`. */
interface SoldLine {
  order: {
    id: string;
    createdAt: Date;
    customerName: string | null;
    member: NamedParty | null;
    location: { name: string } | null;
    soldBy: NamedParty | null;
    payment: { method: PaymentMethod; provider: string } | null;
  };
  item: { label: string; amount: number; qty: number };
  productId: string;
  variantIndex: number | null;
  product: string;
  variant: string;
  sku: string;
  category: string;
  /** The line's cost of goods (unit cost times quantity), or null with no cost on file. */
  cost: number | null;
  channel: 'POS' | 'ONLINE';
}

/** Months in a year, for normalising a yearly subscription price to MRR. */
const MONTHS_PER_YEAR = 12;

/**
 * One subscription's contribution to MRR, normalised to a month.
 *
 * A `TRIAL` interval contributes NOTHING. A trial is not recurring revenue however
 * much the row looks like a subscription, and counting it would inflate MRR by
 * exactly the members least likely to pay.
 */
/** The instant one billing interval after `at`, stepping the calendar month or year. */
function addInterval(at: Date, interval: SubscriptionInterval): Date {
  const next = new Date(at.getTime());
  if (interval === SubscriptionInterval.YEAR) next.setUTCFullYear(next.getUTCFullYear() + 1);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

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
