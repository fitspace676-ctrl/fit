import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';

/**
 * SuperAdmin: the platform operator console API (`/admin/gyms`) — cross-tenant
 * gym listing, suspend/reactivate, and audited owner impersonation (T2.12).
 *
 * Imports {@link AuthModule} for its exported `TokenService` (used to mint the
 * short-lived, gym-scoped impersonation token). The globally-provided
 * `PrismaService` and the `TenantContext` / `TenantGuard` from the global
 * `TenantModule` need no explicit import, so this module only registers its own
 * controller + service.
 */
@Module({
  imports: [AuthModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
