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
  /** i18n key (under the `admin` namespace) for the label shown in the sidebar. */
  labelKey: string;
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
  | 'checkin'
  | 'locations'
  | 'products'
  | 'services'
  | 'pos'
  | 'orders'
  | 'packages'
  | 'subscriptions'
  | 'classes'
  | 'workouts'
  | 'billing'
  | 'staff'
  | 'automation'
  | 'marketing'
  | 'loyalty'
  | 'analytics'
  | 'reports'
  | 'activity'
  | 'audit'
  | 'memberPortal'
  | 'settings';

/**
 * The full navigation set, ordered top-to-bottom. Permission/minRole gates mirror
 * the matrix in `@fit/types` and the route guards in `middleware.ts`:
 *   • Billing / Staff require `OWNER` (route-gated to OWNER+ despite some
 *     capabilities reaching lower roles).
 *   • Settings is gym configuration — `GymManage`, which only `OWNER` holds.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.dashboard', href: '/', icon: 'dashboard' },
  {
    labelKey: 'nav.members',
    href: '/members',
    icon: 'members',
    permission: Permission.MemberRead,
  },
  {
    // The coaching roster. Distinct from Staff: a `Trainer` is the gym's public
    // coach profile (bio, photo, specialties, availability) that classes and PT
    // sessions are assigned to, whereas a staff member is a console *login* with
    // a role. A gym cannot schedule a class against anything else, so without
    // this screen the class form's trainer select has nothing to offer.
    labelKey: 'nav.trainers',
    href: '/trainers',
    icon: 'trainers',
    permission: Permission.TrainerRead,
  },
  {
    // Classes hub — Class Types · Schedule · PT Calendar · Bookings (sub-tabs).
    labelKey: 'nav.classes',
    href: '/classes',
    icon: 'classes',
    permission: Permission.ClassRead,
  },
  {
    // Billing hub — Plans · Invoices (sub-tabs).
    labelKey: 'nav.billing',
    href: '/payments',
    icon: 'billing',
    permission: Permission.BillingRead,
  },
  {
    // Shop — the retail catalog, its own top-level destination (was a Payments sub-tab).
    labelKey: 'nav.shop',
    href: '/shop',
    icon: 'products',
    permission: Permission.ProductRead,
  },
  {
    // Services — the gym's bookable / sellable services, beside the retail Shop.
    labelKey: 'nav.services',
    href: '/services',
    icon: 'services',
    permission: Permission.ProductRead,
  },
  { labelKey: 'nav.pos', href: '/pos', icon: 'pos', permission: Permission.ProductRead },
  {
    labelKey: 'nav.staff',
    href: '/staff',
    icon: 'staff',
    permission: Permission.StaffManage,
    minRole: 'OWNER',
  },
  {
    labelKey: 'nav.automation',
    href: '/automation',
    icon: 'automation',
    permission: Permission.AutomationRead,
    minRole: 'MANAGER',
  },
  {
    labelKey: 'nav.marketing',
    href: '/marketing',
    icon: 'marketing',
    permission: Permission.MarketingRead,
    minRole: 'MANAGER',
  },
  { labelKey: 'nav.reports', href: '/reports', icon: 'reports', permission: Permission.ReportView },
  {
    // The member portal's own look — its two colours and the sign-in photograph.
    // A destination rather than a Settings tab: Settings is the gym's operating
    // policy (what the desk collects, what the till accepts, how invoices are
    // numbered) and this is a design surface with a live preview, which is a
    // different job done by a different person on a different day.
    //
    // Gated exactly as Settings is — it IS gym configuration, just visual — with
    // `minRole` stated as well as the capability so the gate here and the route
    // guard in `ROUTE_PERMISSIONS` read the same on the page rather than agreeing
    // only because `GymManage` happens to be OWNER-only today.
    labelKey: 'nav.memberPortal',
    href: '/member-portal',
    icon: 'memberPortal',
    permission: Permission.GymManage,
    minRole: 'OWNER',
  },
  {
    labelKey: 'nav.settings',
    href: '/settings',
    icon: 'settings',
    permission: Permission.GymManage,
  },
];

/** A labelled cluster of nav destinations, rendered as one collapsible section. */
export interface NavGroup {
  /** i18n key (under the `admin` namespace) for the section heading. */
  labelKey: string;
  /** The {@link NavItem} hrefs that belong to this group, in display order. */
  hrefs: readonly string[];
}

/**
 * How the sidebar clusters {@link NAV_ITEMS} into collapsible sections, top to
 * bottom. Every item's `href` must appear in exactly one group (guarded by test)
 * so no destination is silently dropped from the rail. The consolidated IA (fewer
 * top-level destinations, with Classes and Payments each fanning out into their
 * own hub sub-tabs) mirrors the reference admin while keeping our grouped rail.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { labelKey: 'navGroups.overview', hrefs: ['/'] },
  { labelKey: 'navGroups.people', hrefs: ['/members', '/trainers', '/staff'] },
  { labelKey: 'navGroups.operations', hrefs: ['/classes'] },
  { labelKey: 'navGroups.commerce', hrefs: ['/payments', '/shop', '/services', '/pos'] },
  { labelKey: 'navGroups.growth', hrefs: ['/automation', '/marketing'] },
  { labelKey: 'navGroups.insights', hrefs: ['/reports'] },
  { labelKey: 'navGroups.system', hrefs: ['/member-portal', '/settings'] },
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
