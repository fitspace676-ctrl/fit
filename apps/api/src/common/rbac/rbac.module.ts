import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

/**
 * Role-based access-control infrastructure, provided application-wide.
 *
 * Exposes {@link RolesGuard} (enforces `@Roles(...)`) and {@link PermissionsGuard}
 * (enforces `@RequirePermissions(...)`). Both read the caller's role from the
 * {@link TenantContext} that `TenantModule` provides, so attach them *after*
 * `TenantGuard` on a route, e.g. `@UseGuards(TenantGuard, PermissionsGuard)`.
 *
 * `@Global` so any feature module can use the guards by class reference without
 * re-importing this module. The guards are registered as providers so Nest can
 * resolve their `Reflector` + `TenantContext` dependencies via DI.
 */
@Global()
@Module({
  providers: [RolesGuard, PermissionsGuard],
  exports: [RolesGuard, PermissionsGuard],
})
export class RbacModule {}
