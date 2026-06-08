import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  freezeSubscriptionSchema,
  type FreezeSubscriptionResponse,
  type UnfreezeSubscriptionResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SubscriptionFreezeService } from './subscription-freeze.service';

/**
 * Member subscription freeze / pause API (`/subscriptions`, T8.4).
 *
 * Distinct from the staff console's `/admin/subscriptions` plan CRUD
 * ({@link AdminSubscriptionPlansController}, T8.2): this is a member acting on their
 * *own* membership. Both routes are tenant-scoped behind {@link TenantGuard} + the
 * global {@link PermissionsGuard} and require {@link Permission.SubscriptionManage}
 * (granted to the `MEMBER` role for this self-service). The service runs on the
 * tenant-scoped Prisma client and pins the subscription to the caller's own gym
 * membership, so no handler ever passes a `memberId` or `gymId`.
 */
@Controller('subscriptions')
@UseGuards(TenantGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(private readonly freeze: SubscriptionFreezeService) {}

  /**
   * `POST /subscriptions/:id/freeze` — pause the caller's membership from
   * `startDate` for `durationDays`. Returns `200 { frozenUntil }`. Failure modes:
   * `404 SUBSCRIPTION_NOT_FOUND`, `409 ALREADY_FROZEN`, `409
   * SUBSCRIPTION_NOT_FREEZABLE`, and `422 { code: 'EXCEEDS_FREEZE_ALLOWANCE',
   * remainingDays }` when the request overruns the plan's per-period allowance.
   */
  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.SubscriptionManage)
  async freezeSubscription(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<FreezeSubscriptionResponse> {
    return this.freeze.freeze(id, parse(freezeSubscriptionSchema, body));
  }

  /**
   * `POST /subscriptions/:id/unfreeze` — resume the caller's frozen membership
   * (early or at its scheduled end). Returns `200 { newPeriodEnd }` with the next
   * renewal pushed out by the days actually spent frozen. Failure modes: `404
   * SUBSCRIPTION_NOT_FOUND` and `409 NOT_FROZEN`.
   */
  @Post(':id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.SubscriptionManage)
  async unfreezeSubscription(@Param('id') id: string): Promise<UnfreezeSubscriptionResponse> {
    return this.freeze.unfreeze(id);
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
