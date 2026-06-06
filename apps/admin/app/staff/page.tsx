import type { Metadata } from 'next';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchStaff } from '@/lib/api';
import { InviteForm } from './invite-form';
import { PendingInvites } from './pending-invites';
import { StaffTable } from './staff-table';

export const metadata: Metadata = {
  title: 'Staff — Fit Admin',
  description: 'Invite staff, assign roles, and manage your gym’s team.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The staff management page (T4.7). Server-renders the gym's active staff and its
 * pending invitations from `GET /staff`, with an invite form on top. The whole
 * `/staff` route already requires an `OWNER` session (middleware + the API's
 * `StaffManage` guard), so the only failure handled here is the API call itself.
 * The signed-in user's id is passed to the table so it can flag their own row and
 * stop them removing themselves.
 */
export default async function StaffPage() {
  const session = await getServerSession();

  let content;
  try {
    const { staff, invites } = await fetchStaff();
    content = (
      <>
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Team</h2>
          <StaffTable staff={staff} currentUserId={session?.userId ?? null} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pending invitations
          </h2>
          <PendingInvites invites={invites} />
        </section>
      </>
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load staff (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Staff</h1>
        <p className="max-w-2xl text-sm text-slate-500">
          Invite people to your team, assign their role, and remove anyone who should no longer have
          access. Invitations are emailed a one-time link and expire after 7 days.
        </p>
      </header>

      <InviteForm />

      {content}
    </div>
  );
}
