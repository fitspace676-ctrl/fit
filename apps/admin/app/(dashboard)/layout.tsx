import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { DEFAULT_CURRENCY, Permission, roleHasPermission } from '@fit/types';
import { AdminShell, type ShellLocation, type ShellSystemState } from '@/components/admin-shell';
import { ActiveLocationProvider } from '@/components/active-location';
import { GymCurrencyProvider } from '@/components/gym-currency';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { IMPERSONATION_META_COOKIE, parseImpersonationMeta } from '@/lib/impersonation';
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_COLLAPSED_VALUE } from '@/lib/sidebar-collapse';
import { ACTIVE_LOCATION_COOKIE, resolveActiveLocation } from '@/lib/active-location';
import { fetchActiveLocations } from '@/lib/active-location-server';
import { getActiveGymSlug } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchCheckInStats, fetchGymSettings } from '@/lib/api';

/**
 * Authenticated console layout. Every page under this route group renders inside
 * the {@link AdminShell} (sidebar + top bar). The active gym slug is resolved on
 * the server from the request host and handed to the shell for display.
 *
 * The sidebar's Check-in count badge and the SYSTEM status widget are backed by a
 * REAL, cheap `GET /admin/check-ins/stats` call here on the server: its result is
 * today's arrivals (the badge), and whether it resolved at all is the live
 * "API reachable" signal the SYSTEM widget ties "online" to (never a constant). A
 * caller without `MemberRead` (or a gym that errors) simply reports offline / no
 * badge — the console still renders.
 *
 * Public pages (`/403`, the sign-in flow) live outside this group, so they render
 * on the bare root layout with no console chrome. `middleware.ts` has already
 * authenticated and role-gated the request before anything here renders.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const [gymSlug, session, cookieStore] = await Promise.all([
    getActiveGymSlug(),
    getServerSession(),
    cookies(),
  ]);

  // Seed the sidebar's collapsed state from its cookie so the rail is painted at
  // its final width — the client provider starts from the same value.
  const sidebarCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === SIDEBAR_COLLAPSED_VALUE;

  // Present only while a platform operator is acting as this gym's owner. Every
  // screen below renders exactly as it does for the owner — which is the point,
  // and exactly why the banner has to be there to say so.
  const impersonation = parseImpersonationMeta(cookieStore.get(IMPERSONATION_META_COOKIE)?.value);

  let system: ShellSystemState = { online: false, checkInCount: null };
  if (session && roleHasPermission(session.role, Permission.MemberRead)) {
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

  // The top-bar branch switcher is populated from the gym's active locations.
  // Gated by LocationRead; on any failure the switcher simply stays empty.
  // `fetchActiveLocations` is request-memoised, so a page below that resolves the
  // active branch for its own fetch reuses this roster rather than asking again.
  let locations: ShellLocation[] = [];
  if (session && roleHasPermission(session.role, Permission.LocationRead)) {
    locations = await fetchActiveLocations();
  }

  // Seed the branch filter from its cookie, validated against the live roster, so
  // the switcher paints the real branch on the first frame. A URL `?locationId=`
  // outranks the cookie, but layouts are never handed `searchParams` — the
  // provider reconciles that itself via `useSearchParams()`.
  const activeLocation = resolveActiveLocation(
    undefined,
    cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value,
    locations,
  );

  return (
    <GymCurrencyProvider currency={currency}>
      <ActiveLocationProvider initial={activeLocation} locations={locations}>
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
          {children}
        </AdminShell>
      </ActiveLocationProvider>
    </GymCurrencyProvider>
  );
}
