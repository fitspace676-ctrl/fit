import { Module } from '@nestjs/common';
import { AdminPackagePlansController } from './admin-package-plans.controller';
import { AdminPackagePlansService } from './admin-package-plans.service';

/**
 * Package plans — the staff console's tenant-scoped personal-training package-plan
 * management (CRUD, T4.11).
 *
 * {@link AdminPackagePlansController} (`/admin/packages`) sits behind the
 * `TenantGuard` + global `PermissionsGuard`. The tenant-scoped Prisma client, the
 * guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 */
@Module({
  controllers: [AdminPackagePlansController],
  providers: [AdminPackagePlansService],
})
export class PackagePlansModule {}
