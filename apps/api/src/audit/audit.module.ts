import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Audit — the read side of the platform's audit trail.
 *
 * {@link AuditController} (`/audit-logs`) is the staff console's view of its own
 * gym, behind the `TenantGuard` + global `PermissionsGuard`. {@link AuditService}
 * reads on the **unscoped** `PrismaService` (the `AuditLog` model opts out of
 * tenant scoping) and pins that query to the caller's gym via the app-wide
 * `TenantContext` — both come from the global `PrismaModule` / `TenantModule`, so
 * this module registers only its own controller + service.
 *
 * The service is EXPORTED because the operator console's cross-tenant feed
 * (`GET /admin/audit-logs`, served by `SuperAdminController`) reads the same
 * trail through the same projection. The route lives over there, with the rest of
 * the SUPER_ADMIN surface and its gate; the reading lives here, with the model.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
