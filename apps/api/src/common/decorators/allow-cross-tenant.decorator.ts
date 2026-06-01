import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/** Reflector metadata key flagging a handler as cross-tenant. */
export const ALLOW_CROSS_TENANT_KEY = 'allowCrossTenant';

/**
 * Mark a controller method (or whole controller) as exempt from tenant scoping.
 *
 * The exemption is **not** unconditional: {@link TenantGuard} only honours it
 * for a `SUPER_ADMIN` caller and otherwise rejects the request, and the Prisma
 * tenant extension only skips its `gymId` filter once the guard has confirmed
 * that. Applying this decorator without that role check would silently disable
 * tenant isolation, which is exactly what the guard prevents.
 *
 * Intended for platform-level SuperAdmin endpoints that legitimately read or
 * write across gyms (e.g. the superadmin dashboard).
 */
export const AllowCrossTenant = (): CustomDecorator => SetMetadata(ALLOW_CROSS_TENANT_KEY, true);
