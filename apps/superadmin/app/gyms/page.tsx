import type { Metadata } from 'next';
import { fetchGyms, ApiError } from '@/lib/api';
import { GymsTable } from './gyms-table';

export const metadata: Metadata = {
  title: 'Gyms - FormaCore SuperAdmin',
  description: 'Platform-wide gym roster: status, members, MRR, and operator actions.',
};

// The roster reflects live tenant state and the operator's session token, so it
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The operator gyms console (T2.12). Server-renders the platform-wide roster
 * from `GET /admin/gyms` and hands it to the client table, which drives the
 * suspend/reactivate and impersonate actions. Reaching this page already implies
 * a verified SUPER_ADMIN — `middleware.ts` gates the whole app — so the only
 * failure handled here is the API call itself.
 */
export default async function GymsPage() {
  let content;
  try {
    const { gyms } = await fetchGyms();
    content = <GymsTable gyms={gyms} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load gyms (${error.status}): ${error.message}`
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
        {message}
      </p>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-gutter">
      <header className="flex flex-col gap-1">
        <span className="w-fit rounded-card bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
          @fit/superadmin
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Gyms</h1>
        <p className="text-slate-500">
          Every gym across the platform. Suspend a tenant to block its staff and members from new
          sessions, or impersonate an owner for support — impersonation is always audit-logged.
        </p>
      </header>
      {content}
    </main>
  );
}
