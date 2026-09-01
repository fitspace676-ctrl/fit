import { resolveRolePermissions } from '@fit/types';
import type { RequestAccess, RequestAccessResolver } from '../common/rbac/request-access';
import type { TenantState } from '../common/tenant/tenant.context';

/**
 * A {@link RequestAccessResolver} that answers from the **built-in defaults** —
 * `resolveRolePermissions` with no gym settings — plus a fixed branch roster.
 *
 * For specs that boot a real Nest app to pin route authorization but have no
 * database: `PermissionsGuard` denies when no resolver is registered (an
 * unresolvable permission set is a `403`, never a fall-back to the static matrix),
 * so those specs must register one. Registering THIS one keeps them asserting what
 * they claim to — how the routes behave for a gym that has configured nothing,
 * which is the behaviour the shipped defaults describe.
 *
 * Register it with `registerRequestAccessResolver` in `beforeAll` and drop it with
 * `clearRequestAccessResolver` in `afterAll`; the holder is process-wide, so a spec
 * that leaves one installed changes the next file's guard.
 */
export function defaultsRequestAccessResolver(
  branches: readonly string[] = ['loc-1'],
): RequestAccessResolver {
  return {
    resolve(state: TenantState): Promise<RequestAccess> {
      const resolved = resolveRolePermissions(undefined, state.role);
      if (resolved.branchScope !== 'assigned') {
        return Promise.resolve({ ...resolved, allowedLocationIds: null, defaultLocationId: null });
      }
      return Promise.resolve({
        ...resolved,
        allowedLocationIds: [...branches],
        defaultLocationId: branches[0] ?? null,
      });
    },
    invalidateGym(): void {
      // Nothing is cached, so there is nothing to drop.
    },
  };
}
