import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Products — the staff console's tenant-scoped retail product management (CRUD
 * with an image gallery + variants, T4.6) plus the public, gymId-scoped shop
 * catalogue (`GET /products`, T7.6) the mobile Shop tab and web shop listing
 * browse.
 *
 * {@link AdminProductsController} (`/admin/products`) sits behind the `TenantGuard`
 * + global `PermissionsGuard`. {@link ProductsController} (`GET /products`) is
 * `@Public()` and reads the same `Product` rows off the base (untenanted) Prisma
 * client, constrained to the explicit `gymId` query param. The tenant-scoped
 * Prisma client, the guards, and the tenant context all come from the app-wide
 * `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [AdminProductsController, ProductsController],
  providers: [AdminProductsService, ProductsService],
})
export class ProductsModule {}
