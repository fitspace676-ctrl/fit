'use client';

// @fit/admin — client permission hook.
//
// `usePermissions()` resolves the current session's role to a capability check
// against the shared `@fit/types` `ROLE_PERMISSIONS` matrix — the exact matrix
// the API's `PermissionsGuard` enforces — so the UI shows/enables only what the
// server would actually allow. Authoritative checks still happen server-side;
// this only drives what the UI renders.

import { useMemo } from 'react';
import { roleHasPermission, type Permission } from '@fit/types';
import { useSession } from './use-session';

export interface UsePermissionsResult {
  /** True when the current session's role grants `permission`. */
  can: (permission: Permission) => boolean;
  /** True while the session is still resolving — deny until the role is known. */
  isLoading: boolean;
}

/**
 * Capability check for the current session. Returns `can(permission)` backed by
 * the shared role→permission matrix; with no session (or while it loads) every
 * check denies, so UI gated on `can(...)` fails closed.
 */
export function usePermissions(): UsePermissionsResult {
  const { user, isLoading } = useSession();
  const role = user?.role ?? null;
  return useMemo(
    () => ({
      can: (permission: Permission): boolean =>
        role !== null && roleHasPermission(role, permission),
      isLoading,
    }),
    [role, isLoading],
  );
}
