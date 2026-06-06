import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/**
 * Staff — the staff console's tenant-scoped staff management (invite, list,
 * re-role, remove; revoke pending invites — T4.7).
 *
 * {@link StaffController} (`/staff`) sits behind the `TenantGuard` + global
 * `PermissionsGuard`. {@link StaffService} reuses the {@link AuthModule}'s
 * `EmailService` (invite delivery) and `TokenService` (session revocation on
 * removal), so this module imports `AuthModule` for them; the tenant-scoped
 * Prisma client, the guards, and the tenant context all come from the app-wide
 * `TenantModule` / `RbacModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
