// @fit/admin — the admin console's navigation model.
//
// A single declarative list of sidebar destinations, each optionally gated by a
// capability (`@fit/types` `Permission`) and/or a minimum role. `visibleNavItems`
// resolves that list against a session role so the sidebar only ever renders
// links the caller can actually reach.
//
// The gates here are deliberately a *subset* of what `middleware.ts` enforces
// (see `ROUTE_PERMISSIONS` in `lib/auth-session.ts`): a link is shown only when
// the role both holds the capability AND clears the route's minimum role, so a
// rendered link never bounces the user to `/403`. The server still re-checks on
// every request — this only decides what the UI offers.

import { Permission, roleHasPermission } from '@fit/types';
import { hasRoleAtLeast, type Role } from './auth-session';

/** A single sidebar destination. */
export interface NavItem {
  /** Human label shown in the sidebar. */
  label: string;
  /** App-relative path (basePath is applied by `next/link`). */
  href: string;
  /** Capability the role must hold for the link to appear. Omit for "all staff". */
  permission?: Permission;
  /** Minimum role, mirroring `ROUTE_PERMISSIONS`, so links never lead to `/403`. */
  minRole?: Role;
  /** One of the inline icon keys rendered by the sidebar. */
  icon: NavIcon;
}

/** Icon identifiers — the sidebar maps each to an inline SVG. */
export type NavIcon =
  | 'dashboard'
  | 'members'
  | 'trainers'
  | 'locations'
  | 'products'
  | 'pos'
  | 'orders'
  | 'packages'
  | 'classes'
  | 'workouts'
  | 'billing'
  | 'staff'
  | 'reports'
  | 'audit'
  | 'settings';

/**
 * The full navigation set, ordered top-to-bottom. Permission/minRole gates mirror
 * the matrix in `@fit/types` and the route guards in `middleware.ts`:
 *   • Billing / Staff require `OWNER` (route-gated to OWNER+ despite some
 *     capabilities reaching lower roles).
 *   • Settings is gym configuration — `GymManage`, which only `OWNER` holds.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/', icon: 'dashboard' },
  { label: 'Members', href: '/members', icon: 'members', permission: Permission.MemberRead },
  { label: 'Trainers', href: '/trainers', icon: 'trainers', permission: Permission.TrainerRead },
  {
    label: 'Locations',
    href: '/locations',
    icon: 'locations',
    permission: Permission.LocationRead,
  },
  { label: 'Products', href: '/products', icon: 'products', permission: Permission.ProductRead },
  { label: 'Point of sale', href: '/pos', icon: 'pos', permission: Permission.ProductRead },
  { label: 'Orders', href: '/orders', icon: 'orders', permission: Permission.BillingRead },
  { label: 'Packages', href: '/packages', icon: 'packages', permission: Permission.PackageRead },
  { label: 'Classes', href: '/classes', icon: 'classes', permission: Permission.ClassRead },
  { label: 'Workouts', href: '/workouts', icon: 'workouts', permission: Permission.WorkoutRead },
  {
    label: 'Billing',
    href: '/billing',
    icon: 'billing',
    permission: Permission.BillingRead,
    minRole: 'OWNER',
  },
  {
    label: 'Staff',
    href: '/staff',
    icon: 'staff',
    permission: Permission.StaffManage,
    minRole: 'OWNER',
  },
  { label: 'Reports', href: '/reports', icon: 'reports', permission: Permission.ReportView },
  {
    label: 'Audit log',
    href: '/audit-log',
    icon: 'audit',
    permission: Permission.AuditRead,
    minRole: 'MANAGER',
  },
  { label: 'Settings', href: '/settings', icon: 'settings', permission: Permission.GymManage },
];

/**
 * The nav items a `role` may see. Returns an empty list for a `null` role (no
 * session resolved yet, or signed out) so the UI fails closed. `SUPER_ADMIN`
 * clears every gate via {@link roleHasPermission} and the role ranking.
 */
export function visibleNavItems(role: Role | null): NavItem[] {
  if (role === null) {
    return [];
  }
  return NAV_ITEMS.filter((item) => {
    if (item.permission && !roleHasPermission(role, item.permission)) {
      return false;
    }
    if (item.minRole && !hasRoleAtLeast(role, item.minRole)) {
      return false;
    }
    return true;
  });
}

/**
 * Whether `href` is the active nav target for the current `pathname`. The root
 * (`/`) matches only exactly; every other entry matches its own path or any
 * nested child (`/members/123` activates "Members").
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
