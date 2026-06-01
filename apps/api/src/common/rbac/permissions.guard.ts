import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { TenantContext } from '../tenant/tenant.context';
import { Permission, roleHasPermission } from './permissions';

/**
 * Enforces `@RequirePermissions(...)`. Attach after the tenant has been
 * established — i.e. `@UseGuards(TenantGuard, PermissionsGuard)` — so the
 * caller's role is available on the {@link TenantContext} and can be resolved to
 * its granted permissions.
 *
 * Behaviour:
 *
 * - A handler with no `@RequirePermissions(...)` metadata is unguarded by this
 *   guard: it returns `true`, keeping the decorator opt-in.
 * - Missing tenant context means `TenantMiddleware` never ran — a wiring error,
 *   surfaced as `401` (consistent with {@link TenantGuard}).
 * - The caller must hold *every* listed permission (AND semantics).
 *   `SUPER_ADMIN` holds all permissions via {@link roleHasPermission} and so
 *   always passes. Any missing permission throws `403`.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequirePermissions on this route — nothing for this guard to enforce.
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const state = this.tenant.current;
    if (!state) {
      // The middleware never ran for this route — a wiring error, surfaced as 401.
      throw new UnauthorizedException({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

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
}
