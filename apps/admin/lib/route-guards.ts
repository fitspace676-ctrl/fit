// @fit/admin — what each console route requires of the person opening it.
//
// This table used to live in `lib/auth-session.ts`, keyed by minimum ROLE, with
// seven entries. Both facts were problems.
//
// KEYED BY CAPABILITY NOW. A gym may edit what each staff role holds
// (`@fit/types` `role-permissions`), and a rank ladder cannot express "this gym
// took members away from its receptionists". Gating on rank would let an
// operator untick "view members" in the editor, watch the sidebar link vanish,
// and still find `/members` open — a toggle that half works teaches people the
// whole screen is decorative. Every entry below is the capability the route's own
// API calls require, so the console refuses exactly what the server refuses.
//
// ONE ENTRY PER ROUTE NOW. `/members`, `/trainers`, `/classes`, `/shop`, `/pos`,
// `/reports`, `/packages`, `/services` and `/locations` were listed nowhere: any
// staff session could open them, and only the API declined to hand over the
// data. That was survivable while role and capability agreed by construction. It
// stops being survivable the moment a gym can revoke a capability — the page
// would open onto a screenful of 403s instead of not opening.
//
// WHERE IT IS ENFORCED, AND WHY NOT IN MIDDLEWARE. The capability depends on the
// gym's settings. `middleware.ts` runs on the Edge, cannot cheaply read them, and
// must not pull `@fit/types` into its bundle to name a permission — so it keeps
// answering the question a JWT alone can answer ("is this a staff session at
// all") and the capability gate lives in `app/(dashboard)/layout.tsx`, which
// already holds the resolved permission set and runs before any page renders.
//
// `lib/nav.ts` states the same capability per sidebar item so a link is never
// rendered to a route that would refuse it. `lib/nav.spec.ts` asserts the two
// agree for every item, in both directions.

import { Permission } from '@fit/types';
import type { Role } from './auth-session';

/** What a console route requires of the session that opens it. */
export interface RouteGuard {
  /** App-relative path prefix. Matches the prefix itself and anything nested under it. */
  prefix: string;
  /**
   * The capability the route needs, or absent for a route open to all staff.
   *
   * This is the runtime-editable gate: a gym that revokes it from a role closes
   * the route for that role on the next request.
   */
  permission?: Permission;
  /**
   * A role floor ON TOP of the capability — for the one place console policy is
   * deliberately stricter than the capability the API enforces.
   *
   * Not a substitute for `permission`, and deliberately rare: every floor is a
   * gate the gym's own editor cannot open, so a row in the permission matrix that
   * sits behind one is a checkbox that does not fully work.
   */
  minRole?: Role;
}

/**
 * What each admin route prefix requires, most-specific first.
 *
 * The dashboard index (`/`) is not listed — as a prefix it would match every
 * path in the console — and is special-cased by {@link routeGuardForPath}.
 */
export const ROUTE_PERMISSIONS: readonly RouteGuard[] = [
  // ---- People -------------------------------------------------------------
  { prefix: '/members', permission: Permission.MemberRead },
  { prefix: '/trainers', permission: Permission.TrainerRead },
  // One capability covers reading the roster and re-roling people — there is no
  // `staff:read` to withhold.
  //
  // The OWNER floor is the single deliberate divergence in this table. MANAGER
  // holds `StaffManage` and the API honours it, but re-roling colleagues has
  // always been the owner's own screen in this console. It is stated as a floor
  // rather than folded into the capability so the divergence is visible — and so
  // it is one line to drop if the Staff row in the permission editor should mean
  // what it says for a MANAGER.
  { prefix: '/staff', permission: Permission.StaffManage, minRole: 'OWNER' },

  // ---- Operations ---------------------------------------------------------
  { prefix: '/classes', permission: Permission.ClassRead },

  // ---- Commerce -----------------------------------------------------------
  // Before `/settings`, and gated as Settings rather than as Billing: it is gym
  // configuration (how invoices are numbered), not the billing hub.
  { prefix: '/settings/billing', permission: Permission.GymManage },
  { prefix: '/payments', permission: Permission.BillingRead },
  { prefix: '/packages', permission: Permission.PackageRead },
  // Shop, Services and the till are one row in the permission editor because
  // they are one capability in the API: all three read `product:read`.
  { prefix: '/shop', permission: Permission.ProductRead },
  { prefix: '/services', permission: Permission.ProductRead },
  { prefix: '/pos', permission: Permission.ProductRead },

  // ---- Growth -------------------------------------------------------------
  // Were MANAGER+ by rank. The capability is the same gate for a gym that has
  // configured nothing — only OWNER and MANAGER hold it — and unlike the rank it
  // is something a gym can now grant.
  { prefix: '/automation', permission: Permission.AutomationRead },
  { prefix: '/marketing', permission: Permission.MarketingRead },

  // ---- Insights -----------------------------------------------------------
  { prefix: '/reports', permission: Permission.ReportView },

  // ---- System -------------------------------------------------------------
  { prefix: '/locations', permission: Permission.LocationRead },
  // Gym configuration and the member portal's look are both `GymManage`, which
  // is exactly what `GET`/`PATCH /gyms/settings` requires. Stating the capability
  // rather than OWNER is what keeps the route and the API in step: `/settings`
  // read `minRole: MANAGER` until recently and let a manager onto a page that
  // answered every read and every save with a 403.
  { prefix: '/settings', permission: Permission.GymManage },
  { prefix: '/member-portal', permission: Permission.GymManage },

  // ---- Open to all staff --------------------------------------------------
  // The operator's own account. `ProfileManage` is self-service — the storage
  // contract excludes it from the editor precisely because unticking it would not
  // restrict what someone may do to the gym — so there is nothing to revoke here
  // and no gate to apply.
  { prefix: '/profile' },
];

/**
 * The index route's guard: OPEN TO ALL STAFF, deliberately.
 *
 * The permission matrix pairs the dashboard with Reports under `ReportView`, and
 * that is right for what the two SHOW — but it is not a gate this route can
 * carry. `ReportView` is an OWNER/MANAGER capability, so gating `/` on it would
 * bounce every receptionist and trainer off the console's own landing page, into
 * a `/403` whose "back to dashboard" button leads straight back to it. The page
 * already handles this properly: it checks `ReportView` itself and renders the
 * non-reporting half of the dashboard without it.
 *
 * `/reports` — the destination the matrix row actually governs — is gated.
 */
const DASHBOARD_GUARD: RouteGuard = { prefix: '/' };

/**
 * The guard for `pathname`, or `null` when no rule covers it.
 *
 * `null` means "no rule", not "denied": an unknown path is a 404's problem, and
 * the staff gate in `middleware.ts` has already turned away everyone who has no
 * business in the console at all.
 *
 * A leading `/admin` segment is tolerated so the same rules hold whether the app
 * is mounted at the root or under an `/admin` base path.
 */
export function routeGuardForPath(pathname: string): RouteGuard | null {
  const path = pathname.startsWith('/admin') ? pathname.slice('/admin'.length) || '/' : pathname;
  // The dashboard IS a report — every widget on it fetches behind `ReportView`,
  // which is also why the permission editor gives Reports and Dashboard one row.
  if (path === '/' || path === '') {
    return DASHBOARD_GUARD;
  }
  for (const rule of ROUTE_PERMISSIONS) {
    if (path === rule.prefix || path.startsWith(`${rule.prefix}/`)) {
      return rule;
    }
  }
  return null;
}

/**
 * The capability `pathname` requires, or `null` for a route open to all staff
 * (and for a path no rule covers).
 */
export function requiredPermissionForPath(pathname: string): Permission | null {
  return routeGuardForPath(pathname)?.permission ?? null;
}

/**
 * The minimum role `pathname` requires, or `null` when it imposes no floor.
 *
 * Only `/staff` answers anything today — see {@link ROUTE_PERMISSIONS}.
 */
export function requiredRoleForPath(pathname: string): Role | null {
  return routeGuardForPath(pathname)?.minRole ?? null;
}
