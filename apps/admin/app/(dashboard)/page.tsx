import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — Fit Admin',
};

/**
 * Console landing page. The real dashboard widgets land in later tasks; for now
 * it confirms the authenticated shell (sidebar + top bar) renders around page
 * content.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
      <p className="max-w-md text-sm text-slate-500">
        Welcome to the Fit admin console. Use the navigation to manage members, workouts, billing,
        and staff — you only see the areas your role can access.
      </p>
    </div>
  );
}
