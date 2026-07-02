import type { Metadata } from 'next';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchStaff } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
import { InviteForm } from './invite-form';
import { StaffView } from './staff-view';

export const metadata: Metadata = {
  title: 'Staff — Fit Admin',
  description: 'Invite staff, assign roles, and manage your gym’s team.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/**
 * The staff management page (T4.7). Server-renders the gym's active staff and its
 * pending invitations from `GET /staff` into the Planflow "formacore" staff
 * screen: page header with the invite-staff modal trigger, People / Invitations
 * tabs, KPI cards, and the staff table. The whole `/staff` route already requires
 * an `OWNER` session (middleware + the API's `StaffManage` guard), so the only
 * failure handled here is the API call itself. The signed-in user's id is passed
 * down so the table can flag their own row and stop them removing themselves.
 */
export default async function StaffPage() {
  const session = await getServerSession();

  let content;
  try {
    const { staff, invites } = await fetchStaff();
    content = <StaffView staff={staff} invites={invites} currentUserId={session?.userId ?? null} />;
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load staff (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card className="flex items-start gap-3 bg-danger-50 p-4 dark:bg-danger-500/10">
        <Icon
          name="info"
          className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-300"
        />
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-200">
          {message}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Staff
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Manage the people who run your gym — roles, access and invitations.
          </p>
        </div>
        <InviteForm />
      </header>

      {content}
    </div>
  );
}
