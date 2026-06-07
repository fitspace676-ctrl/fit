import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permission, sendReceiptSchema, type SendReceiptResponse } from '@fit/types';
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
