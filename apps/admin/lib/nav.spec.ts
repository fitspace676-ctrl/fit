// @fit/admin — navigation ⇄ route-guard ⇄ i18n consistency guard (T12.18).
//
// The Phase 12 audit's core acceptance criteria, encoded as regression tests:
//
//   • Sidebar nav shows correctly per role with NO /403 bounces — every link
//     `visibleNavItems` renders for a role must clear that route's minimum-role
//     guard in `ROUTE_PERMISSIONS`, or the user would click a visible link and
//     be forbidden. This is the invariant the two gates (nav vs middleware) must
//     never drift on.
//   • Every new route is permission-gated — the Growth-area routes (CRM,
//     Automation, Marketing, Loyalty) each resolve to a required role.
//   • Every nav label + group heading has an i18n key present in BOTH locales,
//     so no locale renders a raw key.
//   • Every nav destination belongs to exactly one sidebar group (no orphan
//     links dropped from the rail).

import { describe, expect, it } from 'vitest';
import { en, ka } from '@fit/i18n';
import { roleHasPermission } from '@fit/types';
import { NAV_GROUPS, NAV_ITEMS, visibleNavItems } from './nav';
import { hasRoleAtLeast, isStaff, requiredRoleForPath, ROLES, type Role } from './auth-session';

/** Every role that can legitimately reach the admin console (a MEMBER cannot). */
const STAFF_ROLES: Role[] = ROLES.filter((role) => isStaff(role));

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
  it.each(STAFF_ROLES)('no visible link 403s for %s', (role) => {
    for (const item of visibleNavItems(role)) {
      const required = requiredRoleForPath(item.href);
      if (required) {
        expect(
          hasRoleAtLeast(role, required),
          `${role} sees "${item.href}" but is below its required role "${required}" — the link would bounce to /403`,
        ).toBe(true);
      }
    }
  });

  it('every visible link also holds the capability it is gated on', () => {
    for (const role of STAFF_ROLES) {
      for (const item of visibleNavItems(role)) {
        if (item.permission) {
          expect(
            roleHasPermission(role, item.permission),
            `${role} sees "${item.href}" without holding ${item.permission}`,
          ).toBe(true);
        }
      }
    }
  });

  it('gates the Phase 12 Growth routes behind a minimum role', () => {
    for (const href of ['/crm', '/automation', '/marketing', '/loyalty']) {
      expect(
        requiredRoleForPath(href),
        `${href} is not role-gated in ROUTE_PERMISSIONS`,
      ).not.toBeNull();
    }
  });

  it('shows the Growth group to an OWNER and to a MANAGER', () => {
    for (const role of ['OWNER', 'MANAGER'] as Role[]) {
      const hrefs = visibleNavItems(role).map((item) => item.href);
      expect(hrefs).toEqual(
        expect.arrayContaining(['/crm', '/automation', '/marketing', '/loyalty']),
      );
    }
  });

  it('hides Automation and Marketing from a RECEPTIONIST but keeps CRM + Loyalty', () => {
    const hrefs = visibleNavItems('RECEPTIONIST').map((item) => item.href);
    expect(hrefs).toContain('/crm');
    expect(hrefs).toContain('/loyalty');
    expect(hrefs).not.toContain('/automation');
    expect(hrefs).not.toContain('/marketing');
  });

  it('renders no links for a signed-out (null) role', () => {
    expect(visibleNavItems(null)).toEqual([]);
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
