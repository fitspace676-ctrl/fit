import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ImpersonationController } from './impersonation.controller';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';

/**
 * SuperAdmin: the platform operator console API — cross-tenant gym listing,
 * suspend/reactivate, and audited owner impersonation.
 *
 * Two controllers, because impersonation is a handoff with two ends. The
 * SUPER_ADMIN-only console API lives under `/admin/gyms`; the redemption half
 * ({@link ImpersonationController}) is mounted under `/auth/impersonation`,
 * unguarded, and is called by a tenant console's server with the single-use code
 * as its only credential.
 *
 * Imports {@link AuthModule} for its exported `TokenService` (used to mint the
 * short-lived, gym-scoped impersonation token). The globally-provided
 * `PrismaService`, `RedisService` (where the handoff codes live), and the
 * `TenantContext` / `TenantGuard` from the global `TenantModule` need no
 * explicit import.
 */
@Module({
  imports: [AuthModule],
  controllers: [SuperAdminController, ImpersonationController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
