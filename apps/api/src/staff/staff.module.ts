import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffController } from './staff.controller';
import { StaffDepthController } from './staff-depth.controller';
import { StaffDepthService } from './staff-depth.service';
import { StaffService } from './staff.service';

/**
 * Staff — the staff console's tenant-scoped staff management (invite, list,
 * re-role, remove; revoke pending invites — T4.7) plus the deeper Staff console
 * (notes, tasks, time-off, weekly schedule, roles matrix — T12.14).
 *
 * {@link StaffController} + {@link StaffDepthController} (both `/staff`) sit
 * behind the `TenantGuard` + global `PermissionsGuard`. {@link StaffService}
 * reuses the {@link AuthModule}'s `EmailService` (invite delivery) and
 * `TokenService` (session revocation on removal), so this module imports
 * `AuthModule` for them; the tenant-scoped Prisma client, the guards, and the
 * tenant context all come from the app-wide `TenantModule` / `RbacModule`.
 * Removing a coach cancels their future classes and PT, so it also imports
 * `BillingModule` (class-credit refunds) and `NotificationsModule` (telling the
 * affected members).
 */
@Module({
  imports: [AuthModule, AutomationModule, BillingModule, NotificationsModule],
  controllers: [StaffController, StaffDepthController],
  providers: [StaffService, StaffDepthService],
  exports: [StaffService],
})
export class StaffModule {}
