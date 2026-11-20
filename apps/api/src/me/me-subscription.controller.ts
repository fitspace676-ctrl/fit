import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  Permission,
  paySubscriptionSchema,
  type GetMeSubscriptionResponse,
  type PaySubscriptionResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MeSubscriptionService } from './me-subscription.service';

/**
 * `GET /me/subscription` — the calling member's own membership + billing history.
 *
 * Self-service (the `/me` prefix): the caller is resolved from the session, never
 * a member id on the wire. Behind {@link TenantGuard} + the global
 * {@link PermissionsGuard}, gated by {@link Permission.SubscriptionManage} (the same
 * capability that lets a member freeze their membership).
 */
@Controller('me/subscription')
@UseGuards(TenantGuard, PermissionsGuard)
export class MeSubscriptionController {
  constructor(private readonly subscriptions: MeSubscriptionService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.SubscriptionManage)
  async get(): Promise<GetMeSubscriptionResponse> {
    return this.subscriptions.getMySubscription();
  }

  /**
   * `POST /me/subscription/pay` — pay the caller's next period of a manually paid
   * membership on the gym's hosted checkout (`201 { payment }`). The resulting
   * order is followed with the ordinary `/checkout/:orderId` routes.
   */
  @Post('pay')
  @HttpCode(HttpStatus.CREATED)
  // The capability the `/checkout/:orderId/payment/*` routes the member follows
  // this order with are gated on, so a member who can pay can also finish paying.
  @RequirePermissions(Permission.ProfileManage)
  async pay(@Body() body: unknown): Promise<PaySubscriptionResponse> {
    const { returnTo } = parse(paySubscriptionSchema, body ?? {});
    return this.subscriptions.payNextPeriod(returnTo ?? 'web');
  }
}

/** Parse `data` with `schema`; a `400` lists each failing field (as in the checkout controller). */
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
