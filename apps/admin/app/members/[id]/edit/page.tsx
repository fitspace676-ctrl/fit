import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMember } from '@/lib/api';
import { MemberForm } from '../../member-form';

export const metadata: Metadata = {
  title: 'Edit member — Fit Admin',
};

// Reflects the staff session and writes live member state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-member page (T4.3). Like {@link NewMemberPage} it gates on the
 * `MemberWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link MemberForm} prefilled from `GET /members/:id`. A `404` from the
 * API — unknown or cross-tenant id — becomes Next's `notFound()`; the email is
 * shown read-only as the immutable auth identity.
 */
export default async function EditMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.MemberWrite)) {
    redirect('/403');
  }

  let member;
  try {
    member = await fetchMember(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this member (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div className="flex flex-col gap-4">
        <Link href="/members" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to members
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/members/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to member
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit member</h1>
        <p className="text-sm text-slate-500">Update {member.name}’s contact details.</p>
      </header>

      <MemberForm
        mode="edit"
        memberId={id}
        initial={{ name: member.name, email: member.email, phone: member.phone ?? '' }}
      />
    </div>
  );
}
