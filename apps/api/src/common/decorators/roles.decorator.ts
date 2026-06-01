import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Role } from '@fit/db';

/** Reflector metadata key carrying the roles a handler accepts. */
export const ROLES_KEY = 'roles';

/**
 * Restrict a controller method (or whole controller) to callers holding one of
 * the listed {@link Role}s.
 *
 * Enforced by {@link RolesGuard}, which reads the caller's role from the tenant
 * context established by `TenantMiddleware`. `SUPER_ADMIN` always passes
 * regardless of the listed roles. Use this for coarse, role-shaped gates; prefer
 * `@RequirePermissions(...)` when the gate is really about a capability that
 * several roles share.
 *
 * @example
 *   @Roles(Role.OWNER, Role.MANAGER)
 *   @UseGuards(TenantGuard, RolesGuard)
 *   updateGymSettings() { ... }
 */
export const Roles = (...roles: Role[]): CustomDecorator => SetMetadata(ROLES_KEY, roles);
