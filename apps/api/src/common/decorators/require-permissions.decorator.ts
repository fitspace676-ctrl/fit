import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Permission } from '@fit/types';

/** Reflector metadata key carrying the permissions a handler requires. */
export const PERMISSIONS_KEY = 'permissions';

/**
 * Require a caller to hold *all* of the listed {@link Permission}s.
 *
 * Enforced by {@link PermissionsGuard}, which resolves the caller's role (from
 * the tenant context) to its granted permissions **at the caller's own gym** —
 * `Gym.settings.permissions` over the built-in `ROLE_PERMISSIONS` defaults, via
 * `resolveRolePermissions`. Semantics are AND: every listed permission must be
 * granted. `SUPER_ADMIN` and `OWNER` hold every permission and so always pass; a
 * grant set that cannot be resolved at all is a `403`, never a fall-back.
 *
 * Prefer this over `@Roles(...)` when authorization is about a capability rather
 * than a specific role — it survives the addition of new roles without touching
 * the handler.
 *
 * @example
 *   @RequirePermissions(Permission.MemberWrite)
 *   @UseGuards(TenantGuard, PermissionsGuard)
 *   createMember() { ... }
 */
export const RequirePermissions = (...permissions: Permission[]): CustomDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
