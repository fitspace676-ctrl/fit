import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_CROSS_TENANT_KEY } from '../decorators/allow-cross-tenant.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { TenantContext } from '../tenant/tenant.context';
import { Permission, roleHasPermission } from './permissions';

/**
 * The application's **global, deny-by-default** authorization gate. Registered
 * once via `APP_GUARD` (see `AppModule`), it runs on every route so that being
 * reachable is always a deliberate, declared decision — never an accidental
 * omission.
 *
 * A route is admitted only if it declares its authorization intent in one of
 * these ways:
 *
 * - `@Public()` — genuinely open (registration, login, health). Allowed
 *   outright, with no session required.
 * - `@RequirePermissions(...)` — the caller must hold *every* listed permission
 *   (AND semantics). `SUPER_ADMIN` holds all permissions via
 *   {@link roleHasPermission} and so always passes; any missing permission is a
 *   `403`.
 * - `@Roles(...)` — authorization is delegated to {@link RolesGuard}; this guard
 *   only confirms an authenticated session is present and lets the route through.
 * - `@AllowCrossTenant()` — a platform/SuperAdmin route whose authorization is
 *   enforced by {@link TenantGuard} (SUPER_ADMIN-only); likewise delegated.
 *
 * A route declaring **none** of the above is rejected with `403` — the
 * deny-by-default backstop. Any non-public route also requires an established
 * {@link TenantContext} (set by `TenantMiddleware`); its absence means the route
 * was wired without the middleware and surfaces as `401`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    // A genuinely public route — no session needed, no further checks.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    // Every non-public route runs behind an authenticated tenant context. Its
    // absence means TenantMiddleware never ran for this route — a wiring error.
    const state = this.tenant.current;
    if (!state) {
      throw new UnauthorizedException({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((permission) =>
        roleHasPermission(state.role, permission),
      );
      if (!hasAll) {
        throw new ForbiddenException({
          message: 'You do not have permission to perform this action',
          code: 'INSUFFICIENT_PERMISSION',
        });
      }
      return true;
    }

    // No permission requirement, but authorization may be declared via a sibling
    // gate — `@Roles(...)` (RolesGuard) or `@AllowCrossTenant()` (TenantGuard).
    // Defer to them; they run as controller-level guards on those routes.
    const hasRoles =
      (this.reflector.getAllAndOverride<unknown[]>(ROLES_KEY, targets) ?? []).length > 0;
    const allowsCrossTenant = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CROSS_TENANT_KEY,
      targets,
    );
    if (hasRoles || allowsCrossTenant) {
      return true;
    }

    // Nothing declared any authorization intent — deny by default.
    throw new ForbiddenException({
      message: 'This endpoint declares no authorization policy',
      code: 'ENDPOINT_NOT_AUTHORIZED',
    });
  }
}
