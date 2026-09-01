import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { REQUEST_ACCESS_RESOLVER } from './request-access';
import { RolePermissionsService } from './role-permissions.service';
import { RolesGuard } from './roles.guard';

/**
 * Role-based access-control infrastructure, provided application-wide.
 *
 * Exposes {@link RolesGuard} (enforces `@Roles(...)`), {@link PermissionsGuard}
 * (enforces `@RequirePermissions(...)`) and {@link RolePermissionsService}, which
 * resolves each request's grants and branch scope against the gym's runtime
 * overrides. Both guards read the caller's role from the {@link TenantContext} that
 * `TenantModule` provides, so attach them *after* `TenantGuard` on a route, e.g.
 * `@UseGuards(TenantGuard, PermissionsGuard)`.
 *
 * `@Global` so any feature module can use the guards by class reference without
 * re-importing this module. The guards are registered as providers so Nest can
 * resolve their `Reflector` + `TenantContext` dependencies via DI.
 *
 * {@link RolePermissionsService} is listed first deliberately: it publishes itself
 * as the process-wide resolver on construction, and {@link PermissionsGuard} falls
 * back to that holder when DI hands it no resolver (see `request-access.ts`).
 */
@Global()
@Module({
  providers: [
    RolePermissionsService,
    // The guard depends on the resolver INTERFACE, which has no runtime type for
    // Nest to key on — hence the explicit token. It is injected `@Optional()`, so
    // this is the fast path and the process-wide holder is the backstop.
    { provide: REQUEST_ACCESS_RESOLVER, useExisting: RolePermissionsService },
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [RolePermissionsService, REQUEST_ACCESS_RESOLVER, RolesGuard, PermissionsGuard],
})
export class RbacModule {}
