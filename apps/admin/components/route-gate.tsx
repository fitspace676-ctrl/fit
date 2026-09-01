'use client';

// @fit/admin — the route gate's client half.
//
// WHY THERE IS A CLIENT HALF AT ALL. `app/(dashboard)/layout.tsx` gates every
// route on the capability it requires, and that is the gate that matters: it runs
// on the server, before any page renders, and nothing in the browser can talk it
// out of its answer. But it only runs when the layout runs — and under the App
// Router a SHARED layout is not re-rendered on a client-side navigation between
// two routes below it. Partial rendering is the whole point of the router: moving
// from `/members` to `/settings` fetches the new page's segment and keeps the
// layout exactly as it is.
//
// So the server gate covers every fresh request (a typed URL, a reload, a link
// from outside, a bookmark, the first paint of any session) and this covers the
// clicks in between. It is not a second security boundary — a client cannot be
// one, and the API refuses the data regardless — it is what keeps a denied route
// from OPENING mid-session, which is what "the page does not open" has to mean to
// someone actually using the console.
//
// It reads the same table (`lib/route-guards.ts`) against the same resolved
// permissions (`components/console-permissions.tsx`) as the server, so the two
// cannot reach different answers about the same path.

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { hasRoleAtLeast, ROLES, type Role } from '@/lib/auth-session';
import { consoleCan, type ConsolePermissions } from '@/lib/console-permissions';
import { routeGuardForPath } from '@/lib/route-guards';
import { useConsolePermissions } from './console-permissions';

/** App base path (`/admin` behind the tenant proxy), stripped before matching. */
const BASE_PATH = process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? '';

/** Normalise the router pathname to the app-relative path the guard table speaks. */
function appPath(pathname: string): string {
  if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
    return pathname.slice(BASE_PATH.length) || '/';
  }
  return pathname;
}

/**
 * Whether this operator may open `pathname` — the same two checks the dashboard
 * layout makes, in the same order.
 *
 * Exported for the layout's own test surface and for anything that needs to ask
 * before navigating; the answer is pure, so both sides of the boundary can share
 * it rather than restating it.
 */
export function mayOpenRoute(permissions: ConsolePermissions, pathname: string): boolean {
  const guard = routeGuardForPath(appPath(pathname));
  if (!guard) {
    // No rule covers this path. That is "unknown route", not "denied" — a 404's
    // problem — and the staff gate in `middleware.ts` has already turned away
    // everyone who has no business in the console.
    return true;
  }
  if (guard.permission && !consoleCan(permissions, guard.permission)) {
    return false;
  }
  if (guard.minRole) {
    const role = (ROLES as readonly string[]).includes(permissions.role)
      ? (permissions.role as Role)
      : null;
    return role !== null && hasRoleAtLeast(role, guard.minRole);
  }
  return true;
}

/**
 * Render `children` only while the current route is one this operator may open;
 * otherwise send them to `/403`.
 *
 * The redirect is `replace`, not `push`: the denied URL should not sit in the
 * history for the back button to return to, which would bounce them straight
 * back out again.
 *
 * Nothing is rendered in the denied frame. Showing the page and then navigating
 * away would paint a screenful of a place they were refused — briefly, but
 * legibly, and in a screenshot indistinguishable from having been let in.
 */
export function ConsoleRouteGate({ children }: { children: ReactNode }) {
  const permissions = useConsolePermissions();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = mayOpenRoute(permissions, pathname);

  useEffect(() => {
    if (!allowed) {
      router.replace('/403');
    }
  }, [allowed, router]);

  return allowed ? <>{children}</> : null;
}
