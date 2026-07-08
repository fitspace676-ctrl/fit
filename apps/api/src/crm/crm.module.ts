import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

/**
 * CRM: the staff console's sales-pipeline surface (`/crm`, T12.2) — leads,
 * upsell opportunities, their activity timelines and follow-up tasks, plus the
 * pipeline / revenue-forecast aggregations.
 *
 * Registers only its controller + service; the tenant-scoped Prisma client
 * (`TenantPrismaService`), the `TenantGuard`, and the global `PermissionsGuard`
 * all come from the app-wide `TenantModule` / `RbacModule`. The routes are
 * session-bound and tenant-scoped, so they sit behind the default
 * `TenantMiddleware` with no `AppModule` exclusion.
 */
@Module({
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
