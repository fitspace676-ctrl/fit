import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffDepthController } from './staff-depth.controller';
import { StaffDepthService } from './staff-depth.service';
import { StaffService } from './staff.service';

/**
 * Staff — the staff console's tenant-scoped staff management (invite, list,
 * re-role, remove; revoke pending invites — T4.7) plus the deeper Staff console
 * (notes, tasks, time-off, specialties, weekly schedule, roles matrix — T12.14).
 *
 * {@link StaffController} + {@link StaffDepthController} (both `/staff`) sit
 * behind the `TenantGuard` + global `PermissionsGuard`. {@link StaffService}
 * reuses the {@link AuthModule}'s `EmailService` (invite delivery) and
 * `TokenService` (session revocation on removal), so this module imports
 * `AuthModule` for them; the tenant-scoped Prisma client, the guards, and the
 * tenant context all come from the app-wide `TenantModule` / `RbacModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [StaffController, StaffDepthController],
  providers: [StaffService, StaffDepthService],
})
export class StaffModule {}
