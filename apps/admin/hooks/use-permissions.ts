'use client';

// @fit/admin — client permission hook.
//
// `usePermissions()` answers "may the current operator do X" from the set the
// dashboard layout resolved on the server — what THIS GYM grants this role,
// including whatever it has edited — rather than from the static
// `ROLE_PERMISSIONS` matrix the hook used to read. Those two agree exactly for a
// gym that has never opened the permissions editor, and disagree the moment one
// has: reading the matrix meant the console kept offering buttons for a
// capability the gym had revoked, and the API kept refusing them.
//
// Authoritative checks still happen server-side; this only drives what the UI
// renders.

import { useMemo } from 'react';
import type { BranchScope, Permission } from '@fit/types';
import { useConsolePermissions } from '@/components/console-permissions';
import { consoleCan } from '@/lib/console-permissions';

export interface UsePermissionsResult {
  /** True when the operator holds `permission` at this gym. */
  can: (permission: Permission) => boolean;
  /** Whether the operator works gym-wide or only across their assigned branches. */
  branchScope: BranchScope;
  /**
   * Always `false`. Kept so call sites written against the old fetch-backed hook
   * keep compiling: the permission set is now seeded by the server layout and is
   * therefore correct on the first frame, so there is no window to spin through.
   * A component that still branches on it simply never takes the loading arm.
   */
  isLoading: boolean;
}

/**
 * Capability check for the current operator. With no provider above it — outside
 * the console layout, in a test — every check denies, so UI gated on `can(...)`
 * fails closed.
 */
export function usePermissions(): UsePermissionsResult {
  const permissions = useConsolePermissions();
  return useMemo(
    () => ({
      can: (permission: Permission): boolean => consoleCan(permissions, permission),
      branchScope: permissions.branchScope,
      isLoading: false,
    }),
    [permissions],
  );
}
