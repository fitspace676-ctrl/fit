import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Role } from '@fit/db';
import {
  deriveOrderChannel,
  REPORT_DEFINITIONS,
  reportCsvRow,
  reportXlsxRow,
  type OrderChannel,
  type ReportColumn,
  type ReportKey,
  type ReportQuery,
  type ReportResult,
  type ReportRow,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { buildReportWorkbook } from './xlsx';
import {
  bucketKey,
  DEFAULT_CURRENCY,
  emptyBuckets,
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
 * Each report is a REAL aggregation over rows that already exist:
 *   • revenue-by-channel  — captured {@link Payment} rows, split by derived channel.
 *   • attendance-by-class — {@link Booking} ATTENDED/NO_SHOW on in-window instances.
 *   • membership-growth   — {@link GymMember} `joinedAt` bucketed across the window.
 *   • no-show-rate        — the same bookings grouped by the class's trainer.
 *
 * The service produces {@link ReportRow}s keyed by the columns declared in
 * {@link REPORT_DEFINITIONS}; the CSV stream and the XLSX writer read those same
 * columns, so the on-screen table and both downloads never drift.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: TenantPrismaService) {}

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

    switch (key) {
      case 'revenue-by-channel': {
        const [currency, rows] = await Promise.all([
          this.resolveCurrency(),
          this.revenueByChannel(win),
        ]);
        return { name: definition.name, currency, columns: definition.columns, rows };
      }
      case 'attendance-by-class':
        return {
          name: definition.name,
          currency: DEFAULT_CURRENCY,
          columns: definition.columns,
          rows: await this.attendanceByClass(win),
        };
      case 'membership-growth':
        return {
          name: definition.name,
          currency: DEFAULT_CURRENCY,
          columns: definition.columns,
          rows: await this.membershipGrowth(win),
        };
      case 'no-show-rate':
        return {
          name: definition.name,
          currency: DEFAULT_CURRENCY,
          columns: definition.columns,
          rows: await this.noShowRate(win),
        };
    }
  }

  /**
   * The gym's reporting currency — read from the most recent captured payment (the
   * real currency money changed hands in), falling back to the schema default when
   * the gym has taken no payments yet, mirroring {@link AnalyticsService}.
   */
  private async resolveCurrency(): Promise<string> {
    const latest = await this.prisma.client.payment.findFirst({
      where: { status: PaymentStatus.CAPTURED },
      orderBy: { createdAt: 'desc' },
      select: { currency: true },
    });
    return latest?.currency ?? DEFAULT_CURRENCY;
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

  /**
   * Attended vs no-show bookings per class template over instances that started in
   * the window. Fetches the completed (ATTENDED / NO_SHOW) bookings with their
   * template title + trainer name once — Prisma `groupBy` can't reach a relation's
   * scalar, the same reason {@link AnalyticsService.topClasses} uses `findMany` —
   * then tallies in memory. `attendanceRate` is attended / (attended + no-show) as
   * a 0–100 percentage, `null` when the class had no completed bookings.
   */
  private async attendanceByClass(win: ReportWindow): Promise<ReportRow[]> {
    const bookings = await this.prisma.client.booking.findMany({
      where: {
        status: { in: [BookingStatus.ATTENDED, BookingStatus.NO_SHOW] },
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
      { title: string; trainer: string; attended: number; noShow: number }
    >();
    for (const booking of bookings) {
      const inst = booking.classInstance;
      // Group by the template (a generated occurrence) or the type (one scheduled
      // straight from a type); resolve the title / trainer from whichever backs it.
      const key = inst.template?.id ?? inst.classType?.id ?? 'unknown';
      const entry = byClass.get(key) ?? {
        title: inst.template?.title ?? inst.classType?.name ?? 'Class',
        trainer: inst.template?.trainer?.name ?? inst.trainer?.name ?? UNASSIGNED_TRAINER,
        attended: 0,
        noShow: 0,
      };
      if (booking.status === BookingStatus.ATTENDED) {
        entry.attended += 1;
      } else {
        entry.noShow += 1;
      }
      byClass.set(key, entry);
    }

    return [...byClass.values()]
      .map((entry) => {
        const completed = entry.attended + entry.noShow;
        return {
          class: entry.title,
          trainer: entry.trainer,
          attended: entry.attended,
          noShow: entry.noShow,
          attendanceRate: completed === 0 ? null : rate(entry.attended, completed),
        };
      })
      .sort(
        (a, b) => b.attended + b.noShow - (a.attended + a.noShow) || a.class.localeCompare(b.class),
      );
  }

  /**
   * New members per bucket across the window, with the running cumulative total.
   * Fetches every member's `joinedAt` up to the window end once, seeds the
   * cumulative from those who joined before the window (the pre-window baseline),
   * then walks the dense, gap-filled buckets so periods with no signups still
   * appear. Only `MEMBER`-role rows count.
   */
  private async membershipGrowth(win: ReportWindow): Promise<ReportRow[]> {
    const members = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, joinedAt: { lt: win.end } },
      select: { joinedAt: true },
    });

    const buckets = emptyBuckets(win);
    let baseline = 0;
    for (const member of members) {
      if (member.joinedAt < win.start) {
        baseline += 1;
        continue;
      }
      const key = bucketKey(member.joinedAt, win.bucket);
      const current = buckets.get(key);
      if (current !== undefined) {
        buckets.set(key, current + 1);
      }
    }

    let cumulative = baseline;
    return [...buckets.entries()].map(([period, newMembers]) => {
      cumulative += newMembers;
      return { period, newMembers, cumulativeMembers: cumulative };
    });
  }

  /**
   * No-show rate per trainer over the window's completed bookings — the same
   * ATTENDED / NO_SHOW bookings as {@link attendanceByClass}, grouped by the class
   * template's trainer instead of the class. `noShowRate` is no-shows / completed
   * as a 0–100 percentage; a class with no assigned trainer rolls up under
   * "Unassigned". Ranked worst-first so the problem trainers surface at the top.
   */
  private async noShowRate(win: ReportWindow): Promise<ReportRow[]> {
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

/** Display label + grouping key for bookings on a class with no assigned trainer. */
const UNASSIGNED_TRAINER = 'Unassigned';
const UNASSIGNED_KEY = '__unassigned__';

/** Escape one CSV field (RFC 4180) — quote + double embedded quotes when needed. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
