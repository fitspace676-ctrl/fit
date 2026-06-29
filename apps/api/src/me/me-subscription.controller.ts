import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Permission, type GetMeSubscriptionResponse } from '@fit/types';
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
}
