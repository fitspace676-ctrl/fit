import { Module } from '@nestjs/common';
import { AdminLocationsController } from './admin-locations.controller';
import { AdminLocationsService } from './admin-locations.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

/**
 * Locations — the staff console's tenant-scoped location (branch) management
 * (CRUD with hours + amenities + photo upload, T4.5) plus the public, gymId-scoped
 * location-discovery listing (`GET /locations`, T3.8) the purchase wizard and the
 * shop cart's pickup picker (T7.7) browse.
 *
 * {@link AdminLocationsController} (`/admin/locations`) sits behind the
 * `TenantGuard` + global `PermissionsGuard`. {@link LocationsController}
 * (`GET /locations`) is `@Public()` and reads the same `Location` rows off the
 * base (untenanted) Prisma client, constrained to the explicit `gymId` query
 * param. The tenant-scoped Prisma client, the guards, and the tenant context all
 * come from the app-wide `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [AdminLocationsController, LocationsController],
  providers: [AdminLocationsService, LocationsService],
})
export class LocationsModule {}
