import { Module } from '@nestjs/common';
import { AdminLocationsController } from './admin-locations.controller';
import { AdminLocationsService } from './admin-locations.service';

/**
 * Locations — the staff console's tenant-scoped location (branch) management
 * (CRUD with hours + amenities + photo upload, T4.5).
 *
 * {@link AdminLocationsController} (`/admin/locations`) sits behind the
 * `TenantGuard` + global `PermissionsGuard`. The tenant-scoped Prisma client, the
 * guards, and the tenant context all come from the app-wide `TenantModule` /
 * `RbacModule`.
 *
 * The *public* location-discovery listing (`GET /locations`, T3.8 — the purchase
 * wizard's first step) is a separate surface; its Prisma-backed read lands with
 * the wizard wiring, but the editable record it surfaces is owned here.
 */
@Module({
  controllers: [AdminLocationsController],
  providers: [AdminLocationsService],
})
export class LocationsModule {}
