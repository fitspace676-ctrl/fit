import { ForbiddenException } from '@nestjs/common';
import type { Permission } from '@fit/types';
import type { TenantContext } from '../tenant/tenant.context';
import type { RequestAccessResolver } from './request-access';

/**
 * The check behind a route that admits a full capability OR its "own" variant
 * (e.g. `PtSessionManage` / `PtSessionManageOwn`): the full grant passes, the own
 * grant passes only when the record's staff member is the caller's own user.
 *
 * Grants are resolved live — a gym may have edited what the role holds — so this
 * runs in the service, after the route guard has admitted either permission.
 */
export async function assertFullOrOwn(input: {
  tenant: TenantContext;
  access: RequestAccessResolver;
  full: Permission;
  own: Permission;
  /** The `User.id` behind the record's staff member, or null when it has none. */
  ownerUserId: string | null | undefined;
  denied: () => ForbiddenException;
}): Promise<void> {
  const state = input.tenant.current;
  if (!state?.userId) {
    throw input.denied();
  }
  let grants: readonly Permission[];
  try {
    grants = (await input.access.resolve(state)).grants;
  } catch {
    throw new ForbiddenException({ code: 'PERMISSION_RESOLUTION_FAILED' });
  }
  if (grants.includes(input.full)) {
    return;
  }
  if (grants.includes(input.own) && input.ownerUserId && input.ownerUserId === state.userId) {
    return;
  }
  throw input.denied();
}
