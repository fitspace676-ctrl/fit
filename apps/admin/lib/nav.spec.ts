// @fit/admin — navigation ⇄ route-guard ⇄ i18n consistency guard.
//
// The invariant this file exists for: THE SIDEBAR AND THE ROUTE GATE MUST AGREE.
// They are two tables (`NAV_ITEMS` and `ROUTE_PERMISSIONS`) written by hand,
// against the same set of destinations, and any drift between them is invisible
// until an operator clicks something:
//
//   • a nav gate LOOSER than its route renders a link that bounces to `/403`;
//   • a nav gate TIGHTER than its route hides a page the operator may open, and
//     the permission editor's toggle for it then appears to do nothing.
//
// So both directions are asserted, per item, rather than only the first. That is
// new: the gates used to be a deliberate *subset* of the route guards, because
// most routes had no guard at all. Now every route has one, keyed by the same
// capability the nav item states, and the two are checkable against each other.
//
// Also covered, as before: every nav label and group heading resolves in BOTH
// locales, and every destination belongs to exactly one sidebar group.

import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';
import { Permission, ROLE_PERMISSIONS } from '@fit/types';
import { NAV_GROUPS, NAV_ITEMS, visibleNavItems } from './nav';
import { defaultPermissionsForRole } from './console-permissions.fixture';
import { ROUTE_PERMISSIONS, routeGuardForPath } from './route-guards';
import { hasRoleAtLeast, isStaff, ROLES, type Role } from './auth-session';

/** Every role that can legitimately reach the admin console (a MEMBER cannot). */
const STAFF_ROLES: Role[] = ROLES.filter((role) => isStaff(role));

/** The nav a role sees at a gym that has configured nothing — today's behaviour. */
function defaultNav(role: Role): string[] {
  return visibleNavItems(defaultPermissionsForRole(role)).map((item) => item.href);
}

/** Resolve a dotted `admin`-namespaced key against a locale catalogue, or undefined. */
function lookup(catalogue: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalogue.admin);
}

describe('sidebar nav ⇄ route guards', () => {
  it('gates every nav item exactly as its destination is gated', () => {
    for (const item of NAV_ITEMS) {
      const guard = routeGuardForPath(item.href);
      expect(guard, `${item.href} has no route guard — the page opens for any staff session`)
        .not.toBeNull();
      expect(
        item.permission,
        `nav "${item.href}" and its route guard require different capabilities`,
      ).toBe(guard?.permission);
      expect(
        item.minRole,
        `nav "${item.href}" and its route guard require different minimum roles`,
      ).toBe(guard?.minRole);
    }
  });

  it.each(STAFF_ROLES)('no visible link 403s for %s', (role) => {
    const permissions = defaultPermissionsForRole(role);
    for (const item of visibleNavItems(permissions)) {
      const guard = routeGuardForPath(item.href);
      if (guard?.permission) {
        expect(
          permissions.grants.includes(guard.permission),
          `${role} sees "${item.href}" without holding ${guard.permission} — the link would 403`,
        ).toBe(true);
      }
      if (guard?.minRole) {
        expect(
          hasRoleAtLeast(role, guard.minRole),
          `${role} sees "${item.href}" but is below its floor "${guard.minRole}"`,
        ).toBe(true);
      }
    }
  });

  it('offers every ungated-by-floor page the role holds the capability for', () => {
    // The other direction: a page an operator may open must be in the rail, or
    // the only way to reach it is to know the URL — and the permission editor's
    // toggle for it looks broken.
    for (const role of STAFF_ROLES) {
      const shown = new Set(defaultNav(role));
      const permissions = defaultPermissionsForRole(role);
      for (const item of NAV_ITEMS) {
        const guard = routeGuardForPath(item.href);
        const holdsCapability =
          guard?.permission === undefined || permissions.grants.includes(guard.permission);
        const clearsFloor = guard?.minRole === undefined || hasRoleAtLeast(role, guard.minRole);
        if (holdsCapability && clearsFloor) {
          expect(shown.has(item.href), `${role} may open ${item.href} but the rail hides it`).toBe(
            true,
          );
        }
      }
    }
  });

  it('gates the routes that used to have no guard at all', () => {
    // The hole this feature would otherwise have opened: these opened for any
    // staff session, with only the API declining the data. Un-ticking "view
    // members" would then have hidden the link and left the page reachable.
    for (const href of [
      '/members',
      '/trainers',
      '/classes',
      '/payments',
      '/packages',
      '/shop',
      '/services',
      '/pos',
      '/reports',
      '/locations',
    ]) {
      expect(
        routeGuardForPath(href)?.permission,
        `${href} is not capability-gated`,
      ).toBeDefined();
    }
  });

  it('matches nested paths, and the dashboard index only exactly', () => {
    expect(routeGuardForPath('/members/abc/edit')?.permission).toBe(Permission.MemberRead);
    // As a prefix, `/` would swallow the whole console — `/members` must not
    // resolve to the dashboard's guard.
    expect(routeGuardForPath('/members')?.permission).toBe(Permission.MemberRead);
  });

  it('leaves the console landing page open to every staff session', () => {
    // `ReportView` is an OWNER/MANAGER capability. Gating `/` on it — which the
    // permission matrix's Reports row might suggest, since it lists `/` among its
    // hrefs — would bounce every receptionist and trainer off the console's own
    // home into a 403 whose only exit leads back to it. The page checks the
    // capability itself and renders the rest of the dashboard without it.
    expect(routeGuardForPath('/')?.permission).toBeUndefined();
    expect(routeGuardForPath('/admin')?.permission).toBeUndefined();
    for (const role of ['RECEPTIONIST', 'TRAINER'] as Role[]) {
      expect(defaultNav(role)).toContain('/');
    }
    // …and the destination the row really governs is gated.
    expect(routeGuardForPath('/reports')?.permission).toBe(Permission.ReportView);
  });

  it('tolerates the /admin base path the app is served under', () => {
    expect(routeGuardForPath('/admin/settings')?.permission).toBe(Permission.GymManage);
  });

  it('puts /settings/billing before /settings', () => {
    // Most-specific-first is the ordering contract of the table; a `/settings`
    // entry ahead of it would swallow the more specific rule.
    const specific = ROUTE_PERMISSIONS.findIndex((rule) => rule.prefix === '/settings/billing');
    const general = ROUTE_PERMISSIONS.findIndex((rule) => rule.prefix === '/settings');
    expect(specific).toBeLessThan(general);
  });

  it('gates Settings and the Member portal on GymManage, not on a rank', () => {
    // Both screens' every endpoint requires `GymManage`. Stating the capability
    // rather than OWNER is what keeps the route and the API in step when a gym
    // grants `GymManage` to someone else — a rank is not something the editor can
    // hand out.
    for (const href of ['/settings', '/settings/billing', '/member-portal']) {
      expect(routeGuardForPath(href)?.permission).toBe(Permission.GymManage);
      expect(routeGuardForPath(href)?.minRole).toBeUndefined();
    }
    // …and by default that is still OWNER-only, so nothing changed for a gym
    // that has configured nothing.
    for (const role of ['MANAGER', 'RECEPTIONIST', 'TRAINER'] as const) {
      expect(ROLE_PERMISSIONS[role] as readonly Permission[]).not.toContain(Permission.GymManage);
      expect(defaultNav(role)).not.toContain('/settings');
      expect(defaultNav(role)).not.toContain('/member-portal');
    }
    expect(defaultNav('OWNER')).toContain('/settings');
  });

  it('keeps /staff on its OWNER floor even though MANAGER holds StaffManage', () => {
    // The one deliberate divergence between console policy and the capability
    // the API enforces. Asserted so that changing it is a decision rather than a
    // side effect — see `lib/route-guards.ts`.
    expect(routeGuardForPath('/staff')?.permission).toBe(Permission.StaffManage);
    expect(routeGuardForPath('/staff')?.minRole).toBe('OWNER');
    expect(ROLE_PERMISSIONS.MANAGER as readonly Permission[]).toContain(Permission.StaffManage);
    expect(defaultNav('MANAGER')).not.toContain('/staff');
    expect(defaultNav('OWNER')).toContain('/staff');
  });

  it('shows the Growth group to an OWNER and to a MANAGER', () => {
    for (const role of ['OWNER', 'MANAGER'] as Role[]) {
      expect(defaultNav(role)).toEqual(expect.arrayContaining(['/automation', '/marketing']));
    }
  });

  it('hides the Growth routes from a RECEPTIONIST', () => {
    expect(defaultNav('RECEPTIONIST')).not.toContain('/automation');
    expect(defaultNav('RECEPTIONIST')).not.toContain('/marketing');
  });

  it('renders no links when the permissions could not be resolved', () => {
    // Fails closed: `null` is "we do not know", and an unknown operator is shown
    // nothing rather than the defaults their role would otherwise hold.
    expect(visibleNavItems(null)).toEqual([]);
  });
});

describe('a gym that revokes a capability', () => {
  it('drops the nav item AND closes the route', () => {
    const receptionist = defaultPermissionsForRole('RECEPTIONIST');
    expect(visibleNavItems(receptionist).map((item) => item.href)).toContain('/members');

    const revoked = {
      ...receptionist,
      grants: receptionist.grants.filter((grant) => grant !== Permission.MemberRead),
    };
    expect(visibleNavItems(revoked).map((item) => item.href)).not.toContain('/members');
    // And the route the vanished link pointed at now requires something they no
    // longer hold — which is what the dashboard layout gate reads.
    expect(revoked.grants).not.toContain(routeGuardForPath('/members')?.permission);
  });
});

describe('nav grouping', () => {
  it('places every nav destination in exactly one group', () => {
    const grouped = NAV_GROUPS.flatMap((group) => group.hrefs);
    for (const item of NAV_ITEMS) {
      const count = grouped.filter((href) => href === item.href).length;
      expect(count, `${item.href} appears in ${count} groups, expected exactly 1`).toBe(1);
    }
  });

  it('lists no group href that is not a real nav item', () => {
    const known = new Set(NAV_ITEMS.map((item) => item.href));
    for (const group of NAV_GROUPS) {
      for (const href of group.hrefs) {
        expect(known.has(href), `group "${group.labelKey}" references unknown href ${href}`).toBe(
          true,
        );
      }
    }
  });
});

describe('nav i18n coverage', () => {
  const keys = [
    ...NAV_ITEMS.map((item) => item.labelKey),
    ...NAV_GROUPS.map((group) => group.labelKey),
  ];

  it.each(keys)('"%s" resolves to a string in English', (key) => {
    expect(typeof lookup(en, key)).toBe('string');
  });

  it.each(keys)('"%s" resolves to a string in Georgian', (key) => {
    expect(typeof lookup(ka, key)).toBe('string');
  });
});
