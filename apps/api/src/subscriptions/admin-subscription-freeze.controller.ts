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
 * Staff-console subscription freeze / pause API
 * (`POST /admin/subscriptions/:id/(un)freeze`, T5.7).
 *
 * The staff counterpart to the member self-service {@link SubscriptionsController}
 * (`/subscriptions/:id/freeze`): a staff operator pausing or resuming a *member's*
 * membership from the member-detail console, rather than the member acting on their
 * own. Both delegate to the one {@link SubscriptionFreezeService} so the freeze
 * legality (state machine) and per-plan allowance
 * (`422 EXCEEDS_FREEZE_ALLOWANCE`) live in a single place. It is a staff write, so
 * it is gated by {@link Permission.BillingManage} (which covers "subscriptions,
 * plans, and payment settings") behind {@link TenantGuard} + the global
 * {@link PermissionsGuard}; the tenant-scoped Prisma client constrains the
 * subscription id to the caller's gym, so a cross-tenant id is a `404`.
 */
@Controller('admin/subscriptions')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminSubscriptionFreezeController {
  constructor(private readonly freeze: SubscriptionFreezeService) {}

  /**
   * `POST /admin/subscriptions/:id/freeze` — pause `:id` from `startDate` for
   * `durationDays`. Returns `200 { frozenUntil }`. Failure modes: `404
   * SUBSCRIPTION_NOT_FOUND`, `409 ALREADY_FROZEN`, `409 SUBSCRIPTION_NOT_FREEZABLE`,
   * and `422 { code: 'EXCEEDS_FREEZE_ALLOWANCE', remainingDays }`.
   */
  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingManage)
  async freezeSubscription(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<FreezeSubscriptionResponse> {
    return this.freeze.freezeForStaff(id, parse(freezeSubscriptionSchema, body));
  }

  /**
   * `POST /admin/subscriptions/:id/unfreeze` — resume `:id` (early or at its
   * scheduled end). Returns `200 { newPeriodEnd }`. Failure modes: `404
   * SUBSCRIPTION_NOT_FOUND` and `409 NOT_FROZEN`.
   */
  @Post(':id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingManage)
  async unfreezeSubscription(@Param('id') id: string): Promise<UnfreezeSubscriptionResponse> {
    return this.freeze.unfreezeForStaff(id);
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
