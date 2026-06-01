import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@fit/db';
import type { Request } from 'express';
import { ALLOW_CROSS_TENANT_KEY } from '../decorators/allow-cross-tenant.decorator';
import { TenantContext } from './tenant.context';

/**
 * Guard for tenant-scoped controllers. Attach with `@UseGuards(TenantGuard)` to
 * any controller serving gym-scoped resources; it runs after
 * {@link TenantMiddleware} has established the request's tenant.
 *
 * Two responsibilities:
 *
 * 1. **Cross-tenant gating.** On an `@AllowCrossTenant()` handler it requires the
 *    caller to be `SUPER_ADMIN` — rejecting everyone else with `403` — and only
 *    then flips `allowCrossTenant` on the tenant state so the Prisma extension
 *    skips its `gymId` filter. The decorator alone never disables isolation.
 *
 * 2. **Path-param consistency.** When a route carries a `:gymId` param it must
 *    equal the caller's own tenant. A mismatch throws **`404`, not `403`**: a
 *    member of gym A asking for gym B's URL must not even learn that gym B
 *    exists, so the resource is reported simply absent.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenant: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const state = this.tenant.current;
    if (!state) {
      // The middleware never ran for this route — a wiring error, surfaced as 401.
      throw new UnauthorizedException({
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const allowCrossTenant = this.reflector.getAllAndOverride<boolean>(ALLOW_CROSS_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (allowCrossTenant) {
      if (state.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException({
          message: 'Cross-tenant access is restricted to platform administrators',
          code: 'CROSS_TENANT_FORBIDDEN',
        });
      }
      // Confirmed SuperAdmin → let the Prisma extension skip tenant scoping.
      state.allowCrossTenant = true;
      return true;
    }

    // A scoped request must be bound to a single gym.
    if (state.gymId === null) {
      throw new ForbiddenException({
        message: 'No tenant is associated with this request',
        code: 'TENANT_REQUIRED',
      });
    }

    const request = context.switchToHttp().getRequest<Request>();
    const paramGymId = request.params?.gymId;
    if (typeof paramGymId === 'string' && paramGymId !== state.gymId) {
      // Don't reveal that another tenant's resource exists — report it absent.
      throw new NotFoundException({ message: 'Not found', code: 'NOT_FOUND' });
    }

    return true;
  }
}
