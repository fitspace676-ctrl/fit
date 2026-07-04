import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod as DbPaymentMethod, PaymentStatus, Prisma } from '@fit/db';
import {
  buildReconciliationReport,
  decodeVariantRef,
  deriveOrderChannel,
  gymSettingsStoredSchema,
  ORDER_EXPORT_COLUMNS,
  orderExportCells,
  productVariantsSchema,
  REFUND_EXCEEDS_PAID_CODE,
  type AdminOrderDetail,
  type AdminOrderRow,
  type CashReconciliationQuery,
  type CashReconciliationReport,
  type ListOrdersQuery,
  type ListOrdersResponse,
  type OrderStatusTimelineEntry,
  type PaymentMethod,
  type RecordPosSaleInput,
  type RecordPosSaleResponse,
  type ReconciliationTally,
  type RefundOrderInput,
  type RefundOrderResponse,
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
              // The POS receipt snapshot carries no variant reference, so a POS line
              // can't be mapped back to a stock position — `productVariantId` stays
              // null and a POS refund's restock is a no-op for it. `qty` is recorded
              // so the line's quantity survives onto the order detail.
              qty: line.quantity,
            })),
          },
          // Record the opening transition so the order's status timeline (T7.9) is
          // generated from the same append-only log every other transition writes to.
          statusEvents: { create: { status: OrderStatus.PAID } },
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

  // ── Admin order management (T7.9) ────────────────────────────────────────

  /**
   * One filtered, server-paginated page of the gym's orders for the admin roster.
   * Every filter is optional (a bare call lists the whole history, newest first):
   * `channel` keys off the payment provider (`pos` → POS, else ONLINE — see
   * {@link buildOrderWhere}), `status` / `memberId` narrow directly, and `from`/`to`
   * bound `createdAt`. `total` is the filtered count so the pager stays accurate.
   * Runs on the tenant-scoped client, so the gym constraint is automatic.
   */
  async listOrders(query: ListOrdersQuery): Promise<ListOrdersResponse> {
    const where = buildOrderWhere(query);
    const skip = (query.page - 1) * query.limit;

    // The roster page, the filtered count, and the summary totals in one round
    // trip. `grossTotal` sums the orders' `total`; `refundedTotal` sums the
    // running `refundedAmount` off the matching orders' payments (an unpaid order
    // has no payment and so contributes nothing); `currency` is read off the
    // newest matching order so the tiles format in the roster's own currency.
    const [rows, total, grossAgg, refundAgg, currencyRow] = await Promise.all([
      this.prisma.client.order.findMany({
        where,
        select: ORDER_ROW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.client.order.count({ where }),
      this.prisma.client.order.aggregate({ where, _sum: { total: true } }),
      this.prisma.client.payment.aggregate({
        where: { order: where },
        _sum: { refundedAmount: true },
      }),
      this.prisma.client.order.findFirst({
        where,
        select: { currency: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const grossTotal = grossAgg._sum.total ?? 0;
    const refundedTotal = refundAgg._sum.refundedAmount ?? 0;

    return {
      data: rows.map((row) => toOrderRow(row)),
      total,
      page: query.page,
      limit: query.limit,
      summary: {
        orderCount: total,
        grossTotal,
        refundedTotal,
        netTotal: grossTotal - refundedTotal,
        currency: currencyRow?.currency ?? DEFAULT_ROSTER_CURRENCY,
      },
    };
  }

  /**
   * One order's full detail for the admin detail page — the roster row plus its
   * priced `items`, the `payments` (0 or 1, an array to match the contract), the
   * `refunds` issued against it, and the generated `statusTimeline`. The timeline
   * comes from the append-only {@link OrderStatusEvent} log; an order that predates
   * the log (no events) falls back to a single synthesised entry from its current
   * status + creation time, so the section always renders. A missing id — or one
   * in another tenant (the scoped `where` constrains `gymId`) — is a `404`.
   */
  async getOrder(id: string): Promise<AdminOrderDetail> {
    const order = await this.prisma.client.order.findFirst({
      where: { id },
      select: {
        ...ORDER_ROW_SELECT,
        fulfillment: true,
        deliveryAddress: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, label: true, amount: true, productVariantId: true, qty: true },
        },
        payment: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            provider: true,
            refundedAmount: true,
            createdAt: true,
          },
        },
        refunds: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, amount: true, reason: true, restockItems: true, createdAt: true },
        },
        statusEvents: { orderBy: { at: 'asc' }, select: { status: true, at: true } },
      },
    });
    if (!order) {
      throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
    }

    const timeline: OrderStatusTimelineEntry[] =
      order.statusEvents.length > 0
        ? order.statusEvents.map((event) => ({ status: event.status, at: event.at.toISOString() }))
        : [{ status: order.status, at: order.createdAt.toISOString() }];

    return {
      ...toOrderRow(order),
      fulfillment: order.fulfillment,
      deliveryAddress: order.deliveryAddress,
      items: order.items.map((item) => ({
        id: item.id,
        label: item.label,
        amount: item.amount,
        productVariantId: item.productVariantId,
        qty: item.qty,
      })),
      payments: order.payment
        ? [
            {
              id: order.payment.id,
              amount: order.payment.amount,
              currency: order.payment.currency,
              status: order.payment.status,
              method: TO_WIRE_METHOD[order.payment.method],
              provider: order.payment.provider,
              refundedAmount: order.payment.refundedAmount,
              createdAt: order.payment.createdAt.toISOString(),
            },
          ]
        : [],
      refunds: order.refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        reason: refund.reason,
        restockItems: refund.restockItems,
        createdAt: refund.createdAt.toISOString(),
      })),
      statusTimeline: timeline,
    };
  }

  /**
   * Refund (part or all of) an order's captured payment (T7.9). The amount is
   * validated against the payment's **net** captured figure
   * (`amount - refundedAmount`); a request exceeding it — or an order with no
   * captured payment to refund — is a `422 EXCEEDS_PAID_AMOUNT`. Otherwise, in one
   * transaction: a {@link Refund} row is written (the audit record), the payment's
   * running `refundedAmount` is advanced (flipping its `status` to `REFUNDED` once
   * the capture is fully reversed), and a full refund also flips the order to
   * `REFUNDED` and logs the transition. When `restockItems` is set, the sold
   * variants are returned to on-hand stock in the same transaction, so a refund and
   * its restock can never partially apply. Returns the new refund's id.
   */
  async refundOrder(orderId: string, input: RefundOrderInput): Promise<RefundOrderResponse> {
    const gymId = this.tenant.gymId;
    const actor = this.tenant.userId ?? null;

    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          payment: { select: { id: true, amount: true, refundedAmount: true } },
          items: { select: { productVariantId: true, qty: true } },
        },
      });
      if (!order) {
        throw new NotFoundException({ message: 'Order not found', code: 'ORDER_NOT_FOUND' });
      }

      const payment = order.payment;
      const netPaid = payment ? payment.amount - payment.refundedAmount : 0;
      if (!payment || input.amount > netPaid) {
        throw new UnprocessableEntityException({
          message: 'Refund amount exceeds the order’s net paid amount',
          code: REFUND_EXCEEDS_PAID_CODE,
        });
      }

      const refund = await tx.refund.create({
        data: {
          gymId,
          orderId: order.id,
          paymentId: payment.id,
          amount: input.amount,
          reason: input.reason,
          restockItems: input.restockItems,
        },
        select: { id: true },
      });

      const nextRefunded = payment.refundedAmount + input.amount;
      const fullyRefunded = nextRefunded >= payment.amount;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: nextRefunded,
          ...(fullyRefunded ? { status: PaymentStatus.REFUNDED } : {}),
        },
      });

      // A full refund retires the order and logs the transition; a partial one
      // leaves it `PAID` (the refund itself is the record), so the timeline only
      // ever carries genuine status changes.
      if (fullyRefunded && order.status !== OrderStatus.REFUNDED) {
        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.REFUNDED } });
        await tx.orderStatusEvent.create({
          data: { orderId: order.id, status: OrderStatus.REFUNDED, actor },
        });
      }

      if (input.restockItems) {
        await this.restockItems(tx, gymId, order.items);
      }

      return { refundId: refund.id };
    });
  }

  /**
   * Stream the filtered orders as CSV rows, page by page, for `GET /orders/export`.
   * Yields the header line first, then one line per order, fetching a bounded page
   * at a time (ordered by `createdAt`, stable for a keyset-free scan) so a 5k+ row
   * export never loads the whole result set into memory. The controller pipes each
   * yielded chunk straight to the response. Reuses {@link buildOrderWhere} so the
   * export and the roster agree on every filter.
   */
  async *streamOrdersCsv(query: ListOrdersQuery): AsyncGenerator<string> {
    const where = buildOrderWhere(query);
    yield `${ORDER_EXPORT_COLUMNS.map(csvCell).join(',')}\r\n`;

    const pageSize = 500;
    for (let skip = 0; ; skip += pageSize) {
      const rows = await this.prisma.client.order.findMany({
        where,
        select: ORDER_ROW_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });
      if (rows.length === 0) {
        break;
      }
      for (const row of rows) {
        yield `${orderExportCells(toOrderRow(row)).map(csvCell).join(',')}\r\n`;
      }
      if (rows.length < pageSize) {
        break;
      }
    }
  }

  /**
   * Return sold variants to on-hand stock for a refund's restock (T7.9) — the
   * mirror of the checkout's stock draw-down. Sums refunded units per
   * (productId → variantIndex) from the order's lines (skipping base / untracked /
   * adjustment lines, which carry no resolvable variant), then increments each
   * affected variant's `stock` in the product's `variants` JSON inside the refund
   * transaction. Runs on the passed transaction client so stock and the refund
   * commit together.
   */
  private async restockItems(
    tx: TenantTransactionClient,
    gymId: string,
    items: { productVariantId: string | null; qty: number }[],
  ): Promise<void> {
    const byProduct = new Map<string, Map<number, number>>();
    for (const item of items) {
      if (!item.productVariantId) {
        continue;
      }
      const parsed = decodeVariantRef(item.productVariantId);
      if (!parsed || parsed.variantIndex === null) {
        continue;
      }
      const byIndex = byProduct.get(parsed.productId) ?? new Map<number, number>();
      byIndex.set(parsed.variantIndex, (byIndex.get(parsed.variantIndex) ?? 0) + item.qty);
      byProduct.set(parsed.productId, byIndex);
    }
    if (byProduct.size === 0) {
      return;
    }

    const products = await tx.product.findMany({
      where: { gymId, id: { in: [...byProduct.keys()] } },
      select: { id: true, variants: true },
    });

    for (const product of products) {
      const restocked = byProduct.get(product.id);
      if (!restocked) {
        continue;
      }
      const parsed = productVariantsSchema.safeParse(product.variants ?? []);
      if (!parsed.success) {
        continue;
      }
      const variants = parsed.data;
      let changed = false;
      for (const [index, qty] of restocked) {
        const variant = variants[index];
        if (!variant) {
          continue;
        }
        variants[index] = { ...variant, stock: variant.stock + qty };
        changed = true;
      }
      if (changed) {
        await tx.product.update({ where: { id: product.id }, data: { variants } });
      }
    }
  }
}

/**
 * The transaction-client view of the tenant-scoped (extended) Prisma client — the
 * delegate set minus the client-level lifecycle methods, mirroring how Prisma
 * derives its own `TransactionClient`. Used to type a helper that runs inside a
 * `$transaction` callback: the base `Prisma.TransactionClient` (default args) is
 * not assignable from the extended client, so a helper must take this instead.
 */
type TenantTransactionClient = Omit<
  TenantPrismaService['client'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * The currency the roster summary falls back to when the filtered set is empty
 * (no order to read a currency off). The gym trades in a single currency this
 * milestone — Georgian lari — so an empty roster still formats its zeroed tiles.
 */
const DEFAULT_ROSTER_CURRENCY = 'GEL';

/** The columns the admin roster / export queries select off an order. */
const ORDER_ROW_SELECT = {
  id: true,
  status: true,
  total: true,
  currency: true,
  memberId: true,
  customerName: true,
  createdAt: true,
  payment: { select: { provider: true, method: true, refundedAmount: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type OrderRowRecord = Prisma.OrderGetPayload<{ select: typeof ORDER_ROW_SELECT }>;

/**
 * The tenant-scoped `where` for the admin roster / export (the extension adds
 * `gymId`), narrowed by the optional filters. `channel` keys off the payment
 * provider: `POS` is an order with a `pos` payment; `ONLINE` is everything else,
 * expressed as the negation so an unpaid (`PENDING`, no payment) order counts as
 * online. `from`/`to` bound `createdAt` inclusively.
 */
function buildOrderWhere(query: ListOrdersQuery): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }
  if (query.memberId) {
    where.memberId = query.memberId;
  }
  if (query.channel === 'POS') {
    where.payment = { is: { provider: 'pos' } };
  } else if (query.channel === 'ONLINE') {
    where.NOT = { payment: { is: { provider: 'pos' } } };
  }
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  return where;
}

/** Project a queried order row to the denormalised roster {@link AdminOrderRow}. */
function toOrderRow(row: OrderRowRecord): AdminOrderRow {
  return {
    id: row.id,
    channel: deriveOrderChannel(row.payment?.provider),
    status: row.status,
    total: row.total,
    currency: row.currency,
    refundedAmount: row.payment?.refundedAmount ?? 0,
    memberId: row.memberId,
    customerName: row.customerName,
    paymentMethod: row.payment ? TO_WIRE_METHOD[row.payment.method] : null,
    itemCount: row._count.items,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Escape one cell for a CSV field (RFC 4180): wrap in double quotes and double any
 * embedded quote when the value contains a comma, quote, or newline; pass simple
 * values through untouched. Keeps the streamed export valid for spreadsheet import.
 */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
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
