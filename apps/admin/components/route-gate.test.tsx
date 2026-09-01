// @fit/admin — the route gate's client half.
//
// What is pinned here is the behaviour a person would actually notice: a route
// they may not open does not render, and takes them to `/403` instead — on a
// CLICK, not only on a reload. The server gate in `app/(dashboard)/layout.tsx`
// covers fresh requests; a shared layout is not re-rendered on a client-side
// navigation, which is the gap this closes.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Permission } from '@fit/types';
import { navigationMock } from '@/test/next-navigation-mock';
import { defaultPermissionsForRole } from '@/lib/console-permissions.fixture';
import { DENIED_ACCESS, type ConsolePermissions } from '@/lib/console-permissions';
import { ConsolePermissionsProvider } from './console-permissions';
import { ConsoleRouteGate, mayOpenRoute } from './route-gate';

vi.mock('next/navigation', () => navigationMock.factory());

function renderAt(pathname: string, permissions: ConsolePermissions) {
  navigationMock.setPathname(pathname);
  render(
    <ConsolePermissionsProvider permissions={permissions}>
      <ConsoleRouteGate>
        <p>the page</p>
      </ConsoleRouteGate>
    </ConsolePermissionsProvider>,
  );
}

describe('ConsoleRouteGate', () => {
  beforeEach(() => {
    navigationMock.reset();
  });

  it('renders the page for a route the operator may open', () => {
    renderAt('/members', defaultPermissionsForRole('RECEPTIONIST', ['loc-1']));
    expect(screen.getByText('the page')).toBeInTheDocument();
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });

  it('renders nothing and redirects for a revoked capability', () => {
    // Not "renders the page, then navigates away": a denied screen painted for
    // one frame is still a denied screen, and in a screenshot it is
    // indistinguishable from having been let in.
    const receptionist = defaultPermissionsForRole('RECEPTIONIST', ['loc-1']);
    renderAt('/members', {
      ...receptionist,
      grants: receptionist.grants.filter((grant) => grant !== Permission.MemberRead),
    });
    expect(screen.queryByText('the page')).toBeNull();
    expect(navigationMock.replace).toHaveBeenCalledWith('/403');
  });

  it('replaces rather than pushes, so the back button does not bounce', () => {
    renderAt('/settings', defaultPermissionsForRole('RECEPTIONIST'));
    expect(navigationMock.replace).toHaveBeenCalledWith('/403');
    expect(navigationMock.push).not.toHaveBeenCalled();
  });

  it('denies everything when the permissions could not be resolved', () => {
    renderAt('/members', DENIED_ACCESS);
    expect(screen.queryByText('the page')).toBeNull();
    expect(navigationMock.replace).toHaveBeenCalledWith('/403');
  });

  it('leaves an unguarded route alone', () => {
    // "No rule" is not "denied" — an unknown path is a 404's problem, and the
    // console's own landing page is open to every staff session.
    renderAt('/', defaultPermissionsForRole('TRAINER'));
    expect(screen.getByText('the page')).toBeInTheDocument();
    renderAt('/profile', defaultPermissionsForRole('TRAINER'));
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });
});

describe('mayOpenRoute', () => {
  it('enforces the role floor as well as the capability', () => {
    // MANAGER holds `StaffManage` and the API honours it; the console keeps
    // `/staff` on an OWNER floor. Both halves of the guard have to be read.
    expect(mayOpenRoute(defaultPermissionsForRole('MANAGER'), '/staff')).toBe(false);
    expect(mayOpenRoute(defaultPermissionsForRole('OWNER'), '/staff')).toBe(true);
  });

  it('matches nested paths, not just the prefix itself', () => {
    expect(mayOpenRoute(defaultPermissionsForRole('TRAINER'), '/payments/inv-1/edit')).toBe(false);
    expect(mayOpenRoute(defaultPermissionsForRole('MANAGER'), '/payments/inv-1/edit')).toBe(true);
  });

  it('agrees with itself under the /admin base path', () => {
    expect(mayOpenRoute(defaultPermissionsForRole('RECEPTIONIST'), '/admin/settings')).toBe(false);
    expect(mayOpenRoute(defaultPermissionsForRole('OWNER'), '/admin/settings')).toBe(true);
  });
});
