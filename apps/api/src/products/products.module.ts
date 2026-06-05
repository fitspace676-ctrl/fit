import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';

/**
 * Products — the staff console's tenant-scoped retail product management (CRUD
 * with an image gallery + variants, T4.6).
 *
 * {@link AdminProductsController} (`/admin/products`) sits behind the `TenantGuard`
 * + global `PermissionsGuard`. The tenant-scoped Prisma client, the guards, and the
 * tenant context all come from the app-wide `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [AdminProductsController],
  providers: [AdminProductsService],
})
export class ProductsModule {}
