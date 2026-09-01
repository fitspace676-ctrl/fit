import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  cashReconciliationQuerySchema,
  listOrdersQuerySchema,
  Permission,
  recordPosSaleSchema,
  refundOrderSchema,
  sendReceiptSchema,
  type AdminOrderDetail,
  type CashReconciliationReport,
  type ListOrdersResponse,
  type RecordPosSaleResponse,
  type RefundOrderResponse,
  type SendReceiptResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { OrdersService } from './orders.service';

/**
 * Orders API (`/orders`, T7.4 / T7.9) — the POS sale's server-side endpoints plus
 * the admin order management surface (roster, detail, refund, CSV export).
 *
 * Tenant-scoped staff access: {@link TenantGuard} pins the request to one gym and
 * {@link PermissionsGuard} enforces the capability. Reading orders / receipts and
 * exporting are transaction reads gated on {@link Permission.TransactionRead},
 * which the POS-operator roles (RECEPTIONIST, MANAGER, OWNER) hold — a TRAINER, who
 * can read products but not transactions, is correctly excluded. Issuing a refund
 * moves money and is gated on the stronger {@link Permission.PaymentRefund}.
 */
@Controller('orders')
@UseGuards(TenantGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * `POST /orders/receipt` — email a customer the receipt of a completed POS sale.
   * The body carries the recipient address and the sale snapshot (priced lines +
   * settlement figures); it is validated up front (a bad amount / method / email is
   * a `400` with per-field detail). Returns `{ delivered }` — `false` when email
   * delivery is unconfigured and the receipt was only logged.
   */
  @Post('receipt')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PosAccess)
  async sendReceipt(@Body() body: unknown): Promise<SendReceiptResponse> {
    return this.orders.sendReceipt(parse(sendReceiptSchema, body));
  }

  /**
   * `POST /orders/pos-sale` — persist a completed POS sale as a `PAID` order plus a
   * `CAPTURED` payment, so the day's takings exist to reconcile (T7.5). The body is
   * the sale snapshot (priced lines + settlement figures) and the optional attached
   * member; a malformed payload is a `400`. Returns the created `{ orderId, paymentId }`.
   * Gated on `PaymentProcess` — the till capability the POS-operator roles hold
   * (a `promoCode` additionally needs `DiscountApply`).
   */
  @Post('pos-sale')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PaymentProcess)
  async recordSale(@Body() body: unknown): Promise<RecordPosSaleResponse> {
    return this.orders.recordSale(parse(recordPosSaleSchema, body));
  }

  /**
   * `GET /orders/reconciliation?date=YYYY-MM-DD` — the end-of-day cash reconciliation
   * for one business day (T7.5): the gym's captured takings for that day (in the
   * gym's own timezone) grouped by settlement method, with the cash total the
   * counted drawer is balanced against. An out-of-range / impossible date is a
   * `400`. Gated on `SalesHistoryRead`.
   */
  @Get('reconciliation')
  @RequirePermissions(Permission.SalesHistoryRead)
  async reconcile(@Query() query: unknown): Promise<CashReconciliationReport> {
    return this.orders.reconcile(parse(cashReconciliationQuerySchema, query));
  }

  /**
   * `GET /orders` — one filtered, server-paginated page of the gym's orders for the
   * admin roster (T7.9). The query filters by `channel` (POS / ONLINE), `status`,
   * `memberId`, and a `from`/`to` `createdAt` range; a malformed filter is a `400`.
   * Gated on `TransactionRead`.
   */
  @Get()
  @RequirePermissions(Permission.TransactionRead)
  async list(@Query() query: unknown): Promise<ListOrdersResponse> {
    return this.orders.listOrders(parse(listOrdersQuerySchema, query));
  }

  /**
   * `GET /orders/export` — stream the filtered orders (same filters as the roster)
   * as a CSV attachment (T7.9). The body is streamed page by page so a 5k+ row
   * export never buffers the whole result set. Declared before the `:id` route so
   * the literal `export` segment isn't captured as an order id. Gated on
   * `TransactionRead`.
   */
  @Get('export')
  @RequirePermissions(Permission.TransactionRead)
  async export(@Query() query: unknown, @Res() res: Response): Promise<void> {
    const parsed = parse(listOrdersQuerySchema, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    for await (const chunk of this.orders.streamOrdersCsv(parsed)) {
      res.write(chunk);
    }
    res.end();
  }

  /**
   * `GET /orders/:id` — one order's full detail: items, payments, refunds, and the
   * generated status timeline (T7.9). An unknown / cross-tenant id is a `404`.
   * Gated on `TransactionRead`.
   */
  @Get(':id')
  @RequirePermissions(Permission.TransactionRead)
  async detail(@Param('id') id: string): Promise<AdminOrderDetail> {
    return this.orders.getOrder(id);
  }

  /**
   * `POST /orders/:id/refund` — refund part or all of an order's captured payment
   * (T7.9). The body carries the `amount` (minor units), the operator's `reason`,
   * and whether to `restockItems`; a malformed body is a `400` and an amount over
   * the net captured figure is a `422 EXCEEDS_PAID_AMOUNT`. Returns the new
   * `{ refundId }` (`201`). Gated on the stronger `PaymentRefund`.
   */
  @Post(':id/refund')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.PaymentRefund)
  async refund(@Param('id') id: string, @Body() body: unknown): Promise<RefundOrderResponse> {
    return this.orders.refundOrder(id, parse(refundOrderSchema, body));
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
