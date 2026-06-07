import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  cashReconciliationQuerySchema,
  Permission,
  recordPosSaleSchema,
  sendReceiptSchema,
  type CashReconciliationReport,
  type RecordPosSaleResponse,
  type SendReceiptResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { OrdersService } from './orders.service';

/**
 * Orders API (`/orders`, T7.4) — the POS sale's server-side endpoints.
 *
 * Tenant-scoped staff access: {@link TenantGuard} pins the request to one gym and
 * {@link PermissionsGuard} enforces the capability. Emailing a receipt is a
 * billing/transaction action gated on {@link Permission.BillingRead}, which the
 * POS-operator roles (RECEPTIONIST, MANAGER, OWNER) hold — a TRAINER, who can read
 * products but not transactions, is correctly excluded.
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
  @RequirePermissions(Permission.BillingRead)
  async sendReceipt(@Body() body: unknown): Promise<SendReceiptResponse> {
    return this.orders.sendReceipt(parse(sendReceiptSchema, body));
  }

  /**
   * `POST /orders/pos-sale` — persist a completed POS sale as a `PAID` order plus a
   * `CAPTURED` payment, so the day's takings exist to reconcile (T7.5). The body is
   * the sale snapshot (priced lines + settlement figures) and the optional attached
   * member; a malformed payload is a `400`. Returns the created `{ orderId, paymentId }`.
   * Gated on `BillingRead` — the transaction capability the POS-operator roles hold.
   */
  @Post('pos-sale')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BillingRead)
  async recordSale(@Body() body: unknown): Promise<RecordPosSaleResponse> {
    return this.orders.recordSale(parse(recordPosSaleSchema, body));
  }

  /**
   * `GET /orders/reconciliation?date=YYYY-MM-DD` — the end-of-day cash reconciliation
   * for one business day (T7.5): the gym's captured takings for that day (in the
   * gym's own timezone) grouped by settlement method, with the cash total the
   * counted drawer is balanced against. An out-of-range / impossible date is a
   * `400`. Gated on `BillingRead`.
   */
  @Get('reconciliation')
  @RequirePermissions(Permission.BillingRead)
  async reconcile(@Query() query: unknown): Promise<CashReconciliationReport> {
    return this.orders.reconcile(parse(cashReconciliationQuerySchema, query));
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
