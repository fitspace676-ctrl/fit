import type { ReactNode } from 'react';
import { Permission, roleHasPermission } from '@fit/types';
import { AdminShell, type ShellSystemState } from '@/components/admin-shell';
import { getActiveGymSlug } from '@/lib/active-gym';
import { getServerSession } from '@/lib/session';
import { fetchCheckInStats } from '@/lib/api';

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
  const [gymSlug, session] = await Promise.all([getActiveGymSlug(), getServerSession()]);

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

  return (
    <AdminShell gymSlug={gymSlug} system={system}>
      {children}
    </AdminShell>
  );
}
