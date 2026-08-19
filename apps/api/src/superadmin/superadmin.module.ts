import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAuditController } from './admin-audit.controller';
import { ImpersonationController } from './impersonation.controller';
import { SuperAdminController } from './superadmin.controller';
import { SuperAdminService } from './superadmin.service';

/**
 * SuperAdmin: the platform operator console API — cross-tenant gym listing,
 * suspend/reactivate, and audited owner impersonation.
 *
 * Three controllers. The SUPER_ADMIN-only console API lives under `/admin/gyms`
 * and `/admin/audit-logs` ({@link AdminAuditController}, the operator's read of
 * the trail the rest of this module writes). The third,
 * {@link ImpersonationController}, is the redemption half of the impersonation
 * handoff: mounted under `/auth/impersonation`, unguarded, and called by a tenant
 * console's server with the single-use code as its only credential.
 *
 * Imports {@link AuthModule} for its exported `TokenService` (used to mint the
 * short-lived, gym-scoped impersonation token) and `AuthService` (gym
 * provisioning, shared with self-signup), and {@link AuditModule} for the
 * `AuditService` that reads the trail this console writes. The globally-provided
 * `PrismaService`, `RedisService` (where the handoff codes live), and the
 * `TenantContext` / `TenantGuard` from the global `TenantModule` need no
 * explicit import.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [SuperAdminController, AdminAuditController, ImpersonationController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
