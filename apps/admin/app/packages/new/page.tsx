import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { PackagePlanForm } from '../package-plan-form';

export const metadata: Metadata = {
  title: 'New package plan — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-package-plan page (T4.11). The middleware already requires a staff
 * session to reach `/packages`, but creating is a `PackageWrite` capability that
 * isn't linear by role (a MANAGER has it, a RECEPTIONIST does not), so the page
 * itself gates on the permission and bounces an under-privileged staffer to
 * `/403`. The form and the Server Action it calls both re-check, and the API
 * enforces it again.
 */
export default async function NewPackagePlanPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.PackageWrite)) {
    redirect('/403');
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/packages" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to packages
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New package plan</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Add a personal-training package plan to your gym. Set its price, billing cadence, the
          number of sessions, and the features it includes.
        </p>
      </header>

      <PackagePlanForm mode="create" />
    </div>
  );
}
