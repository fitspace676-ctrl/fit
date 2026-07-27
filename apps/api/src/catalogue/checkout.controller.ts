import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createCheckoutSchema,
  type CreateCheckoutResponse,
  type GetOrderResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CheckoutService } from './checkout.service';

/**
 * Member checkout (`/checkout`) — the join wizard's final step and its
 * confirmation read.
 *
 * A member buying *for themselves*, so it sits behind {@link TenantGuard} + the
 * global {@link PermissionsGuard} exactly like the credit-pack and subscription
 * self-service routes it delegates to, and requires the same self-service
 * capabilities the `MEMBER` role already holds. Nothing here is public: by this
 * point in the wizard the buyer has an account and a session (step 3 signs them
 * up), which is what lets the service take the gym, the member and the price off
 * the session and the catalogue rather than off the wire.
 *
 * Distinct from the staff-only {@link import('../orders/orders.controller').OrdersController}
 * (`/orders`), which is the console's order-management surface and requires
 * billing permissions no member has.
 */
@Controller('checkout')
@UseGuards(TenantGuard, PermissionsGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * `POST /checkout` — buy the chosen catalogue product. Returns `201` with the
   * `productType` plus whichever record the purchase settled onto (`orderId` for
   * a package / credit pack, `subscriptionId` for a subscription).
   *
   * Failure modes the wizard branches on: `422 PRODUCT_UNAVAILABLE` (missing,
   * cross-tenant, or not on sale), `409 ALREADY_SUBSCRIBED` (from subscription
   * enrolment), and `403` when the session has no live membership in this gym.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CreditPackManage, Permission.SubscriptionManage)
  async create(@Body() body: unknown): Promise<CreateCheckoutResponse> {
    return this.checkout.checkout(parse(createCheckoutSchema, body));
  }

  /**
   * `GET /checkout/:orderId` — the confirmation summary for one of the caller's
   * own orders. An id belonging to another member or gym is a `404`, never a
   * disclosure that it exists.
   */
  @Get(':orderId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CreditPackManage, Permission.SubscriptionManage)
  async read(@Param('orderId') orderId: string): Promise<GetOrderResponse> {
    return this.checkout.readOrder(orderId);
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
