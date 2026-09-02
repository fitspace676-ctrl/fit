import { ForbiddenException } from '@nestjs/common';
import { roleHasPermission, type Permission } from '@fit/types';

/**
 * Service-level counterpart of `@RequirePermissions(...)` for the cases a route
 * decorator cannot express: a capability that is only required when the request
 * *body* asks for it (a promo code on a sale, a price on a product edit, a
 * recount instead of a plain adjustment). `role` is the caller's role from the
 * {@link TenantContext}; an absent role fails closed. Throws the same
 * `403 INSUFFICIENT_PERMISSION` the guard does, so clients see one shape.
 */
export function assertPermission(role: string | undefined, permission: Permission): void {
  if (role === undefined || !roleHasPermission(role, permission)) {
    throw new ForbiddenException({
      message: 'You do not have permission to perform this action',
      code: 'INSUFFICIENT_PERMISSION',
    });
  }
}
