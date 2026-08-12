import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module';
import { AdminSubscriptionPlansController } from './admin-subscription-plans.controller';
import { AdminSubscriptionPlansService } from './admin-subscription-plans.service';

/**
 * Subscription plans — the staff console's tenant-scoped recurring-membership
 * subscription-plan management (CRUD, T8.2).
 *
 * {@link AdminSubscriptionPlansController} (`/admin/subscriptions`) sits behind the
 * `TenantGuard` + global `PermissionsGuard`. The tenant-scoped Prisma client, the
 * guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 *
 * The public catalogue read + the member-facing enrolment / billing land in later
 * T8 tasks; this module owns only the staff CRUD surface.
 */
@Module({
  // `GymsModule` for `GymLocaleService`: a new plan is priced in the gym's own
  // configured currency rather than a hardcoded default.
  imports: [GymsModule],
  controllers: [AdminSubscriptionPlansController],
  providers: [AdminSubscriptionPlansService],
})
export class SubscriptionPlansModule {}
