import { Module } from '@nestjs/common';
import { AdminSubscriptionEnrollmentController } from './admin-subscription-enrollment.controller';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Subscriptions — the member-facing subscription lifecycle surface plus member
 * enrolment (T5.3, freeze / pause flow T8.4).
 *
 * {@link SubscriptionsController} (`/subscriptions`) sits behind the `TenantGuard` +
 * global `PermissionsGuard` and serves a member acting on their *own* membership:
 * enrolling (`POST /subscriptions`) and freezing / unfreezing it
 * (`SubscriptionManage`). {@link AdminSubscriptionEnrollmentController}
 * (`POST /admin/subscriptions/enroll`) is the staff counterpart that enrols a member
 * from the console (`BillingManage`); both share the one
 * {@link SubscriptionEnrollmentService}. Distinct from {@link SubscriptionPlansModule},
 * which owns the staff console's subscription-*plan* CRUD (`/admin/subscriptions`,
 * T8.2). The tenant-scoped Prisma client, the guards, and the tenant context all
 * come from the app-wide `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [SubscriptionsController, AdminSubscriptionEnrollmentController],
  providers: [SubscriptionFreezeService, SubscriptionEnrollmentService],
})
export class SubscriptionsModule {}
