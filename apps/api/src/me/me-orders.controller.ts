import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permission, listMyOrdersQuerySchema, type ListMyOrdersResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MeOrdersService } from './me-orders.service';

/**
 * `GET /me/orders` — the calling member's own purchase history.
 *
 * Self-service (the `/me` prefix): the caller is resolved from the session, never
 * a member id on the wire, so the route cannot address anybody else's orders.
 * Behind {@link TenantGuard} + the global {@link PermissionsGuard}.
 *
 * **Gated on {@link Permission.ProfileManage}** — the same capability
 * `GET /checkout/:orderId` uses, and for the same reason: the rows are already
 * constrained to the caller's own membership by {@link MeOrdersService}, so a
 * purchase capability (`CreditPackManage` / `SubscriptionManage`) would add
 * nothing but a way to lock a member out of the history they can already see one
 * order of. `ProfileManage` is the self-service capability every gym-scoped role
 * holds, which is what the other `/me` routes are gated on.
 *
 * Deliberately NOT the staff roster: `GET /orders`
 * ({@link import('../orders/orders.controller').OrdersController}) is the
 * console's order-management surface and requires `BillingRead`, which no member
 * holds. Reaching for it from the app is the 403 this route exists to replace.
 */
@Controller('me/orders')
@UseGuards(TenantGuard, PermissionsGuard)
export class MeOrdersController {
  constructor(private readonly orders: MeOrdersService) {}

  /**
   * `GET /me/orders?page=1&limit=20` — one page of the caller's orders, newest
   * first. The pager is validated up front (a `limit` over 50 or a `page` below 1
   * is a `400`) and both fields default, so a bare call is valid. An empty list is
   * a normal `200` — a member who has never bought anything, or a caller with no
   * membership in this gym.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async list(@Query() query: unknown): Promise<ListMyOrdersResponse> {
    const result = listMyOrdersQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.orders.list(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
