import { Module } from '@nestjs/common';
import { AdminBannersController } from './admin-banners.controller';
import { AdminBannersService } from './admin-banners.service';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';

/**
 * Home-screen promotional banners (T1.16) — both halves of one feature.
 *
 * Two controllers with deliberately different authorization models, the same
 * split the trainers module makes:
 *   • {@link AdminBannersController} (`/marketing/banners`) — staff CRUD behind
 *     `TenantGuard` + `PermissionsGuard`, on the tenant-scoped Prisma client.
 *   • {@link BannersController} (`/banners`) — the `@Public()` member listing, on
 *     the untenanted client with an explicit `gymId`, and excluded from the JWT
 *     `TenantMiddleware` in `AppModule`.
 *
 * Registers only its controllers + services; the tenant-scoped Prisma client, the
 * guards and the storage/cleanup services come from the app-wide `TenantModule` /
 * `RbacModule` / `StorageModule` (the last is `@Global`).
 */
@Module({
  controllers: [AdminBannersController, BannersController],
  providers: [AdminBannersService, BannersService],
})
export class BannersModule {}
