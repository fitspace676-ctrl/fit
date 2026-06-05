import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { MemberForm } from '../member-form';

export const metadata: Metadata = {
  title: 'New member — Fit Admin',
};

// Reflects the staff session and writes live tenant state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Create-a-member page (T4.3). The middleware already requires a staff session to
 * reach `/members`, but creating is a `MemberWrite` capability that isn't linear
 * by role (a RECEPTIONIST has it, a TRAINER does not), so the page itself gates on
 * the permission and bounces an under-privileged staffer to `/403`. The form and
 * the Server Action it calls both re-check, and the API enforces it again.
 */
export default async function NewMemberPage() {
  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.MemberWrite)) {
    redirect('/403');
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/members" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to members
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New member</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Add a member to your gym. If someone with this email already belongs to another gym,
          they’ll be linked rather than duplicated.
        </p>
      </header>

      <MemberForm mode="create" />
    </div>
  );
}
