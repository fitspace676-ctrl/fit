import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ClassTemplateForm } from '../class-template-form';
import { loadRelationOptions } from '../options';

export const metadata: Metadata = {
  title: 'New class — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-class-template page (T5.2). The middleware already requires a staff
 * session to reach `/classes`, but creating is a `ClassWrite` capability that
 * isn't linear by role (a MANAGER has it, a RECEPTIONIST does not), so the page
 * itself gates on the permission and bounces an under-privileged staffer to
 * `/403`. The form and the Server Action it calls both re-check, and the API
 * enforces it again. The gym's active trainers + locations are loaded for the
 * form's optional default-assignment selects.
 */
export default async function NewClassTemplatePage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ClassWrite)) {
    redirect('/403');
  }

  const { trainers, locations } = await loadRelationOptions();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/classes" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to classes
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New class</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Add a recurring class to your gym. Set its capacity and duration, build the schedule with
          the visual recurrence editor, and pick a default trainer and location.
        </p>
      </header>

      <ClassTemplateForm mode="create" trainers={trainers} locations={locations} />
    </div>
  );
}
