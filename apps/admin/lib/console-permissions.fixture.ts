// @fit/admin — TEST FIXTURE. Not imported by any shipped code path, deliberately.
//
// "What would this role hold at a gym that has configured nothing" is the
// baseline every test about revocation has to compare against, and it is exactly
// the answer `@fit/types`' `resolveRolePermissions(null, role)` gives — the
// built-in matrix, which is what a gym resolves to until it opens the editor.
//
// It lives here rather than beside `getConsolePermissions()` on purpose. A
// production module exporting "the permissions this role would have by default"
// is an invitation to reach for it as a fallback when the real resolution fails,
// and that fallback is precisely the bug this feature exists to prevent: it would
// silently restore every capability a gym had revoked. Only `*.spec.ts` /
// `*.test.tsx` files may import this.

import { resolveRolePermissions } from '@fit/types';
import type { ConsolePermissions } from './console-permissions';

/**
 * The permission set a `role` resolves to at a gym with no overrides, optionally
 * rostered to `assignedLocationIds`.
 */
export function defaultPermissionsForRole(
  role: string,
  assignedLocationIds: readonly string[] = [],
): ConsolePermissions {
  const resolved = resolveRolePermissions(null, role);
  return {
    role: resolved.role,
    grants: resolved.grants,
    branchScope: resolved.branchScope,
    assignedLocationIds,
  };
}
