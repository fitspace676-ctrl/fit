import type { Metadata } from 'next';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchDashboardStats } from '@/lib/api';
import { KpiCard } from './kpi-card';

export const metadata: Metadata = {
  title: 'Dashboard — Fit Admin',
};

// The KPIs reflect live tenant state and the staff session token, so the landing
// page must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * Console landing page (T4.10). For staff who hold {@link Permission.ReportView}
 * (`OWNER` / `MANAGER`) it renders the gym's headline KPI widgets from
 * `GET /dashboard/stats`; lower-privileged staff (who would get a `403` from the
 * endpoint) see the plain welcome message instead, so the page degrades cleanly
 * by role rather than erroring. The API re-checks the permission regardless — this
 * only decides what the landing page offers.
 */
export default async function DashboardPage() {
  const session = await getServerSession();
  const canViewReports = session !== null && roleHasPermission(session.role, Permission.ReportView);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
          Welcome to the FormaCore admin console. Use the navigation to manage members, workouts,
          billing, and staff — you only see the areas your role can access.
        </p>
      </header>

      {canViewReports ? <DashboardKpis /> : null}
    </div>
  );
}

/**
 * The KPI widget grid. Fetches the gym's live counts and renders one card per
 * entity; a failed fetch becomes an inline alert rather than crashing the
 * landing page (the rest of the console is still reachable from the sidebar).
 */
async function DashboardKpis() {
  let stats;
  try {
    stats = await fetchDashboardStats();
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load dashboard stats (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <p
        role="alert"
        className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700 dark:border-danger-500/30 dark:bg-danger-500/10 dark:text-danger-300"
      >
        {message}
      </p>
    );
  }

  return (
    <section
      aria-label="Key metrics"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <KpiCard
        label="Active members"
        value={stats.members.active}
        total={stats.members.total}
        href="/members"
        icon="users"
      />
      <KpiCard
        label="Active trainers"
        value={stats.trainers.active}
        total={stats.trainers.total}
        href="/trainers"
        icon="dumbbell"
      />
      <KpiCard
        label="Active locations"
        value={stats.locations.active}
        total={stats.locations.total}
        href="/locations"
        icon="pin"
      />
      <KpiCard
        label="Active products"
        value={stats.products.active}
        total={stats.products.total}
        href="/products"
        icon="bag"
      />
    </section>
  );
}
