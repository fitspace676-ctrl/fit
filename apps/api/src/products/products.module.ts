import { Module } from '@nestjs/common';
import { AdminProductCategoriesController } from './admin-product-categories.controller';
import { AdminProductCategoriesService } from './admin-product-categories.service';
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
 * {@link AdminProductsController} (`/admin/products`) and
 * {@link AdminProductCategoriesController} (`/admin/product-categories`, the
 * staff-curated shelves a product is filed under) sit behind the `TenantGuard` +
 * global `PermissionsGuard`, and share the catalogue's `ProductRead`/`ProductWrite`
 * capabilities. {@link ProductsController} (`GET /products`) is `@Public()` and
 * reads the same `Product` rows off the base (untenanted) Prisma client,
 * constrained to the explicit `gymId` query param. The tenant-scoped Prisma client,
 * the guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 */
@Module({
  controllers: [AdminProductCategoriesController, AdminProductsController, ProductsController],
  providers: [AdminProductCategoriesService, AdminProductsService, ProductsService],
})
export class ProductsModule {}
