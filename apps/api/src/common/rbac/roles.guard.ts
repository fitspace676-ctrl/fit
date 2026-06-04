import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { TenantContext } from '../tenant/tenant.context';

/**
 * Enforces `@Roles(...)`. Attach after the tenant has been established — i.e.
 * `@UseGuards(TenantGuard, RolesGuard)` — so the caller's role is available on
 * the {@link TenantContext}.
 *
 * Behaviour:
 *
 * - A handler with no `@Roles(...)` metadata is unguarded by this guard: it
 *   returns `true` so the decorator is purely opt-in.
 * - Missing tenant context means `TenantMiddleware` never ran for the route — a
 *   wiring error, surfaced as `401` (consistent with {@link TenantGuard}).
 * - `SUPER_ADMIN` always passes: it is the platform-wide role and is not gated by
 *   gym-scoped role lists.
 * - Otherwise the caller's role must appear in the listed roles, else `403`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
  ) {
    // Bind `canActivate` so it keeps its `this` when @sentry/nestjs proxies the
    // method in production (see PermissionsGuard for the full rationale).
    this.canActivate = this.canActivate.bind(this);
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles on this route — nothing for this guard to enforce.
    if (!requiredRoles || requiredRoles.length === 0) {
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

    // Platform admins bypass gym-scoped role gating.
    if (state.role === Role.SUPER_ADMIN) {
      return true;
    }

    if (!requiredRoles.includes(state.role)) {
      throw new ForbiddenException({
        message: 'You do not have the required role for this action',
        code: 'INSUFFICIENT_ROLE',
      });
    }

    return true;
  }
}
