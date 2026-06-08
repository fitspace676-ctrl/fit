import { Module } from '@nestjs/common';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Subscriptions — the member-facing subscription lifecycle surface (freeze / pause
 * flow, T8.4).
 *
 * {@link SubscriptionsController} (`/subscriptions`) sits behind the `TenantGuard` +
 * global `PermissionsGuard` and serves a member acting on their *own* membership
 * (`SubscriptionManage`). Distinct from {@link SubscriptionPlansModule}, which owns
 * the staff console's subscription-*plan* CRUD (`/admin/subscriptions`, T8.2). The
 * tenant-scoped Prisma client, the guards, and the tenant context all come from the
 * app-wide `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionFreezeService],
})
export class SubscriptionsModule {}
