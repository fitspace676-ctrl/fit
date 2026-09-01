// @fit/admin — the admin console's navigation model.
//
// A single declarative list of sidebar destinations, each optionally gated by a
// capability (`@fit/types` `Permission`) and/or a minimum role. `visibleNavItems`
// resolves that list against a session role so the sidebar only ever renders
// links the caller can actually reach.
//
// The gates here MIRROR `lib/route-guards.ts`, entry for entry: a link is shown
// only when the session holds the capability that route requires and clears any
// role floor it carries, so a rendered link never bounces the user to `/403`.
// `lib/nav.spec.ts` asserts the two agree in both directions — a nav item whose
// gate is looser than its route would render a link to a page that refuses it,
// and one that is tighter would hide a page the operator may actually open.
//
// WHAT CHANGED WHEN GYMS COULD EDIT ROLES. `visibleNavItems` used to take a
// `Role` and answer from the static `ROLE_PERMISSIONS` matrix. It now takes the
// session's RESOLVED permissions — what this gym grants this role, right now —
// because the matrix is only the default and a gym that has revoked a capability
// must not be shown the link to it. The resolution happens once per request in
// `app/(dashboard)/layout.tsx`; this function stays pure over the answer.

import { Permission } from '@fit/types';
import { hasRoleAtLeast, ROLES, type Role } from './auth-session';
import { consoleCan, type ConsolePermissions } from './console-permissions';

/** A single sidebar destination. */
export interface NavItem {
  /** i18n key (under the `admin` namespace) for the label shown in the sidebar. */
  labelKey: string;
  /** App-relative path (basePath is applied by `next/link`). */
  href: string;
  /**
   * Capability the session must hold for the link to appear — the same one
   * `lib/route-guards.ts` gates the destination on. Omit for "all staff".
   */
  permission?: Permission;
  /**
   * Role floor, mirroring the destination's `RouteGuard.minRole`, so a link is
   * never rendered to a route a floor would refuse.
   *
   * The duplication is deliberate and asserted by test rather than derived,
   * because the two answer different questions — "what may this link offer" and
   * "what will this route admit" — and a nav item that quietly inherited its
   * gate would hide the one place they are allowed to differ (they are not,
   * today; the test is what keeps that true).
   */
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
 * The full navigation set, ordered top-to-bottom.
 *
 * Every gate here is the one `lib/route-guards.ts` puts on the destination, so
 * the rail offers exactly the pages that will open. `Staff` is the only entry
 * carrying a role floor as well as a capability, and it carries it because its
 * route does — see that file for why.
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
  },
  {
    labelKey: 'nav.marketing',
    href: '/marketing',
    icon: 'marketing',
    permission: Permission.MarketingRead,
  },
  { labelKey: 'nav.reports', href: '/reports', icon: 'reports', permission: Permission.ReportView },
  {
    // The member portal's own look — its two colours and the sign-in photograph.
    // A destination rather than a Settings tab: Settings is the gym's operating
    // policy (what the desk collects, what the till accepts, how invoices are
    // numbered) and this is a design surface with a live preview, which is a
    // different job done by a different person on a different day.
    //
    // Gated exactly as Settings is — it IS gym configuration, just visual. The
    // gate is the capability alone, deliberately: it used to state `OWNER` as
    // well, which was accurate only for as long as `GymManage` could not be
    // granted to anyone else. A gym that hands `GymManage` to a manager should
    // find this link in the rail, not have it withheld by a rank the editor
    // cannot reach.
    labelKey: 'nav.memberPortal',
    href: '/member-portal',
    icon: 'memberPortal',
    permission: Permission.GymManage,
  },
  {
    // Gym configuration, gated on `GymManage` — which is what every endpoint
    // behind the screen (`GET`/`PATCH /gyms/settings`) requires. The route guard
    // says the same thing, so a manager can no longer type the URL and collect a
    // page of 403s, and a gym that grants `GymManage` gets the link.
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
 * The nav items this session may see.
 *
 * `permissions` is the set resolved once per request from the gym's own settings
 * — see `lib/console-permissions.ts`. `null` (no session, or a resolution that
 * failed) renders NOTHING, so the rail fails closed rather than falling back to
 * what the role would hold by default.
 *
 * The role floor is read off `permissions.role`, and an unrecognised role name
 * clears no floor — a session whose role we cannot rank is not one to guess
 * about.
 */
export function visibleNavItems(permissions: ConsolePermissions | null): NavItem[] {
  if (permissions === null) {
    return [];
  }
  const role = (ROLES as readonly string[]).includes(permissions.role)
    ? (permissions.role as Role)
    : null;
  return NAV_ITEMS.filter((item) => {
    if (item.permission && !consoleCan(permissions, item.permission)) {
      return false;
    }
    if (item.minRole && (role === null || !hasRoleAtLeast(role, item.minRole))) {
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
