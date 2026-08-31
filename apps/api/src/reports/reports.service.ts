import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  InstanceStatus,
  InvoiceStatus,
  PaymentStatus,
  Role,
  SubscriptionInterval,
  SubscriptionStatus,
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
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { buildReportWorkbook } from './xlsx';
import { atLocation, memberAtLocation } from '../common/location-filter.util';
import {
  bucketKey,
  DAY_MS,
  emptyBuckets,
  isoDate,
  rate,
  resolveWindow,
  type ReportWindow,
} from './report-window.util';

/** The precomputed shape a report resolves to before it is shaped for a surface. */
interface ComputedReport {
  name: string;
  currency: string;
  columns: ReportColumn[];
  rows: ReportRow[];
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
 * Every aggregate rides the tenant extension's automatic scoping, {@link CheckIn}
 * now included — Stage 3 added it to the extension's model set, which until then
 * was a hand-maintained allowlist it had been missing from. The check-in log still
 * pins `gymId` from {@link TenantContext} by hand; that pin is now redundant
 * rather than load-bearing, and it is left in place deliberately as belt and
 * braces on the one query in this file whose leak would expose another gym's
 * visits.
 *
 * `ReportQuery.locationId` narrows a report to ONE BRANCH, and unlike `gymId` it is
 * explicit rather than ambient: location coverage is partial across the schema and
 * will stay partial, so a blanket Prisma extension would either fail closed on the
 * models that legitimately have no branch or silently no-op. Each report therefore
 * decides for itself, and the decision is recorded on the method:
 *
 *   • Order-backed (sales, POS, revenue, refunds) — filtered by the branch that
 *     RANG THE SALE UP, via `Order.locationId` / `Payment.locationId` /
 *     `Refund.locationId`, all now plain equalities ({@link atLocation}). Stage 5
 *     denormalised the latter two from the order, retiring the relation filter
 *     these reads used to issue in a loop.
 *   • Class-backed (attendance, utilization, cancellations, waitlist, no-shows) —
 *     filtered, via `ClassInstance.locationId` ({@link atLocation}).
 *   • Member-backed (roster, retention, churn, movement, at-risk, expiries,
 *     occasions, projected revenue, outstanding invoices) — filtered by the
 *     member's HOME BRANCH. `GymMember` and, since Stage 5, `Invoice` carry that
 *     answer on the row ({@link atLocation}); `Subscription` reaches it through
 *     `member` ({@link memberAtLocation}) and keeps doing so DELIBERATELY, because
 *     a transferring member's recurring revenue follows them. Stage 2 added the
 *     member column; before it these were gym-wide, and the register in
 *     `common/location-filter.util.ts` records why — and now also records why the
 *     subscription half stayed live while the invoice half froze.
 *   • Visit-backed (the check-in log) — filtered by the branch the member WALKED
 *     INTO, via `CheckIn.locationId` ({@link atLocation}). Stage 3 made that a real
 *     FK with a write path behind it. It is emphatically NOT the member hop above:
 *     a visit is an event at a place, so it is attributed like an order, not like
 *     a membership.
 *   • PT sessions, trainer performance and discounts — GYM-WIDE, each for a reason
 *     its own docblock states. They ignore the parameter rather than guess.
 *
 * The three attributions are chosen per report, never mixed inside one figure: a
 * till's takings belong to the till, an arrival belongs to the door it came
 * through, a membership belongs to the member's own gym. All three partition the
 * gym exactly, so per-branch rows still add up to the gym-wide roll-up.
 *
 * A report that cannot honestly answer "which branch" returns the gym-wide figure
 * and says so in its own docblock. Inventing a proxy path would be worse than not
 * filtering: the console would show a confident number about the wrong population.
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
  async catalog(): Promise<ReportCatalogResponse> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    const { reports } = gymSettingsStoredSchema.parse(gym?.settings ?? {});

    // Fail OPEN: a report only disappears when its toggle is explicitly `false`.
    // If a report ever reached REPORT_CATALOG without a matching toggle, reading
    // `reports[key]` would be `undefined` — falsy — and a strict truthiness check
    // would silently drop that report from every gym's hub. This is a display
    // preference, so the friendlier failure is to keep showing it until someone
    // deliberately hides it.
    return {
      reports: REPORT_CATALOG.filter((report) => reports[report.key as ReportToggle] !== false),
    };
  }

  /** Run one report for on-screen preview — its columns plus the computed rows. */
  async runReport(key: ReportKey, query: ReportQuery): Promise<ReportResult> {
    const computed = await this.computeReport(key, query);
    return {
      key,
      name: computed.name,
      range: query.range,
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
  async *streamReportCsv(key: ReportKey, query: ReportQuery): AsyncGenerator<string> {
    const { columns, rows } = await this.computeReport(key, query);
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
  async buildReportXlsx(key: ReportKey, query: ReportQuery): Promise<Buffer> {
    const { name, columns, rows } = await this.computeReport(key, query);
    const headers = columns.map((column) => column.label);
    const cells = rows.map((row) => reportXlsxRow(columns, row));
    return buildReportWorkbook(name, headers, cells);
  }

  /* ---------------------------------------------------------------------- */
  /*  Computation                                                            */
  /* ---------------------------------------------------------------------- */

  /** Resolve a report to its columns, rows, and (for money reports) currency. */
  private async computeReport(key: ReportKey, query: ReportQuery): Promise<ComputedReport> {
    const definition = REPORT_DEFINITIONS[key];
    const win = resolveWindow(query.range);
    // The branch every figure is scoped to, or `undefined` for the gym-wide
    // roll-up across all of them. Only the reports whose rows have an honest path
    // to a `Location` take it. Since Stage 2 the member-backed ones do — through
    // `GymMember.locationId` — and since Stage 3 the check-in log does too, through
    // `CheckIn.locationId`. That leaves PT sessions, trainer performance and the
    // promotions report as the three that stay gym-wide however this is set. Each
    // says why in its own note.
    const { locationId } = query;

    switch (key) {
      /* ---- Sales -------------------------------------------------------- */
      case 'sales-summary': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesSummary(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'sales-by-payment-method': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesByPaymentMethod(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'plan-performance': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.planPerformance(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'sales-by-staff': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.salesByStaff(win, locationId),
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
          this.refundsDetail(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'pos-transaction-log': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.posTransactionLog(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }

      /* ---- Revenue ------------------------------------------------------- */
      case 'revenue-summary': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueSummary(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'revenue-by-location': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueByLocation(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'outstanding-invoices': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.outstandingInvoices(locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'projected-revenue': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.projectedRevenue(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'refunds-accounting': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.refundsAccounting(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'revenue-by-channel': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueByChannel(win, locationId),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      /* ---- Classes ------------------------------------------------------- */
      case 'attendance-by-class':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.attendanceByClass(win, locationId),
        };
      case 'class-utilization':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.classUtilization(win, locationId),
        };
      case 'class-cancellations':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.classCancellations(win, locationId),
        };
      case 'waitlist-demand':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.waitlistDemand(win, locationId),
        };
      case 'pt-sessions':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.ptSessions(win),
        };

      /* ---- Trainers & staff ---------------------------------------------- */
      case 'trainer-performance':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.trainerPerformance(win),
        };
      /* ---- Members ------------------------------------------------------- */
      case 'membership-movement':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.membershipMovement(win, locationId),
        };
      case 'retention-and-churn':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.retentionAndChurn(win, locationId),
        };
      case 'members-at-risk':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.membersAtRisk(locationId),
        };
      case 'expiring-memberships':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.expiringMemberships(win, locationId),
        };
      case 'member-roster':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.memberRoster(locationId),
        };
      case 'member-check-in-log':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.memberCheckInLog(win, locationId),
        };
      case 'upcoming-occasions':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.upcomingOccasions(win, locationId),
        };
      case 'no-show-rate':
        return {
          name: definition.name,
          currency: await this.resolveCurrency(),
          columns: definition.columns,
          rows: await this.noShowRate(win, locationId),
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
  private async salesSummary(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: win.start, lt: win.end },
          ...atLocation(locationId),
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const gross = emptyBuckets(win);
    const refunded = emptyBuckets(win);
    const orders = emptyBuckets(win);
    for (const payment of payments) {
      const key = bucketKey(payment.createdAt, win.bucket);
      if (gross.has(key)) {
        gross.set(key, (gross.get(key) ?? 0) + payment.amount);
        orders.set(key, (orders.get(key) ?? 0) + 1);
      }
    }
    for (const refund of refunds) {
      const key = bucketKey(refund.createdAt, win.bucket);
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
  private async salesByPaymentMethod(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const grouped = await this.prisma.client.payment.groupBy({
      by: ['method'],
      where: {
        status: PaymentStatus.CAPTURED,
        createdAt: { gte: win.start, lt: win.end },
        ...atLocation(locationId),
      },
      _sum: { amount: true, refundedAmount: true },
      _count: { _all: true },
    });

    return grouped
      .map((group) => {
        const gross = group._sum.amount ?? 0;
        const refunded = group._sum.refundedAmount ?? 0;
        return {
          method: PAYMENT_METHOD_LABEL[group.method] ?? group.method,
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
  private async planPerformance(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        packageId: { not: null },
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { status: PaymentStatus.CAPTURED } },
        ...atLocation(locationId),
      },
      select: { total: true, package: { select: { id: true, name: true } } },
    });

    const byPlan = new Map<string, { plan: string; orders: number; revenue: number }>();
    for (const order of orders) {
      if (!order.package) {
        continue;
      }
      const entry = byPlan.get(order.package.id) ?? {
        plan: order.package.name,
        orders: 0,
        revenue: 0,
      };
      entry.orders += 1;
      entry.revenue += order.total;
      byPlan.set(order.package.id, entry);
    }

    return [...byPlan.values()].sort(
      (a, b) => b.revenue - a.revenue || a.plan.localeCompare(b.plan),
    );
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
  private async salesByStaff(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { status: PaymentStatus.CAPTURED } },
        ...atLocation(locationId),
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
        staff: order.soldBy ? staffName(order.soldBy) : UNATTRIBUTED_SELLER,
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
   *
   * GYM-WIDE: this report ignores the branch filter, and Stage 2 does not change
   * that. {@link PromoRedemption} has no `locationId`, and its `orderId` is a
   * relation-less scalar (no `order` relation exists on the model) so there is
   * nothing to join a branch through — and half the ledger has no order at all:
   * `MarketingService.redeem` writes a redemption with `orderId` unset. Filtering
   * on the sale would silently drop those rows and understate what the gym gave
   * away.
   *
   * The member hop is available here — `PromoRedemption.member` is a real relation
   * — and is still refused, because on THIS model `memberId` is routinely null by
   * design: the schema's own comment says it is `null` for an anonymous walk-in
   * sale, and a promotion aimed at walk-ins is exactly the kind this report exists
   * to price. Attributing by member would drop that half of the ledger every time a
   * branch is selected. Roadmap Stage 7 gives campaigns and codes a branch of their
   * own; until then the honest answer is what the whole gym gave away.
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
  private async refundsDetail(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const refunds = await this.prisma.client.refund.findMany({
      where: { createdAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
      select: {
        createdAt: true,
        orderId: true,
        amount: true,
        reason: true,
        processedBy: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });

    return refunds.map((refund) => ({
      date: isoDate(refund.createdAt),
      order: shortId(refund.orderId),
      amount: refund.amount,
      reason: refund.reason,
      processedBy: refund.processedBy ? staffName(refund.processedBy) : UNATTRIBUTED_SELLER,
    }));
  }

  /**
   * Receipt-level till detail — one row per POS sale, newest first, with its lines
   * folded into a single readable cell.
   *
   * Scoped to `pos`-provider payments, the same test the order roster's POS filter
   * uses, so "what the till sold" means one thing across the console.
   */
  private async posTransactionLog(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        createdAt: { gte: win.start, lt: win.end },
        payment: { is: { provider: POS_PROVIDER } },
        ...atLocation(locationId),
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
      date: isoDate(order.createdAt),
      time: clockTime(order.createdAt),
      order: shortId(order.id),
      items: order.items.map((item) => item.label).join(', '),
      method: order.payment ? (PAYMENT_METHOD_LABEL[order.payment.method] ?? '') : '',
      total: order.total,
      staff: order.soldBy ? staffName(order.soldBy) : UNATTRIBUTED_SELLER,
    }));
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
   *
   * FULLY BRANCH-AWARE since Stage 2, under the two attributions this catalogue
   * uses — and the FLOW and the STOCKS take different ones, which is the thing to
   * understand before reading a row.
   *
   * The flow follows the TILL: captured money belongs to the drawer it went into,
   * so `revenue` is what this branch rang up — read off `Payment.locationId` /
   * `Refund.locationId`, frozen at write time by Stage 5. The stocks follow the
   * MEMBER's HOME BRANCH, LIVE: `Subscription` carries no `locationId` and is not
   * getting one, because a transferring member's recurring revenue follows them by
   * product decision, so `mrr` / `activeMembers` / `arpm` are the recurring base of
   * the people this branch looks after RIGHT NOW. Both partition the gym — one
   * payment has one branch, one member has one home branch — so the branches still
   * add back up to the gym-wide report with nothing counted twice.
   *
   * That the two halves of one row are frozen and live respectively is the point,
   * not a defect: a member who transfers mid-window takes their `mrr` to the new
   * branch immediately while the `revenue` they already paid stays with the branch
   * that took it. Money already taken stays where it was taken; the recurring base
   * follows the person.
   *
   * **This reverses the interim behaviour.** Until Stage 2 the three subscription
   * columns returned `null` under a branch filter, because printing the gym-wide
   * MRR beside one branch's revenue would have read as that branch's recurring
   * base. They now return real per-branch figures, and `null` in those columns goes
   * back to meaning only what it means gym-wide: `arpm` with no members to divide
   * by. The console no longer has an empty cell to caption.
   */
  private async revenueSummary(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const [payments, refunds, subscriptions] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: win.start, lt: win.end },
          ...atLocation(locationId),
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
        select: { amount: true, createdAt: true },
      }),
      // Narrowed by the MEMBER's home branch, not by the order the payments above
      // followed — a recurring membership is not sold at a till. `memberId` is NOT
      // NULL on `Subscription`, so the hop is a plain equality and loses no row.
      this.prisma.client.subscription.findMany({
        where: memberAtLocation(locationId),
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

    const revenue = emptyBuckets(win);
    for (const payment of payments) {
      const key = bucketKey(payment.createdAt, win.bucket);
      if (revenue.has(key)) {
        revenue.set(key, (revenue.get(key) ?? 0) + payment.amount);
      }
    }
    for (const refund of refunds) {
      const key = bucketKey(refund.createdAt, win.bucket);
      if (revenue.has(key)) {
        revenue.set(key, (revenue.get(key) ?? 0) - refund.amount);
      }
    }

    return [...revenue.entries()].map(([period, netRevenue]) => {
      const at = bucketEnd(period, win.bucket);
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
   *
   * This is the one report whose SUBJECT is the branch axis, so a branch filter
   * makes it a breakdown of one thing. It still applies the filter, and the report
   * degrades to a SINGLE ROW — the selected branch's own takings. That is a clean
   * result rather than a special case: {@link ReportResult} fixes the columns, not
   * the row count, and the CSV/XLSX exports of a one-row table are as valid as of a
   * five-row one. The alternative — ignoring the filter here — would put a table
   * naming every other branch on a screen the operator has scoped to one, and its
   * total would disagree with every neighbouring report. The console hides the
   * card in single-branch mode (Stage 1); the API stays honest either way.
   */
  private async revenueByLocation(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const payments = await this.prisma.client.payment.findMany({
      where: {
        status: PaymentStatus.CAPTURED,
        createdAt: { gte: win.start, lt: win.end },
        ...atLocation(locationId),
      },
      select: {
        amount: true,
        refundedAmount: true,
        // The payment's OWN branch since Stage 5, not `order.location`. The `where`
        // above and this label must come from one column, or a row could be
        // selected by one branch and printed under another.
        location: { select: { name: true } },
      },
    });

    const byLocation = new Map<string, { orders: number; gross: number; refunded: number }>();
    for (const payment of payments) {
      // Expected to be unreachable: the Stage 5 migration backfilled every payment
      // from its order and the write paths stamp one, so a captured payment should
      // always reach a named branch. Kept as a safety net rather than deleted — a
      // row that slips through (a branch retired out from under it, `onDelete:
      // SetNull`) must still be COUNTED UNDER ITS OWN LABEL, or these rows would
      // stop adding up to the gym's own total. It is never folded into a named
      // branch: NULL means "not attributable", not "the default branch".
      // When a branch IS selected the bucket cannot be reached at all: the filter
      // is an equality on a real id, so every surviving payment has that branch.
      const name = payment.location?.name ?? NO_LOCATION_LABEL;
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
   *
   * BRANCH-AWARE through the MEMBER who owed it when it was raised — and that is a
   * choice, not the only available path. This set MIXES the two kinds: an
   * order-backed invoice could be attributed through `order.locationId`, a
   * subscription one could not (`Invoice.orderId` is NULLABLE and recurring billing
   * leaves it null). Attributing each kind by whichever path it happens to have
   * would make the column's definition change from row to row and the total mean
   * nothing.
   *
   * So one rule covers every invoice: the debt belongs to the branch its member
   * called home at issue time. The report then answers "what do the members we look
   * after still owe", which is also the order somebody working the phones wants it
   * in.
   *
   * **Stage 5 reads that off `Invoice.locationId` instead of hopping through
   * `member`, which freezes it — deliberately.** Under the live hop, transferring
   * one member moved every debt they had ever been billed onto the new branch,
   * including invoices raised months before the move; the branch that did the work
   * and is chasing the money would watch it leave its own report. The snapshot ends
   * that. Only invoices raised AFTER a transfer land at the new branch.
   *
   * The only rows a branch filter drops are those with no branch to match: an
   * invoice whose member was hard-deleted (`Invoice.memberId` goes null by
   * `SetNull` on purge, which is why the column is nullable at all) or whose member
   * had no home branch. Both stay in the gym-wide roll-up. A NULL is never read as
   * the default branch.
   */
  private async outstandingInvoices(locationId?: string): Promise<ReportRow[]> {
    const invoices = await this.prisma.client.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.FAILED] },
        ...atLocation(locationId),
      },
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
      member: invoice.member ? memberName(invoice.member) : UNKNOWN_MEMBER_LABEL,
      amount: invoice.amount,
      dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
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
   *
   * BRANCH-AWARE since Stage 2, through the member's HOME BRANCH.
   * {@link Subscription} still has no `locationId` of its own, but the
   * {@link GymMember} behind it now does, and `memberId` is NOT NULL — so a
   * renewal is attributed to the branch whose member is due to pay it. Same rule as
   * the `revenue-summary` stocks and the dashboard's MRR, so the projection and the
   * base it projects from are about the same people.
   */
  private async projectedRevenue(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const now = new Date();
    const forward = forwardWindow(win, now);
    const subscriptions = await this.prisma.client.subscription.findMany({
      where: {
        status: { in: [...LIVE_SUB_STATUSES] },
        currentPeriodEnd: { gte: now, lt: forward.end },
        ...memberAtLocation(locationId),
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
  private async refundsAccounting(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const [payments, refunds] = await Promise.all([
      this.prisma.client.payment.findMany({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: win.start, lt: win.end },
          ...atLocation(locationId),
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.client.refund.findMany({
        where: { createdAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
        select: { amount: true, createdAt: true },
      }),
    ]);

    const gross = emptyBuckets(win);
    for (const payment of payments) {
      const key = bucketKey(payment.createdAt, win.bucket);
      if (gross.has(key)) {
        gross.set(key, (gross.get(key) ?? 0) + payment.amount);
      }
    }
    const refunded = emptyBuckets(win);
    const counts = emptyBuckets(win);
    for (const refund of refunds) {
      const key = bucketKey(refund.createdAt, win.bucket);
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
  private async revenueByChannel(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const grouped = await this.prisma.client.payment.groupBy({
      by: ['provider'],
      where: {
        status: PaymentStatus.CAPTURED,
        createdAt: { gte: win.start, lt: win.end },
        ...atLocation(locationId),
      },
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
  private async attendanceByClass(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [...CONFIRMED_BOOKING_STATUSES] },
        classInstance: { startsAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
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
        title: inst.template?.title ?? inst.classType?.name ?? 'Class',
        trainer: inst.template?.trainer?.name ?? inst.trainer?.name ?? UNASSIGNED_TRAINER,
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
  private async classUtilization(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const instances = await this.prisma.client.classInstance.findMany({
      where: {
        startsAt: { gte: win.start, lt: win.end },
        status: { not: InstanceStatus.CANCELED },
        ...atLocation(locationId),
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
        title: instance.template?.title ?? instance.classType?.name ?? 'Class',
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
  private async classCancellations(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
        classInstance: { startsAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
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
        date: isoDate(inst.startsAt),
        time: clockTime(inst.startsAt),
        class: inst.template?.title ?? inst.classType?.name ?? 'Class',
        member: booking.member ? memberName(booking.member) : UNKNOWN_MEMBER_LABEL,
        outcome: booking.status === BookingStatus.NO_SHOW ? 'No-show' : 'Cancelled',
        trainer: inst.template?.trainer?.name ?? inst.trainer?.name ?? UNASSIGNED_TRAINER,
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
  private async waitlistDemand(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const instances = await this.prisma.client.classInstance.findMany({
      where: {
        startsAt: { gte: win.start, lt: win.end },
        status: { not: InstanceStatus.CANCELED },
        ...atLocation(locationId),
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
        title: instance.template?.title ?? instance.classType?.name ?? 'Class',
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
   *
   * GYM-WIDE: this report ignores the branch filter. {@link PtSession} carries no
   * `locationId` and no relation that reaches one — a PT hour is booked against a
   * trainer and a time, never a branch (roadmap Stage 6).
   */
  private async ptSessions(win: ReportWindow): Promise<ReportRow[]> {
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
        name: session.trainer?.name ?? UNASSIGNED_TRAINER,
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
  /*
   * EVERY report in this segment is now BRANCH-AWARE, and all but one narrow the
   * same way: {@link GymMember}'s own `locationId` — the member's HOME BRANCH,
   * added in Stage 2 — either directly or through `Subscription.member`.
   *
   * That the column is a home branch rather than an activity trail is the whole
   * point. The two proxies this segment used to warn against, "the branch of their
   * last check-in" and "the branch they last bought at", are still both derivable
   * and still both wrong: they would move a member between branches on one visit or
   * one purchase, and a headcount that changes when somebody drops in elsewhere is
   * worse than one that is honestly not split. A home branch moves when an operator
   * moves it, which is what makes a roster, a cohort and a churn rate reconcilable
   * with each other and, summed, with the gym.
   *
   * {@link memberCheckInLog} is the one exception, and it narrows the OTHER way:
   * its rows are VISITS, not members, and a visit happens at a place. Stage 3 gave
   * it a place of its own to name — `CheckIn.locationId`, the door that arrival
   * came through — so it reads that column and never the visitor's home branch.
   * Both rules partition the gym, so the two live side by side in one segment
   * without a figure being counted twice; they simply answer different questions.
   * See its own note.
   */

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
   *
   * BRANCH-AWARE by home branch on BOTH halves — signups off `GymMember.locationId`,
   * cancellations through `Subscription.member`. Narrowing only one of them would
   * make `netChange` a subtraction across two populations, which is the specific
   * error the register warned about.
   */
  private async membershipMovement(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const [members, subscriptions] = await Promise.all([
      this.prisma.client.gymMember.findMany({
        where: { role: Role.MEMBER, joinedAt: { lt: win.end }, ...atLocation(locationId) },
        select: { joinedAt: true },
      }),
      this.prisma.client.subscription.findMany({
        where: memberAtLocation(locationId),
        select: { status: true, canceledAt: true, updatedAt: true },
      }),
    ]);

    const joined = emptyBuckets(win);
    let baseline = 0;
    for (const member of members) {
      if (member.joinedAt < win.start) {
        baseline += 1;
        continue;
      }
      const key = bucketKey(member.joinedAt, win.bucket);
      if (joined.has(key)) {
        joined.set(key, (joined.get(key) ?? 0) + 1);
      }
    }

    const cancelled = emptyBuckets(win);
    for (const sub of subscriptions) {
      const at = churnMoment(sub);
      if (!at || at < win.start || at >= win.end) {
        continue;
      }
      const key = bucketKey(at, win.bucket);
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
   *
   * BRANCH-AWARE through `Subscription.member` — the cohort and the losses come out
   * of one read, so both sides of every rate are the same branch's members by
   * construction. A member moved between branches moves whole; a branch's churn is
   * never inflated by somebody who merely trained elsewhere for a month.
   */
  private async retentionAndChurn(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const subscriptions = await this.prisma.client.subscription.findMany({
      where: memberAtLocation(locationId),
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

    const buckets = emptyBuckets(win);
    for (const { at } of churnedAt) {
      if (!at || at < win.start || at >= win.end) {
        continue;
      }
      const key = bucketKey(at, win.bucket);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }

    return [...buckets.entries()].map(([period, churned]) => {
      // The window closes at the END of the bucket's own span, so the rate covers
      // the period rather than stopping at its first instant.
      const end = bucketEnd(period, win.bucket);
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
   *
   * BRANCH-AWARE on the MEMBER, and only on the member. `lastVisit` still reads
   * every check-in that member made, wherever they made it — filtering their visits
   * to the selected branch would put somebody on the call list for training at the
   * gym's other site, which is the opposite of what the list is for. The row asks
   * "is this member of ours still coming in at all", and the answer is not a
   * per-branch quantity.
   *
   * Stage 3 sharpened that from a statement about missing data into a real choice:
   * `CheckIn.locationId` is written now, so the nested `checkIns` below CAN be
   * narrowed and deliberately is not. This is the one report where doing so would
   * change who appears in the output rather than merely what a cell says — a
   * cross-branch regular would be manufactured into a churn risk.
   */
  private async membersAtRisk(locationId?: string): Promise<ReportRow[]> {
    const cutoff = new Date(Date.now() - AT_RISK_DAYS * DAY_MS);
    const members = await this.prisma.client.gymMember.findMany({
      where: {
        role: Role.MEMBER,
        deletedAt: null,
        subscriptions: { some: { status: { in: [...LIVE_SUB_STATUSES] } } },
        ...atLocation(locationId),
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
            member: memberName(member),
            plan: member.subscriptions[0]?.plan?.name ?? NO_PLAN_LABEL,
            lastVisit: last ? isoDate(last) : null,
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
   *
   * BRANCH-AWARE through `Subscription.member` — the renewals this branch's staff
   * are the ones to chase. Same rule and same read shape as `projected-revenue`, so
   * the count of expiries and the money they represent agree.
   */
  private async expiringMemberships(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const now = new Date();
    const until = new Date(now.getTime() + (win.end.getTime() - win.start.getTime()));
    const subscriptions = await this.prisma.client.subscription.findMany({
      where: {
        status: { in: [...LIVE_SUB_STATUSES] },
        currentPeriodEnd: { gte: now, lt: until },
        ...memberAtLocation(locationId),
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
      member: sub.member ? memberName(sub.member) : UNKNOWN_MEMBER_LABEL,
      plan: sub.plan?.name ?? NO_PLAN_LABEL,
      expiresOn: isoDate(sub.currentPeriodEnd),
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
   *
   * BRANCH-AWARE on `GymMember.locationId`, the same equality the console's
   * `/members` roster applies (`members.service.ts`) — this report is that screen's
   * export-everything twin, and the two listing different people under one branch
   * selection would be the worst kind of disagreement.
   *
   * On the MEMBER only, and Stage 3 made that worth spelling out. `CheckIn` now
   * carries a real branch, so the nested `checkIns` below LOOKS filterable and must
   * not be filtered: `lastVisit` answers "is this member of ours still coming in at
   * all", and narrowing it to the selected branch would print "never visited"
   * against somebody who trains at the gym's other site twice a week. Same rule as
   * {@link membersAtRisk}, which states it at length — the row is selected by
   * branch, the member's activity inside it is not.
   */
  private async memberRoster(locationId?: string): Promise<ReportRow[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, deletedAt: null, ...atLocation(locationId) },
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
      member: memberName(member),
      status: member.status,
      plan: member.subscriptions[0]?.plan?.name ?? NO_PLAN_LABEL,
      joined: isoDate(member.joinedAt),
      lastVisit: member.checkIns[0] ? isoDate(member.checkIns[0].checkedInAt) : null,
      email: member.user.email,
    }));
  }

  /**
   * Every visit in the window, newest first.
   *
   * BRANCH-AWARE on `CheckIn.locationId` — the branch the member physically WALKED
   * INTO for that one arrival. Stage 3 promoted that column from a dangling scalar
   * to a real {@link Location} FK, indexed `(gymId, locationId, checkedInAt)`,
   * backfilled every historic NULL onto the gym's default branch and made
   * `POST /admin/check-ins` require a branch (falling back to the default when the
   * caller omits one), so no arrival lands here branchless any more.
   *
   * That is what unblocked this report, and it matters WHICH path unblocked it.
   * The docblock this replaces argued the filter had to stay off because nothing
   * ever wrote the column — true then, false now. It also argued, and this half
   * still stands, that the member hop Stage 2 opened for the rest of this segment
   * would have been the WRONG fix: a row here is a VISIT, and a visit happened
   * somewhere. Selecting the visits of members homed at branch A would return a log
   * whose own `location` column named branch B — a table contradicting itself in
   * two adjacent cells. A home branch answers "whose member is this"; it does not
   * answer "where did they train on Tuesday", and this report only asks the second
   * question. So the filter here is {@link atLocation} on the visit's own column,
   * never {@link memberAtLocation} — and the `location` column beside it now proves
   * that on screen, because both read the same relation.
   *
   * `gymId` is pinned explicitly below. Stage 3 added {@link CheckIn} to the tenant
   * extension's model set, so that pin is now redundant rather than load-bearing;
   * it stays as belt and braces on the one query in this file that would leak
   * another gym's visits if the allowlist ever lost it again — which is exactly
   * what had happened.
   */
  private async memberCheckInLog(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    // The branch name comes off the `location` relation Stage 3 added. Before it
    // there was no relation to follow, so this loaded every one of the gym's
    // locations and joined id → name in memory; the relation makes that second
    // query and its "id we cannot resolve" fallback both unnecessary, since the FK
    // now guarantees the id names a live location of this tenant or is NULL.
    const checkIns = await this.prisma.client.checkIn.findMany({
      where: {
        gymId: this.tenant.gymId,
        checkedInAt: { gte: win.start, lt: win.end },
        ...atLocation(locationId),
      },
      select: {
        checkedInAt: true,
        method: true,
        location: { select: { name: true } },
        member: {
          select: { firstName: true, lastName: true, user: { select: { name: true } } },
        },
      },
      orderBy: { checkedInAt: 'desc' },
      take: DETAIL_ROW_LIMIT,
    });

    return checkIns.map((checkIn) => ({
      date: isoDate(checkIn.checkedInAt),
      time: clockTime(checkIn.checkedInAt),
      member: checkIn.member ? memberName(checkIn.member) : UNKNOWN_MEMBER_LABEL,
      method: checkIn.method,
      // Empty rather than a placeholder branch: `location` is `SetNull`, so a row
      // whose branch was deleted keeps the visit and loses only the name.
      location: checkIn.location?.name ?? '',
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
   *
   * BRANCH-AWARE on `GymMember.locationId` — a retention call is made by the branch
   * that knows the member, so the list is the one that branch's reception works.
   */
  private async upcomingOccasions(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const now = new Date();
    const until = new Date(now.getTime() + (win.end.getTime() - win.start.getTime()));
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, deletedAt: null, ...atLocation(locationId) },
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
      const name = memberName(member);
      const phone = member.user.phone ?? '';
      const occasions: Array<{ label: string; from: Date }> = [
        { label: 'Anniversary', from: member.joinedAt },
      ];
      if (member.dateOfBirth) {
        occasions.push({ label: 'Birthday', from: member.dateOfBirth });
      }
      for (const occasion of occasions) {
        const next = nextAnniversary(occasion.from, now);
        if (next >= now && next < until) {
          rows.push({
            at: next,
            row: {
              member: name,
              occasion: occasion.label,
              date: isoDate(next),
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
   *
   * GYM-WIDE: this report ignores the branch filter, even though half of it could
   * take one. {@link ClassInstance} carries a `locationId`; {@link PtSession} does
   * not (roadmap Stage 6). Filtering only the half that can be filtered would put
   * one branch's classes beside every branch's PT hours in a single row — and the
   * ranking adds the two columns together, so the order of the whole table would
   * be computed from two different populations. A report whose row mixes scopes is
   * worse than one that is honestly gym-wide, so both halves stay whole.
   */
  private async trainerPerformance(win: ReportWindow): Promise<ReportRow[]> {
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
        instance.template?.trainer?.name ?? instance.trainer?.name ?? UNASSIGNED_TRAINER,
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
      const entry = entryFor(key, session.trainer?.name ?? UNASSIGNED_TRAINER);
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
  private async noShowRate(win: ReportWindow, locationId?: string): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [BookingStatus.ATTENDED, BookingStatus.NO_SHOW] },
        classInstance: { startsAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
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
        name: inst.template?.trainer?.name ?? inst.trainer?.name ?? UNASSIGNED_TRAINER,
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

/** Display label + grouping key for bookings on a class with no assigned trainer. */
const UNASSIGNED_TRAINER = 'Unassigned';
const UNASSIGNED_KEY = '__unassigned__';

/** Display label + grouping key for a sale or refund with no staff member behind it. */
const UNATTRIBUTED_SELLER = 'Unattributed';
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

/** Human labels for the settlement methods the till records. */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MEMBER_ACCOUNT: 'Member account',
};

/**
 * A staff member's display name. Staff rows carry a split first/last name of their
 * own (the roster's columns); an invited or plain membership has neither, and the
 * cross-gym `User` name is the fallback.
 */
function staffName(staff: {
  firstName?: string | null;
  lastName?: string | null;
  user?: { name: string | null } | null;
}): string {
  const split = [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim();
  return split || staff.user?.name?.trim() || UNATTRIBUTED_SELLER;
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

/** Label for a member with no live subscription behind them. */
const NO_PLAN_LABEL = 'No plan';
/** Bucket for takings on an order that never recorded a branch. */
const NO_LOCATION_LABEL = 'No location';

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
  };
}
/** Label for a row whose member row was detached (a purged membership). */
const UNKNOWN_MEMBER_LABEL = 'Unknown';

/**
 * A member's display name. The gym's own split first/last name wins — it is what
 * the roster shows and what staff edited — with the cross-gym `User` name as the
 * fallback for a membership that never captured one.
 */
function memberName(member: {
  firstName?: string | null;
  lastName?: string | null;
  user?: { name: string | null } | null;
}): string {
  const split = [member.firstName, member.lastName].filter(Boolean).join(' ').trim();
  return split || member.user?.name?.trim() || UNKNOWN_MEMBER_LABEL;
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

/** The exclusive end of the bucket a `YYYY-MM-DD` key opens (UTC). */
function bucketEnd(key: string, bucket: 'day' | 'week' | 'month'): Date {
  const start = new Date(`${key}T00:00:00.000Z`);
  if (bucket === 'month') {
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  }
  return new Date(start.getTime() + (bucket === 'week' ? 7 : 1) * DAY_MS);
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
