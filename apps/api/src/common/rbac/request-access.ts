import type { BranchScope, Permission } from '@fit/types';
import type { TenantState } from '../tenant/tenant.context';

/**
 * What one request's caller may actually do, at the gym the request is scoped to
 * — the runtime answer {@link import('./permissions.guard').PermissionsGuard}
 * gates on.
 *
 * It is the `@fit/types` `ResolvedRolePermissions` (grants + branch scope) plus
 * the two facts only the database can supply: WHICH branches an `assigned`-scope
 * caller holds, and which one a request that names none is forced onto. Resolved
 * once per request and handed to the guard whole, so the permission check and the
 * branch clamp can never disagree about who the caller is.
 */
export interface RequestAccess {
  /** The role the answer was resolved for, echoed for logging and assertions. */
  role: string;
  /** Every capability the caller holds at this gym, in `ALL_PERMISSIONS` order. */
  grants: readonly Permission[];
  /** Whether the caller works gym-wide or only across the branches they hold. */
  branchScope: BranchScope;
  /**
   * The branches an `assigned`-scope caller may name, and `null` when the scope is
   * `all` — the two are different answers, not one with an empty case. `null` is
   * "every branch, no clamp"; `[]` is "this person is rostered nowhere", which
   * fails closed.
   */
  allowedLocationIds: readonly string[] | null;
  /**
   * The branch a request that names none is forced onto under `assigned` scope —
   * the caller's base branch when they are rostered there, otherwise the first of
   * {@link allowedLocationIds}. `null` when the scope is `all` (nothing to force)
   * or when the caller holds no branches at all (nothing to force it TO).
   */
  defaultLocationId: string | null;
}

/**
 * The gym-aware permission resolver the guard reads through.
 *
 * An interface rather than a concrete class so the guard can be unit-tested
 * without a database, and so the guard's import graph stops here instead of
 * reaching Prisma.
 */
export interface RequestAccessResolver {
  /**
   * The effective access for `state`.
   *
   * **Throws rather than degrades.** A missing gym row, an unreadable settings
   * column, a caller with no membership — every one of those is a resolution
   * FAILURE, and the guard turns a throw into a `403`. Returning the static
   * matrix instead would silently restore a grant the operator revoked, which is
   * the one outcome this feature exists to prevent.
   */
  resolve(state: TenantState): Promise<RequestAccess>;

  /** Drop every cached answer for one gym — see {@link invalidateGymAccess}. */
  invalidateGym(gymId: string): void;
}

/**
 * DI token for the {@link RequestAccessResolver}.
 *
 * An explicit token because the dependency is an INTERFACE: TypeScript emits
 * `Object` as its design-time type, which Nest cannot resolve to a provider. The
 * guard injects it `@Optional()`, so an unprovided token leaves the constructor's
 * default — the process-wide holder — in place rather than failing to instantiate.
 */
export const REQUEST_ACCESS_RESOLVER = Symbol('REQUEST_ACCESS_RESOLVER');

/**
 * The process-wide resolver, set by `RolePermissionsService`'s constructor.
 *
 * A module-level holder rather than pure constructor injection, for two reasons
 * that are specific to this guard:
 *
 *  1. {@link import('./permissions.guard').PermissionsGuard} is registered as a
 *     global `APP_GUARD` via `useExisting`, and that path has already been seen in
 *     production to hand the constructor `undefined` for its injected deps — the
 *     bug its `new Reflector()` / `new TenantContext()` defaults exist to survive.
 *     A dependency that can arrive as `undefined` may not be the thing standing
 *     between a caller and a revoked permission, so the guard's default resolver
 *     reaches the real service through here instead of trusting DI to have run.
 *  2. Cache invalidation is a process-wide concern with call sites in unrelated
 *     modules (the settings PATCH, the staff-roster write). Routing those through
 *     {@link invalidateGymAccess} keeps them one import rather than a constructor
 *     parameter threaded through services whose own tests would then need it.
 */
let backing: RequestAccessResolver | null = null;

/** Install the process-wide resolver. Called by `RolePermissionsService`. */
export function registerRequestAccessResolver(resolver: RequestAccessResolver): void {
  backing = resolver;
}

/**
 * Remove the process-wide resolver — for tests that assert the guard's behaviour
 * when nothing is registered (it must `403`, not fall back to the static matrix).
 */
export function clearRequestAccessResolver(): void {
  backing = null;
}

/**
 * Drop every cached answer for one gym: its role-permission overrides AND the
 * branch assignments of everyone who works there.
 *
 * Called from the settings PATCH and from the staff-roster write, so an operator's
 * change takes effect on the very next request in this process. A no-op before the
 * resolver is registered, and deliberately coarse — a roster edit is rare and a
 * gym's cache is two small entries, so busting both costs nothing and removes the
 * question of which of the two a given write touched.
 */
export function invalidateGymAccess(gymId: string): void {
  backing?.invalidateGym(gymId);
}

/**
 * The resolver the guard uses when DI hands it none — a thin indirection over
 * {@link backing} that **throws when nothing is registered**.
 *
 * Throwing is the point: an unwired resolver is a resolution failure like any
 * other, so it produces a `403` rather than a silent return to the static matrix.
 */
const shared: RequestAccessResolver = {
  async resolve(state: TenantState): Promise<RequestAccess> {
    if (!backing) {
      throw new Error('No RequestAccessResolver is registered');
    }
    return backing.resolve(state);
  },
  invalidateGym(gymId: string): void {
    backing?.invalidateGym(gymId);
  },
};

/** The process-wide resolver indirection — see {@link shared}. */
export function sharedRequestAccessResolver(): RequestAccessResolver {
  return shared;
}
