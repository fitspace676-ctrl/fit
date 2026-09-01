import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { DEFAULT_CURRENCY, Permission } from '@fit/types';
import { AdminShell, type ShellLocation, type ShellSystemState } from '@/components/admin-shell';
import { ActiveLocationProvider } from '@/components/active-location';
import { ConsolePermissionsProvider } from '@/components/console-permissions';
import { ConsoleRouteGate } from '@/components/route-gate';
import { GymCurrencyProvider } from '@/components/gym-currency';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { IMPERSONATION_META_COOKIE, parseImpersonationMeta } from '@/lib/impersonation';
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_COLLAPSED_VALUE } from '@/lib/sidebar-collapse';
import { CONSOLE_PATHNAME_HEADER } from '@/lib/console-pathname';
import { branchAccess, consoleCan, permittedLocations } from '@/lib/console-permissions';
import { getConsolePermissions } from '@/lib/permissions-server';
import { routeGuardForPath } from '@/lib/route-guards';
import {
  ACTIVE_LOCATION_COOKIE,
  clampActiveLocation,
  resolveActiveLocation,
} from '@/lib/active-location';
import { fetchActiveLocations } from '@/lib/active-location-server';
import { getActiveGymSlug } from '@/lib/active-gym';
import { hasRoleAtLeast, ROLES, type Role } from '@/lib/auth-session';
import { fetchCheckInStats, fetchGymSettings } from '@/lib/api';

/**
 * Authenticated console layout. Every page under this route group renders inside
 * the {@link AdminShell} (sidebar + top bar). The active gym slug is resolved on
 * the server from the request host and handed to the shell for display.
 *
 * **This is also the console's route gate.** `middleware.ts` answers what a JWT
 * can answer on its own — is there a session, is it staff — and stops there,
 * because what a route actually requires is a CAPABILITY, what a role holds is
 * editable per gym, and the Edge cannot cheaply read a gym's settings. Those
 * settings are already fetched here, and this layout runs before any page below
 * it renders, so this is where the two meet. See `lib/route-guards.ts` for the
 * route→capability map and `lib/console-permissions.ts` for the resolution.
 *
 * The permission set is resolved ONCE and shared through context, exactly as the
 * gym's currency is: the sidebar, the branch switcher and every `usePermissions()`
 * call below read the same object, so the rail cannot offer a link the gate would
 * refuse.
 *
 * The sidebar's Check-in count badge and the SYSTEM status widget are backed by a
 * REAL, cheap `GET /admin/check-ins/stats` call here on the server: its result is
 * today's arrivals (the badge), and whether it resolved at all is the live
 * "API reachable" signal the SYSTEM widget ties "online" to (never a constant). A
 * caller without `MemberRead` (or a gym that errors) simply reports offline / no
 * badge — the console still renders.
 *
 * Public pages (`/403`, the sign-in flow) live outside this group, so they render
 * on the bare root layout with no console chrome — which is also what keeps the
 * redirect below from looping back into this gate.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [gymSlug, cookieStore, headerStore, permissions] = await Promise.all([
    getActiveGymSlug(),
    cookies(),
    headers(),
    // Resolves the session itself, and is memoised for the render pass — so every
    // page below that asks shares this one round trip and this one answer.
    getConsolePermissions(),
  ]);

  // ---------------------------------------------------------------------------
  // The route gate
  // ---------------------------------------------------------------------------

  // Which route this layout is wrapping. Layouts are never handed a pathname, so
  // middleware forwards it — see `lib/console-pathname.ts`.
  //
  // A MISSING HEADER DENIES. Middleware runs on every console route, so its
  // absence means the request did not come through the gate at all, and a gate
  // that cannot tell which route it is guarding must not guess that the answer is
  // "allowed". The alternative — treating an unknown path as ungated — would make
  // every route reachable by anyone who could get this header stripped.
  const pathname = headerStore.get(CONSOLE_PATHNAME_HEADER);
  if (pathname === null) {
    redirect('/403');
  }

  const guard = routeGuardForPath(pathname);
  // `null` is "no rule covers this path", not "denied" — an unknown path is a
  // 404's problem, and the staff gate has already turned away everyone who has no
  // business in the console.
  if (guard) {
    if (guard.permission && !consoleCan(permissions, guard.permission)) {
      redirect('/403');
    }
    // The role floor, where a route carries one. Only `/staff` does; see
    // `lib/route-guards.ts` for why it is stated separately from the capability.
    if (guard.minRole) {
      const role = (ROLES as readonly string[]).includes(permissions.role)
        ? (permissions.role as Role)
        : null;
      if (role === null || !hasRoleAtLeast(role, guard.minRole)) {
        redirect('/403');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The chrome
  // ---------------------------------------------------------------------------

  // Seed the sidebar's collapsed state from its cookie so the rail is painted at
  // its final width — the client provider starts from the same value.
  const sidebarCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === SIDEBAR_COLLAPSED_VALUE;

  // Present only while a platform operator is acting as this gym's owner. Every
  // screen below renders exactly as it does for the owner — which is the point,
  // and exactly why the banner has to be there to say so.
  const impersonation = parseImpersonationMeta(cookieStore.get(IMPERSONATION_META_COOKIE)?.value);

  let system: ShellSystemState = { online: false, checkInCount: null };
  if (consoleCan(permissions, Permission.MemberRead)) {
    try {
      const stats = await fetchCheckInStats();
      system = { online: true, checkInCount: stats.checkedInToday };
    } catch {
      // API unreachable or errored — SYSTEM widget shows offline, badge omitted.
      system = { online: false, checkInCount: null };
    }
  }

  // The gym prices in one currency (Settings → General). Read once here and shared
  // through context so no money surface has to invent a fallback of its own — the
  // POS till, the product form and the plan form all used to hardcode USD.
  const currency = await fetchGymSettings().then(
    (settings) => settings.locale.currency,
    () => DEFAULT_CURRENCY,
  );

  // The top-bar branch switcher is populated from the gym's active locations,
  // NARROWED to the ones this operator may use. A role scoped to its assigned
  // branches is never offered one it does not hold — an option that snaps back on
  // choosing it reads as a broken control rather than as a policy — and the same
  // narrowing decides what "All locations" means, which for such a role is
  // nothing, so the option is withheld entirely.
  //
  // Gated by LocationRead; on any failure the switcher simply stays empty.
  // `fetchActiveLocations` is request-memoised, so a page below that resolves the
  // active branch for its own fetch reuses this roster rather than asking again.
  let roster: ShellLocation[] = [];
  if (consoleCan(permissions, Permission.LocationRead)) {
    roster = await fetchActiveLocations();
  }
  const locations = permittedLocations(permissions, roster);
  const access = branchAccess(permissions, roster);

  // Seed the branch filter from its cookie, validated against the live roster and
  // then clamped to what this operator may select, so the switcher paints a real,
  // permitted branch on the first frame. A URL `?locationId=` outranks the cookie,
  // but layouts are never handed `searchParams` — the provider reconciles that
  // itself via `useSearchParams()`, and clamps it the same way.
  const activeLocation = clampActiveLocation(
    resolveActiveLocation(undefined, cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value, locations),
    access,
  );

  return (
    <ConsolePermissionsProvider permissions={permissions}>
      <GymCurrencyProvider currency={currency}>
        <ActiveLocationProvider initial={activeLocation} locations={locations} access={access}>
          <AdminShell
            gymSlug={gymSlug}
            system={system}
            locations={locations}
            sidebarCollapsed={sidebarCollapsed}
            // Into the shell's own banner slot, not above it: the shell is exactly
            // one viewport tall, so a bar stacked on top of it is a bar's worth of
            // document scroll. See the `banner` prop's note in `admin-shell.tsx`.
            banner={impersonation ? <ImpersonationBanner meta={impersonation} /> : null}
          >
            {/* The gate's client half. This layout's own check above covers every
                fresh request; a SHARED layout is not re-rendered on a client-side
                navigation between two routes below it, so without this a denied
                route would still open on a click. See `components/route-gate.tsx`. */}
            <ConsoleRouteGate>{children}</ConsoleRouteGate>
          </AdminShell>
        </ActiveLocationProvider>
      </GymCurrencyProvider>
    </ConsolePermissionsProvider>
  );
}
