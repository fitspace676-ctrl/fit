import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { TrainerForm } from '../trainer-form';

export const metadata: Metadata = {
  title: 'New trainer — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-trainer page (T4.4). The middleware already requires a staff session to
 * reach `/trainers`, but creating is a `TrainerWrite` capability that isn't linear
 * by role (a MANAGER has it, a RECEPTIONIST does not), so the page itself gates on
 * the permission and bounces an under-privileged staffer to `/403`. The form and
 * the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewTrainerPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.TrainerWrite)) {
    redirect('/403');
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/trainers" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to trainers
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New trainer</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Add a trainer to your gym’s roster. Upload a photo and list their specialties so members
          can find the right coach.
        </p>
      </header>

      <TrainerForm mode="create" />
    </div>
  );
}
