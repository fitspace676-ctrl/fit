import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchMember } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
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
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          Back to members
        </Link>
        <Card className="flex items-start gap-3 bg-danger-50 p-4 dark:bg-danger-500/10">
          <Icon
            name="info"
            className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
          />
          <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
            {message}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/members/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to member
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Edit member
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Update {member.name}’s contact details.
        </p>
      </header>

      <MemberForm
        mode="edit"
        memberId={id}
        initial={{ name: member.name, email: member.email, phone: member.phone ?? '' }}
      />
    </div>
  );
}
