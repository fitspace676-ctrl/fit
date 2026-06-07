import { Module } from '@nestjs/common';
import { AdminPackagePlansController } from './admin-package-plans.controller';
import { AdminPackagePlansService } from './admin-package-plans.service';
import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

/**
 * Package plans — both the staff console's tenant-scoped personal-training
 * package-plan management (CRUD, T4.11) and the public catalogue read (T3.9 /
 * T6.6).
 *
 * {@link AdminPackagePlansController} (`/admin/packages`) sits behind the
 * `TenantGuard` + global `PermissionsGuard`. The tenant-scoped Prisma client, the
 * guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 *
 * {@link PackagesController} (`GET /packages`) is the public, gymId-scoped read
 * the web purchase wizard and mobile Personal Training screen browse — `@Public()`
 * and excluded from `TenantMiddleware` in `AppModule`.
 */
@Module({
  controllers: [AdminPackagePlansController, PackagesController],
  providers: [AdminPackagePlansService, PackagesService],
})
export class PackagePlansModule {}
