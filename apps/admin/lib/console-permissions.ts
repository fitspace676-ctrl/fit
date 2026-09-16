// @fit/admin — what the signed-in operator may actually do at THIS gym.
//
// The console used to answer that question from `roleHasPermission(role, perm)`:
// a pure function over the static `ROLE_PERMISSIONS` matrix, gym-unaware and
// I/O-free. That was correct for exactly as long as the matrix was the only
// answer. A gym may now edit each staff role's grants and branch scope
// (`@fit/types` `role-permissions`), so the console has to resolve against the
// gym rather than against the product's defaults, and it has to do it ONCE per
// request — a per-component fetch would be ~25 round trips a page and would let
// two components disagree.
//
// This module is the shape of that one answer plus the pure functions over it.
// It is isomorphic on purpose (no `next/headers`, no `react`): the dashboard
// layout resolves it on the server, `components/console-permissions.tsx` hands
// the same object to the browser, and both sides then run the same checks over
// the same data. `lib/permissions-server.ts` is the server-only reader.
//
// TWO AXES, NOT ONE. A capability says *what* ("may read members"); the branch
// scope says *where* ("only the branches you are rostered to"). They multiply:
// a receptionist who may read members reads THEIR branch's members. Everything
// that clamps the branch switcher is here for the same reason the capability
// check is — so the sidebar, the route gate and the fetch boundary cannot reach
// three different conclusions from three copies of the rule.
//
// FAIL CLOSED IS THE WHOLE POSTURE. There is no "unknown" state that behaves
// like "allowed": a session that has not been resolved is {@link DENIED_ACCESS},
// which holds nothing and reaches nowhere.

import { z } from 'zod';
import { ALL_PERMISSIONS, branchScopeSchema, type BranchScope, type Permission } from '@fit/types';
import type { BranchAccess, LocationRef } from './active-location';

/**
 * The signed-in operator's effective permissions at the active gym.
 *
 * Deliberately NOT `ResolvedRolePermissions` from `@fit/types` with an extra
 * field bolted on: that type answers "what does this ROLE hold", which is a
 * property of the gym's settings, and this one answers "what can THIS PERSON
 * do", which additionally needs the branches they are personally rostered to.
 * A role's `branchScope: 'assigned'` means nothing without the assignments.
 */
export interface ConsolePermissions {
  /** The role the session was resolved for, echoed so a cached answer names its subject. */
  role: string;
  /** Every capability the session holds at this gym, in `ALL_PERMISSIONS` order. */
  grants: readonly Permission[];
  /** Whether the session works gym-wide or only across the branches below. */
  branchScope: BranchScope;
  /**
   * The branch ids this person holds `LocationStaff` rows for.
   *
   * Only consulted when `branchScope` is `assigned` — a gym-wide role reaches
   * every branch whether or not it is rostered anywhere, which is what makes an
   * owner who has never been assigned to a branch still able to open all of them.
   */
  assignedLocationIds: readonly string[];
}

/**
 * The answer for a session that could not be resolved: no capability, no branch.
 *
 * Every failure lands here — no session, an API that refused, an API that
 * answered something we could not parse. It is a real value rather than `null`
 * so no caller can forget the `?? allow` branch that would undo the whole
 * feature; `consoleCan(DENIED_ACCESS, anything)` is `false` and
 * `branchAccess(DENIED_ACCESS, roster)` reaches no branch at all.
 *
 * `assigned` scope (rather than `all`) is the closed half of that axis too: with
 * an empty assignment list it permits nothing, whereas `all` would permit the
 * entire gym.
 */
export const DENIED_ACCESS: ConsolePermissions = {
  role: 'DENIED',
  grants: [],
  branchScope: 'assigned',
  assignedLocationIds: [],
};

/**
 * Everything, everywhere — the system roles.
 *
 * `SUPER_ADMIN` is platform-wide and never gym-scoped; `OWNER` is the locked
 * system role the storage contract pins to every permission and every branch so
 * that no override can lock the one person who has to undo it out of the editor.
 * Both are answered here without any I/O, which is also why an owner still
 * reaches the console when the resolution endpoint is unavailable.
 */
export function fullConsoleAccess(role: string): ConsolePermissions {
  return {
    role,
    grants: [...ALL_PERMISSIONS],
    branchScope: 'all',
    assignedLocationIds: [],
  };
}

/**
 * Whether the session holds `permission`.
 *
 * The gym-aware replacement for `roleHasPermission(role, permission)` — same
 * question, answered from the gym's resolved grants instead of the shipped
 * matrix. For a gym that has never opened the editor the two agree exactly,
 * which is why nothing had to be migrated.
 */
export function consoleCan(
  permissions: ConsolePermissions | null | undefined,
  permission: Permission,
): boolean {
  return permissions?.grants.includes(permission) ?? false;
}

/**
 * Whether the session holds every one of `required` — an empty list is held by
 * everyone, which is what makes an ungated route reachable by all staff.
 */
export function consoleCanAll(
  permissions: ConsolePermissions | null | undefined,
  required: readonly Permission[],
): boolean {
  return required.every((permission) => consoleCan(permissions, permission));
}

/**
 * The branches this session may act on, given the gym's live roster.
 *
 * `all` sees the whole roster and may look at every branch at once. `assigned`
 * sees the intersection of the roster with its own `LocationStaff` rows and may
 * NOT — "all locations" is not a branch such a person holds, it is the absence of
 * the restriction, so offering it would hand them the gym.
 *
 * The intersection is taken against the live roster rather than trusting the
 * assignment ids, so a branch that was deactivated (or belongs to another gym,
 * from a stale row) drops out on this side as well as on the API's.
 */
export function branchAccess(
  permissions: ConsolePermissions | null | undefined,
  roster: readonly LocationRef[],
): BranchAccess {
  if (permissions == null) {
    return { canSelectAll: false, allowed: [] };
  }
  if (permissions.branchScope === 'all') {
    return { canSelectAll: true, allowed: roster.map((location) => location.id) };
  }
  const assigned = new Set(permissions.assignedLocationIds);
  return {
    canSelectAll: false,
    allowed: roster.filter((location) => assigned.has(location.id)).map((location) => location.id),
  };
}

/**
 * The subset of `roster` this session may see in the switcher, in roster order.
 *
 * A restricted operator is never SHOWN a branch they cannot select — an option
 * that snaps back to a different branch on choosing it reads as a broken control,
 * not as a policy.
 */
export function permittedLocations<T extends LocationRef>(
  permissions: ConsolePermissions | null | undefined,
  roster: readonly T[],
): T[] {
  const { canSelectAll, allowed } = branchAccess(permissions, roster);
  if (canSelectAll) {
    return [...roster];
  }
  const permitted = new Set(allowed);
  return roster.filter((location) => permitted.has(location.id));
}

// ---------------------------------------------------------------------------
// The wire shape
// ---------------------------------------------------------------------------

/**
 * `GET /me/permissions` — what the API says this session may do at this gym.
 *
 * The console cannot resolve this itself. The grants live in `Gym.settings`,
 * whose only read endpoint requires `GymManage` (an OWNER capability), so a
 * manager's console could never fetch the blob its own sidebar depends on; and
 * the branch assignments live in `LocationStaff`, which the console has no
 * endpoint for at all. Both are one cheap, already-authenticated read on the API
 * side — `resolveRolePermissions(settings.permissions, role)` plus the caller's
 * own assignment rows — so the API answers the resolved question and the console
 * consumes it.
 *
 * Parsed rather than cast. This is the input that decides what the whole console
 * offers, and a shape we merely asserted would turn a bad deploy on the API side
 * into a silently permissive console. Anything that does not parse is
 * {@link DENIED_ACCESS}.
 *
 * Unknown capability strings are DROPPED rather than rejected: the API may ship a
 * permission this console build has never heard of, and refusing the whole answer
 * for it would log every operator out of their own sidebar on a routine deploy.
 * A capability we do not know is one we cannot gate on anyway.
 */
export const myPermissionsSchema = z.object({
  role: z.string().min(1),
  grants: z.array(z.string()).transform((values) => {
    const known = new Set<string>(ALL_PERMISSIONS);
    return values.filter((value): value is Permission => known.has(value));
  }),
  branchScope: branchScopeSchema,
  assignedLocationIds: z.array(z.string().min(1)).default([]),
});

/** The parsed `GET /me/permissions` body — {@link myPermissionsSchema}. */
export type MyPermissionsResponse = z.infer<typeof myPermissionsSchema>;

/**
 * Project a `GET /me/permissions` body onto {@link ConsolePermissions}, or
 * {@link DENIED_ACCESS} when it does not parse.
 *
 * The single narrowing point between "bytes the API sent" and "what the console
 * believes", so there is exactly one place a malformed answer can turn into an
 * open door — and it does not.
 */
export function consolePermissionsFrom(body: unknown): ConsolePermissions {
  const parsed = myPermissionsSchema.safeParse(body);
  if (!parsed.success) {
    return DENIED_ACCESS;
  }
  return {
    role: parsed.data.role,
    grants: parsed.data.grants,
    branchScope: parsed.data.branchScope,
    assignedLocationIds: parsed.data.assignedLocationIds,
  };
}
