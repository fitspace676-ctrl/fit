import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod as DbPaymentMethod, PaymentStatus } from '@fit/db';
import {
  buildReconciliationReport,
  gymSettingsStoredSchema,
  type CashReconciliationQuery,
  type CashReconciliationReport,
  type PaymentMethod,
  type RecordPosSaleInput,
  type RecordPosSaleResponse,
  type ReconciliationTally,
  type SendReceiptInput,
  type SendReceiptResponse,
} from '@fit/types';
import { EmailService } from '../auth/email.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** Map the wire settlement method to the persisted Prisma enum. */
const TO_DB_METHOD: Record<PaymentMethod, DbPaymentMethod> = {
  cash: DbPaymentMethod.CASH,
  card: DbPaymentMethod.CARD,
  member_account: DbPaymentMethod.MEMBER_ACCOUNT,
};

/** Map the persisted Prisma enum back to the wire settlement method. */
const TO_WIRE_METHOD: Record<DbPaymentMethod, PaymentMethod> = {
  [DbPaymentMethod.CASH]: 'cash',
  [DbPaymentMethod.CARD]: 'card',
  [DbPaymentMethod.MEMBER_ACCOUNT]: 'member_account',
};

/**
 * Orders — the POS sale's server-side concerns (T7.4 email receipts; T7.5 sale
 * persistence + end-of-day reconciliation).
 *
 * A completed in-person sale (settled in the admin POS client, T7.3) is persisted
 * here as a `PAID` {@link Order} with its priced lines and one `CAPTURED`
 * {@link Payment} stamped with the settlement method, so the day's takings exist
 * to reconcile. The reconciliation then aggregates those captured payments for one
 * business day (in the gym's own timezone) grouped by method. The gym name / locale
 * are resolved here from the request's own tenant, never trusted from the client.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly email: EmailService,
    private readonly tenant: TenantContext,
    private readonly prisma: TenantPrismaService,
  ) {}

  /**
   * Email the receipt for a completed POS sale. Resolves the gym name for the copy,
   * then delegates delivery to {@link EmailService.sendReceiptEmail}. Returns
   * `{ delivered: false }` (rather than throwing) when email delivery is
   * unconfigured, so an unconfigured dev / CI environment still completes the call.
   */
  async sendReceipt(input: SendReceiptInput): Promise<SendReceiptResponse> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: this.tenant.gymId },
      select: { name: true },
    });

    const delivered = await this.email.sendReceiptEmail(
      input.email,
      input.receipt,
      gym?.name ?? undefined,
    );

    return { delivered };
  }

  /**
   * Persist a completed POS sale as a `PAID` order (with its priced lines) and a
   * single `CAPTURED` payment carrying the settlement method. The order + its lines
   * + the payment are written in one nested create (a single transaction), so a
   * partial sale can never land. A `member_account` sale must name the member whose
   * account is charged. Tenant scoping stamps the order's `gymId` automatically;
   * the nested payment's `gymId` is set explicitly from the request's tenant, since
   * the extension does not reach into nested writes.
   */
  async recordSale(input: RecordPosSaleInput): Promise<RecordPosSaleResponse> {
    const gymId = this.tenant.gymId;
    if (!gymId) {
      throw new ForbiddenException('Tenant scope is required to record a sale');
    }

    const { receipt, memberId } = input;
    if (receipt.paymentMethod === 'member_account' && !memberId) {
      throw new BadRequestException('A member-account sale must be attached to a member');
    }

    // The order, its lines, and the payment are written in one transaction so a
    // partial sale can never land. `gymId` is stamped by the tenant extension at
    // runtime and passed explicitly here to satisfy the create input's static type
    // (mirroring the other tenant-scoped writes).
    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gymId,
          total: receipt.total,
          currency: receipt.currency,
          status: OrderStatus.PAID,
          memberId: memberId ?? null,
          customerName: receipt.memberName ?? null,
          items: {
            create: receipt.items.map((line) => ({
              label: line.quantity > 1 ? `${line.name} ×${line.quantity}` : line.name,
              amount: line.amount,
            })),
          },
        },
        select: { id: true },
      });

      const payment = await tx.payment.create({
        data: {
          gymId,
          orderId: order.id,
          amount: receipt.total,
          currency: receipt.currency,
          status: PaymentStatus.CAPTURED,
          method: TO_DB_METHOD[receipt.paymentMethod],
          // Cash / card-at-desk / member-account settlements never flow through a
          // payment provider; mark the channel so it is distinct from the online
          // wizard's `"stub"` charges (T8.8 replaces stub with a real gateway).
          provider: 'pos',
        },
        select: { id: true },
      });

      return { orderId: order.id, paymentId: payment.id };
    });
  }

  /**
   * End-of-day cash reconciliation for one business day. Resolves the day's UTC
   * window from the date and the gym's configured timezone, aggregates the gym's
   * `CAPTURED` payments in that window grouped by settlement method, and folds the
   * tallies into the report (every method present, `expectedCash` = the cash
   * total). The report currency comes from the gym's locale settings.
   */
  async reconcile(query: CashReconciliationQuery): Promise<CashReconciliationReport> {
    const gym = await this.prisma.client.gym.findUnique({
      where: { id: this.tenant.gymId },
      select: { settings: true },
    });
    const { locale } = gymSettingsStoredSchema.parse(gym?.settings ?? {});
    const { gte, lt } = utcDayRange(query.date, locale.timezone);

    const grouped = await this.prisma.client.payment.groupBy({
      by: ['method'],
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte, lt } },
      _sum: { amount: true },
      _count: { _all: true },
    });

    const tallies: ReconciliationTally[] = grouped.map((row) => ({
      method: TO_WIRE_METHOD[row.method],
      count: row._count._all,
      total: row._sum.amount ?? 0,
    }));

    return buildReconciliationReport(tallies, {
      date: query.date,
      currency: locale.currency,
      generatedAt: new Date().toISOString(),
    });
  }
}

/**
 * The `[start, end)` UTC instants bounding the calendar day `date` (`YYYY-MM-DD`)
 * in IANA `timeZone`. Pure and dependency-free (no date library): the day starts
 * at local midnight and ends at the next day's local midnight, each resolved to an
 * absolute UTC instant via the zone's offset — so a query for a gym in
 * `Asia/Tbilisi` covers that gym's actual business day, not a UTC one. DST-correct
 * at the boundary because the offset is recomputed once at the resolved instant.
 */
export function utcDayRange(date: string, timeZone: string): { gte: Date; lt: Date } {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const gte = zonedMidnightUtc(year, month, day, timeZone);
  // Date.UTC normalises a month/year rollover (e.g. day 31 + 1 → the 1st).
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const lt = zonedMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { gte, lt };
}

/** The UTC instant of local midnight for `year-month-day` in `timeZone`. */
function zonedMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = timeZoneOffsetMs(wallAsUtc, timeZone);
  let utc = wallAsUtc - offset;
  // Re-resolve once: across a DST transition the offset at the guessed instant can
  // differ from the offset at midnight itself.
  const corrected = timeZoneOffsetMs(utc, timeZone);
  if (corrected !== offset) {
    utc = wallAsUtc - corrected;
  }
  return new Date(utc);
}

/**
 * Offset (ms) of `timeZone` at the instant `epochMs`, such that
 * `wallClockAsUtc - epochMs = offset`. Read from `Intl.DateTimeFormat` parts so no
 * timezone database is bundled.
 */
function timeZoneOffsetMs(epochMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epochMs));
  const field = new Map<string, number>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      field.set(part.type, Number(part.value));
    }
  }
  const at = (key: string): number => field.get(key) ?? 0;
  const wallAsUtc = Date.UTC(
    at('year'),
    at('month') - 1,
    at('day'),
    at('hour'),
    at('minute'),
    at('second'),
  );
  return wallAsUtc - epochMs;
}
