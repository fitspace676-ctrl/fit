import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

/**
 * Audit — the staff console's tenant-scoped audit-log viewer (T4.9).
 *
 * {@link AuditController} (`/audit-logs`) sits behind the `TenantGuard` + global
 * `PermissionsGuard`. {@link AuditService} reads the trail on the **unscoped**
 * `PrismaService` (the `AuditLog` model opts out of tenant scoping) and pins each
 * query to the caller's gym via the app-wide `TenantContext` — both come from the
 * global `PrismaModule` / `TenantModule`, so this module only registers its own
 * controller + service.
 */
@Module({
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
